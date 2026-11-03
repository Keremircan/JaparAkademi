import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { ScheduleInput, ScheduleItem, ScheduleKind } from "@/lib/schedules";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertUser } from "@/server/authz/policy";
import { db, type DbOrTx, type Tx } from "@/server/db/client";
import { orgUnits, personalSchedules, personnel, positions, scheduleChoices, workSchedules } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { NotFoundError, ValidationError, uniqueViolation } from "@/server/errors";
import {
  copyState,
  normalizeItems,
  pickProgram,
  sameItems,
  todayFlow,
  withCopy,
  type CopyState,
  type ProgramShape,
  type TodayFlow,
} from "@/server/state/schedules";
import { notify, resolveNotifications, resolveNotificationsByPrefix } from "./notifications";
import { getSettings } from "./settings";

/**
 * Çalışma programı (iş paketi 3.9, kararlar #251–257).
 *  - İK (`schedules.manage`; üst yönetici de) pozisyon başına bir ya da birden çok (vardiya) program hazırlar. Onay adımı
 *    yoktur; kaydedilen program hemen geçerli olur. Program yalnızca yol gösterir, uyulup uyulmadığı izlenmez.
 *  - Personel kendi pozisyonunun programını görür; birden çok program varsa vardiyasını seçer ve programı kendine göre
 *    değiştirebilir (vardiya başına ayrı kopya). İK değiştirenleri ve değişikliklerini görür.
 *  - Program güncellenince kopyası eski sürüme göre olan kişiye bildirim gider: yeni programa geçer ya da kendininkini korur.
 *  - Pozisyonu değişen kişinin seçimi ve kopyaları silinir; anonimleştirmede de silinir.
 */

export type ProgramView = ProgramShape & { id: string; name: string; kind: ScheduleKind; version: number; updatedAt: Date };

const programColumns = {
  id: workSchedules.id,
  name: workSchedules.name,
  kind: workSchedules.kind,
  days: workSchedules.days,
  startTime: workSchedules.startTime,
  items: workSchedules.items,
  version: workSchedules.version,
  updatedAt: workSchedules.updatedAt,
};

async function programsOfPosition(conn: DbOrTx, positionId: string): Promise<ProgramView[]> {
  return conn.select(programColumns).from(workSchedules).where(eq(workSchedules.positionId, positionId)).orderBy(asc(workSchedules.createdAt));
}

const activeInPosition = (positionId: string) => and(eq(personnel.positionId, positionId), eq(personnel.status, "active"));

// Bildirim konuları kişiye özeldir: biri karar verince diğerlerinin bildirimi kapanmasın
const updatedSubject = (scheduleId: string, userId: string) => `schedule:${scheduleId}:${userId}`;
const removedPrefix = (userId: string) => `schedule_removed:${userId}:`;

// ---------------------------------------------------------------------------
// İK: programlar
// ---------------------------------------------------------------------------

export type ScheduleOverviewRow = {
  positionId: string;
  positionName: string;
  unitName: string;
  people: number;
  programs: { id: string; name: string; kind: ScheduleKind; choosers: number; copies: number }[];
};

/** Bütün etkin pozisyonlar, kaç kişide geçerli ve programları (seçen ve kendine göre değiştiren sayısıyla). */
export async function scheduleOverview(actor: Actor): Promise<ScheduleOverviewRow[]> {
  assertCan(actor, "schedules.manage");
  const conn = db();
  const rows = await conn
    .select({
      positionId: positions.id,
      positionName: positions.name,
      unitName: orgUnits.name,
      people: sql<number>`(select count(*)::int from ${personnel} where ${personnel.positionId} = ${positions.id} and ${personnel.status} = 'active')`,
    })
    .from(positions)
    .innerJoin(orgUnits, eq(orgUnits.id, positions.orgUnitId))
    .where(eq(positions.status, "active"))
    .orderBy(asc(orgUnits.name), asc(positions.name));
  const programs = await conn
    .select({
      id: workSchedules.id,
      positionId: workSchedules.positionId,
      name: workSchedules.name,
      kind: workSchedules.kind,
      choosers: sql<number>`(select count(*)::int from ${scheduleChoices} c join ${personnel} p on p.user_id = c.user_id where c.schedule_id = ${workSchedules.id} and p.status = 'active')`,
      copies: sql<number>`(select count(*)::int from ${personalSchedules} s join ${personnel} p on p.user_id = s.user_id where s.schedule_id = ${workSchedules.id} and p.status = 'active')`,
    })
    .from(workSchedules)
    .orderBy(asc(workSchedules.createdAt));
  return rows.map((r) => ({
    ...r,
    programs: programs
      .filter((p) => p.positionId === r.positionId)
      .map((p) => ({ id: p.id, name: p.name, kind: p.kind, choosers: p.choosers, copies: p.copies })),
  }));
}

export type ChangedCopy = { userId: string; sicilNo: string; fullName: string; updatedAt: Date; state: CopyState; items: ScheduleItem[] };
export type PositionSchedules = {
  position: { id: string; name: string; unitName: string; people: number };
  programs: (ProgramView & { choosers: number; copies: ChangedCopy[] })[];
};

/** Pozisyonun programları; her programda seçen sayısı ve programını değiştirenler (değişiklikleriyle, karar #255). */
export async function positionSchedules(actor: Actor, positionId: string): Promise<PositionSchedules> {
  assertCan(actor, "schedules.manage");
  const conn = db();
  const [position] = await conn
    .select({
      id: positions.id,
      name: positions.name,
      unitName: orgUnits.name,
      people: sql<number>`(select count(*)::int from ${personnel} where ${personnel.positionId} = ${positions.id} and ${personnel.status} = 'active')`,
    })
    .from(positions)
    .innerJoin(orgUnits, eq(orgUnits.id, positions.orgUnitId))
    .where(eq(positions.id, positionId));
  if (!position) throw new NotFoundError("position");
  const programs = await programsOfPosition(conn, positionId);
  const ids = programs.map((p) => p.id);
  const [choices, copies] = ids.length
    ? await Promise.all([
        conn
          .select({ scheduleId: scheduleChoices.scheduleId })
          .from(scheduleChoices)
          .innerJoin(personnel, eq(personnel.userId, scheduleChoices.userId))
          .where(and(inArray(scheduleChoices.scheduleId, ids), activeInPosition(positionId))),
        conn
          .select({
            scheduleId: personalSchedules.scheduleId,
            userId: personalSchedules.userId,
            sicilNo: personnel.sicilNo,
            fullName: personnel.fullName,
            items: personalSchedules.items,
            baseVersion: personalSchedules.baseVersion,
            updatedAt: personalSchedules.updatedAt,
          })
          .from(personalSchedules)
          .innerJoin(personnel, eq(personnel.userId, personalSchedules.userId))
          .where(and(inArray(personalSchedules.scheduleId, ids), activeInPosition(positionId)))
          .orderBy(asc(personnel.fullName)),
      ])
    : [[], []];
  return {
    position,
    programs: programs.map((p) => ({
      ...p,
      choosers: choices.filter((c) => c.scheduleId === p.id).length,
      copies: copies
        .filter((c) => c.scheduleId === p.id)
        .map((c) => ({
          userId: c.userId,
          sicilNo: c.sicilNo,
          fullName: c.fullName,
          updatedAt: c.updatedAt,
          state: copyState(p.version, c),
          items: c.items,
        })),
    })),
  };
}

/** Düzenleme ekranı için tek program (pozisyonuyla birlikte). */
export async function getWorkSchedule(actor: Actor, scheduleId: string): Promise<ProgramView & { positionId: string }> {
  assertCan(actor, "schedules.manage");
  const [row] = await db()
    .select({ ...programColumns, positionId: workSchedules.positionId })
    .from(workSchedules)
    .where(eq(workSchedules.id, scheduleId));
  if (!row) throw new NotFoundError("schedule");
  return row;
}

function sameDays(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((d, i) => d === b[i]);
}

async function notifyEach(tx: Tx, userIds: readonly string[], build: (userId: string) => Parameters<typeof notify>[1]): Promise<void> {
  for (const userId of new Set(userIds)) await notify(tx, build(userId));
}

/**
 * Programı oluşturur ya da günceller (karar #251). Akış değiştiyse sürüm artar; kopyası eski sürüme göre olanlara
 * bildirim gider (karar #253). Program türü (günlük/haftalık) değişirse eski kopyalar yeni türe uymadığından silinir.
 */
export async function saveWorkSchedule(actor: Actor, positionId: string, scheduleId: string | null, input: ScheduleInput): Promise<{ id: string }> {
  assertCan(actor, "schedules.manage");
  assertUser(actor);
  const normalized = normalizeItems(input.kind, input.items, input.days, input.startTime);
  if (!normalized.ok) throw new ValidationError(normalized.error);
  const values = { name: input.name, kind: input.kind, days: normalized.days, startTime: input.startTime, items: normalized.items, updatedBy: actor.userId };
  try {
    return await withActor(actor, async (tx) => {
      const [position] = await tx.select({ id: positions.id }).from(positions).where(eq(positions.id, positionId));
      if (!position) throw new NotFoundError("position");
      if (!scheduleId) {
        const [row] = await tx
          .insert(workSchedules)
          .values({ positionId, ...values })
          .returning({ id: workSchedules.id });
        return { id: row!.id };
      }
      const [current] = await tx
        .select(programColumns)
        .from(workSchedules)
        .where(and(eq(workSchedules.id, scheduleId), eq(workSchedules.positionId, positionId)))
        .for("update");
      if (!current) throw new NotFoundError("schedule");
      const flowChanged =
        current.kind !== input.kind ||
        current.startTime !== input.startTime ||
        !sameDays(current.days, normalized.days) ||
        !sameItems(current.items, normalized.items);
      if (!flowChanged && current.name === input.name) return { id: scheduleId };
      const version = flowChanged ? current.version + 1 : current.version;
      await tx
        .update(workSchedules)
        .set({ ...values, version })
        .where(eq(workSchedules.id, scheduleId));
      if (!flowChanged) return { id: scheduleId };

      let affected: string[];
      if (current.kind !== input.kind) {
        const removed = await tx
          .delete(personalSchedules)
          .where(eq(personalSchedules.scheduleId, scheduleId))
          .returning({ userId: personalSchedules.userId });
        affected = removed.map((r) => r.userId);
      } else {
        const stale = await tx
          .select({ userId: personalSchedules.userId })
          .from(personalSchedules)
          .where(and(eq(personalSchedules.scheduleId, scheduleId), sql`${personalSchedules.baseVersion} < ${version}`));
        affected = stale.map((r) => r.userId);
      }
      await notifyEach(tx, affected, (userId) => ({
        kind: "schedule_updated",
        userIds: [userId],
        subjectKey: updatedSubject(scheduleId, userId),
        link: "/schedule",
        params: { name: input.name },
        exclude: [actor.userId],
      }));
      return { id: scheduleId };
    });
  } catch (err) {
    if (uniqueViolation(err) === "work_schedules_position_name_unique") throw new ValidationError("schedule_name_taken");
    throw err;
  }
}

/**
 * Programı kaldırır (karar #252): onu seçenlerin seçimi ve programı değiştirenlerin kopyaları da silinir; bu kişilere
 * bildirim gider (pozisyonda başka program varsa yeniden seçerler).
 */
export async function deleteWorkSchedule(actor: Actor, scheduleId: string): Promise<void> {
  assertCan(actor, "schedules.manage");
  await withActor(actor, async (tx) => {
    const [current] = await tx
      .select({ id: workSchedules.id, name: workSchedules.name })
      .from(workSchedules)
      .where(eq(workSchedules.id, scheduleId))
      .for("update");
    if (!current) throw new NotFoundError("schedule");
    const [choosers, owners] = await Promise.all([
      tx.select({ userId: scheduleChoices.userId }).from(scheduleChoices).where(eq(scheduleChoices.scheduleId, scheduleId)),
      tx.select({ userId: personalSchedules.userId }).from(personalSchedules).where(eq(personalSchedules.scheduleId, scheduleId)),
    ]);
    // Seçimler ve kopyalar yabancı anahtarla birlikte silinir (denetim kaydına ayrı ayrı düşer)
    await tx.delete(workSchedules).where(eq(workSchedules.id, scheduleId));
    await resolveNotificationsByPrefix(tx, `schedule:${scheduleId}:`, "schedule_updated");
    await notifyEach(tx, [...choosers, ...owners].map((r) => r.userId), (userId) => ({
      kind: "schedule_removed",
      userIds: [userId],
      subjectKey: `${removedPrefix(userId)}${scheduleId}`,
      link: "/schedule",
      params: { name: current.name },
      exclude: actor.kind === "user" ? [actor.userId] : [],
    }));
  });
}

// ---------------------------------------------------------------------------
// Personel: Programım
// ---------------------------------------------------------------------------

export type MyProgram = ProgramView & { state: CopyState; copyItems: ScheduleItem[] | null; effective: ProgramShape };
export type MySchedule = {
  positionName: string | null;
  programs: { id: string; name: string }[];
  needsChoice: boolean;
  current: MyProgram | null;
};

async function myPosition(conn: DbOrTx, userId: string): Promise<{ positionId: string | null; positionName: string | null }> {
  const [row] = await conn
    .select({ positionId: personnel.positionId, positionName: positions.name })
    .from(personnel)
    .leftJoin(positions, eq(positions.id, personnel.positionId))
    .where(eq(personnel.userId, userId));
  return { positionId: row?.positionId ?? null, positionName: row?.positionName ?? null };
}

/** Kişinin pozisyonundaki programlar, seçtiği (ya da tek olan) program ve kendi kopyası. */
export async function mySchedule(actor: Actor): Promise<MySchedule> {
  assertUser(actor);
  const conn = db();
  const { positionId, positionName } = await myPosition(conn, actor.userId);
  if (!positionId) return { positionName, programs: [], needsChoice: false, current: null };
  const programs = await programsOfPosition(conn, positionId);
  const [choice] = await conn.select({ scheduleId: scheduleChoices.scheduleId }).from(scheduleChoices).where(eq(scheduleChoices.userId, actor.userId));
  const { program, needsChoice } = pickProgram(programs, choice?.scheduleId ?? null);
  const list = programs.map((p) => ({ id: p.id, name: p.name }));
  if (!program) return { positionName, programs: list, needsChoice, current: null };
  const [copy] = await conn
    .select({ items: personalSchedules.items, baseVersion: personalSchedules.baseVersion })
    .from(personalSchedules)
    .where(and(eq(personalSchedules.userId, actor.userId), eq(personalSchedules.scheduleId, program.id)));
  return {
    positionName,
    programs: list,
    needsChoice: false,
    current: { ...program, state: copyState(program.version, copy ?? null), copyItems: copy?.items ?? null, effective: withCopy(program, copy?.items ?? null) },
  };
}

export type HomeFlow =
  | { state: "none" }
  | { state: "choose"; programs: { id: string; name: string }[] }
  | { state: "flow"; name: string; multiple: boolean; own: boolean; startTime: string; flow: TodayFlow };

/** Kişinin programından şu anki vardiya akışı (karar #254); `schedule` mySchedule sonucudur (yetki orada). */
export async function homeFlowOf(schedule: MySchedule, now: Date = new Date()): Promise<HomeFlow> {
  if (schedule.needsChoice) return { state: "choose", programs: schedule.programs };
  if (!schedule.current) return { state: "none" };
  const { "org.timezone": timeZone } = await getSettings(["org.timezone"]);
  return {
    state: "flow",
    name: schedule.current.name,
    multiple: schedule.programs.length > 1,
    own: schedule.current.state !== "follows",
    startTime: schedule.current.startTime,
    flow: todayFlow(schedule.current.effective, now, timeZone),
  };
}

/** Ana sayfadaki "Bugünün akışı" kartı: seçim gerekiyorsa seçim, yoksa şu anki vardiyanın akışı. */
export async function myTodayFlow(actor: Actor, now: Date = new Date()): Promise<HomeFlow> {
  return homeFlowOf(await mySchedule(actor), now);
}

/** Kişinin kendi pozisyonundaki program; başka pozisyonun programına dokunamaz. */
async function ownProgram(tx: Tx, userId: string, scheduleId: string): Promise<ProgramView> {
  const { positionId } = await myPosition(tx, userId);
  const [program] = positionId
    ? await tx
        .select(programColumns)
        .from(workSchedules)
        .where(and(eq(workSchedules.id, scheduleId), eq(workSchedules.positionId, positionId)))
    : [];
  if (!program) throw new NotFoundError("schedule");
  return program;
}

/** Vardiya seçimi (karar #252); dönüşümlü vardiyada kişi seçimini kendisi değiştirir. */
export async function chooseWorkSchedule(actor: Actor, scheduleId: string): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    await ownProgram(tx, actor.userId, scheduleId);
    await tx
      .insert(scheduleChoices)
      .values({ userId: actor.userId, scheduleId })
      .onConflictDoUpdate({ target: scheduleChoices.userId, set: { scheduleId, updatedAt: new Date() } });
    await resolveNotificationsByPrefix(tx, removedPrefix(actor.userId), "schedule_removed");
  });
}

/**
 * Kişinin kendi programı (karar #253). Gün ve vardiya başlangıcı programdan gelir; kişi maddeleri değiştirir.
 * Kopya pozisyon programıyla aynıysa saklanmaz (kişi yeniden programı izler). Kaydetmek güncel sürümü kabul etmektir.
 */
export async function saveMyScheduleCopy(actor: Actor, scheduleId: string, items: readonly ScheduleItem[]): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    const program = await ownProgram(tx, actor.userId, scheduleId);
    const normalized = normalizeItems(program.kind, items, program.days, program.startTime);
    if (!normalized.ok) throw new ValidationError(normalized.error);
    if (sameItems(normalized.items, program.items)) {
      await tx.delete(personalSchedules).where(and(eq(personalSchedules.userId, actor.userId), eq(personalSchedules.scheduleId, scheduleId)));
    } else {
      await tx
        .insert(personalSchedules)
        .values({ userId: actor.userId, scheduleId, items: normalized.items, baseVersion: program.version })
        .onConflictDoUpdate({
          target: [personalSchedules.userId, personalSchedules.scheduleId],
          set: { items: normalized.items, baseVersion: program.version, updatedAt: new Date() },
        });
    }
    await resolveNotifications(tx, updatedSubject(scheduleId, actor.userId), "schedule_updated");
  });
}

/** "Pozisyon programına dön" / "Yeni programa geç": kendi kopyası silinir. */
export async function revertMyScheduleCopy(actor: Actor, scheduleId: string): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    await ownProgram(tx, actor.userId, scheduleId);
    await tx.delete(personalSchedules).where(and(eq(personalSchedules.userId, actor.userId), eq(personalSchedules.scheduleId, scheduleId)));
    await resolveNotifications(tx, updatedSubject(scheduleId, actor.userId), "schedule_updated");
  });
}

/** "Kendi programımı koru": kopya değişmez, güncel sürüm kabul edilmiş sayılır. */
export async function keepMyScheduleCopy(actor: Actor, scheduleId: string): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    const program = await ownProgram(tx, actor.userId, scheduleId);
    const updated = await tx
      .update(personalSchedules)
      .set({ baseVersion: program.version })
      .where(and(eq(personalSchedules.userId, actor.userId), eq(personalSchedules.scheduleId, scheduleId)))
      .returning({ userId: personalSchedules.userId });
    if (updated.length === 0) throw new NotFoundError("schedule_copy");
    await resolveNotifications(tx, updatedSubject(scheduleId, actor.userId), "schedule_updated");
  });
}

// ---------------------------------------------------------------------------
// Pozisyon değişikliği, anonimleştirme, KVKK dışa aktarma (karar #257)
// ---------------------------------------------------------------------------

/** Kişinin şu anki pozisyonuna ait olmayan vardiya seçimi ve kopyaları silinir (pozisyon değişikliğiyle aynı transaction'da). */
export async function dropSchedulesOutsidePosition(tx: Tx, userId: string): Promise<void> {
  const [row] = await tx.select({ positionId: personnel.positionId }).from(personnel).where(eq(personnel.userId, userId));
  const foreign = tx
    .select({ id: workSchedules.id })
    .from(workSchedules)
    .where(row?.positionId ? ne(workSchedules.positionId, row.positionId) : sql`true`);
  await tx.delete(scheduleChoices).where(and(eq(scheduleChoices.userId, userId), inArray(scheduleChoices.scheduleId, foreign)));
  await tx.delete(personalSchedules).where(and(eq(personalSchedules.userId, userId), inArray(personalSchedules.scheduleId, foreign)));
}

/** Anonimleştirilen kişilerin vardiya seçimi ve kendi programları silinir. */
export async function deleteScheduleDataOf(tx: Tx, userIds: readonly string[]): Promise<void> {
  if (userIds.length === 0) return;
  await tx.delete(scheduleChoices).where(inArray(scheduleChoices.userId, [...userIds]));
  await tx.delete(personalSchedules).where(inArray(personalSchedules.userId, [...userIds]));
}

/** KVKK dışa aktarma: kişinin seçtiği vardiya programı ve kendi programları. */
export async function scheduleDataFor(
  conn: DbOrTx,
  userId: string,
): Promise<{ choice: string | null; copies: { name: string; kind: ScheduleKind; items: ScheduleItem[]; updatedAt: Date }[] }> {
  const [[choice], copies] = await Promise.all([
    conn
      .select({ name: workSchedules.name })
      .from(scheduleChoices)
      .innerJoin(workSchedules, eq(workSchedules.id, scheduleChoices.scheduleId))
      .where(eq(scheduleChoices.userId, userId)),
    conn
      .select({ name: workSchedules.name, kind: workSchedules.kind, items: personalSchedules.items, updatedAt: personalSchedules.updatedAt })
      .from(personalSchedules)
      .innerJoin(workSchedules, eq(workSchedules.id, personalSchedules.scheduleId))
      .where(eq(personalSchedules.userId, userId))
      .orderBy(asc(workSchedules.name)),
  ]);
  return { choice: choice?.name ?? null, copies };
}
