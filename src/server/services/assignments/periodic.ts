import ExcelJS from "exceljs";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertUser, can, hasAnyRole } from "@/server/authz/policy";
import { db, type DbOrTx } from "@/server/db/client";
import { assignmentModules, assignments, modules, orgUnits, personnel, planModules, positions, priorTrainings } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { addDays, todayIn } from "@/lib/dates";
import { periodicState, priorExpiry, type PeriodicState } from "@/server/state/periodic";
import { matchKey, parseDate } from "../imports/parse";
import { commonModulesFor } from "../modules";
import { getSettings } from "../settings";
import { createAssignment, OPEN_STATUSES, publishedPlan } from "./engine";

/**
 * Eski personelin periyodik eğitimleri (Faz 3, iş paketi 3.2, kararlar #222–225).
 *  - Kapsam: kişinin şu anki planındaki ve ortak modüllerindeki süreli (geçerlilik ayı olan) teorik modüller.
 *  - Sistem dışı son eğitim tarihi (`prior_trainings`) İK (her modül) ve İSG uzmanı (İSG modülleri) tarafından girilir;
 *    gece işi (`runRecert`) bitişe `recert.lead_days` kala periyodik atamayı açar.
 *  - Tarihi olmayan kişiler için İK "Şimdi başlat" ile periyodik atamayı toplu açar.
 */

export const MAX_PRIOR_ROWS = 5000;
export const MAX_PRIOR_BYTES = 2 * 1024 * 1024;

type PeriodicModule = { id: string; title: string; isOhs: boolean; validityMonths: number };
type Person = { userId: string; fullName: string; sicilNo: string; positionId: string; positionName: string; orgUnitId: string; collarType: "blue" | "white" };

function canView(actor: Actor): boolean {
  return can(actor, "periodic.view");
}

/** Kişinin kaydedebileceği modül: İK her süreli modülü, İSG uzmanı yalnızca İSG modüllerini. */
function canRecordModule(actor: Actor, m: { isOhs: boolean }): boolean {
  if (!can(actor, "periodic.record")) return false;
  return hasAnyRole(actor, ["hr"]) || m.isOhs;
}

/** Aktif, pozisyonu olan personel ve her birinin periyodik (süreli teorik) modülleri. */
async function eligibility(conn: DbOrTx, userIds?: readonly string[]): Promise<{ people: Person[]; byUser: Map<string, PeriodicModule[]> }> {
  const people = (await conn
    .select({
      userId: personnel.userId,
      fullName: personnel.fullName,
      sicilNo: personnel.sicilNo,
      positionId: positions.id,
      positionName: positions.name,
      orgUnitId: positions.orgUnitId,
      collarType: positions.collarType,
    })
    .from(personnel)
    .innerJoin(positions, eq(positions.id, personnel.positionId))
    .where(and(eq(personnel.status, "active"), ...(userIds ? [inArray(personnel.userId, [...userIds])] : [])))
    .orderBy(asc(personnel.fullName))) as Person[];
  const byPosition = new Map<string, string[]>();
  for (const positionId of new Set(people.map((p) => p.positionId))) {
    const plan = await publishedPlan(conn, positionId);
    if (!plan) continue;
    const rows = await conn.select({ id: planModules.moduleId }).from(planModules).where(eq(planModules.planId, plan.planId));
    byPosition.set(positionId, rows.map((r) => r.id));
  }
  const commonByCollar = new Map<string, string[]>();
  for (const collar of ["blue", "white"] as const) commonByCollar.set(collar, (await commonModulesFor(collar, conn)).map((c) => c.id));
  const allIds = [...new Set([...byPosition.values(), ...commonByCollar.values()].flat())];
  const mods = allIds.length
    ? await conn
        .select({ id: modules.id, title: modules.title, isOhs: modules.isOhs, validityMonths: modules.validityMonths, kind: modules.kind, archivedAt: modules.archivedAt })
        .from(modules)
        .where(inArray(modules.id, allIds))
    : [];
  const periodic = new Map(
    mods
      .filter((m) => m.kind === "theory" && m.validityMonths && !m.archivedAt)
      .map((m) => [m.id, { id: m.id, title: m.title, isOhs: m.isOhs, validityMonths: m.validityMonths! }] as const),
  );
  const byUser = new Map<string, PeriodicModule[]>();
  for (const p of people) {
    const plan = byPosition.get(p.positionId);
    if (!plan) continue;
    const ids = [...new Set([...(commonByCollar.get(p.collarType) ?? []), ...plan])];
    const list = ids.map((id) => periodic.get(id)).filter((m): m is PeriodicModule => !!m);
    if (list.length) byUser.set(p.userId, list);
  }
  return { people: people.filter((p) => byUser.has(p.userId)), byUser };
}

type Facts = {
  /** Kişi × modül: sistemdeki son tamamlanış (geçerlilik bitişiyle) */
  completions: Map<string, { completedAt: Date; expiresAt: Date | null }>;
  /** Kişi × modül: en son girilen sistem dışı tarih */
  priors: Map<string, { id: string; completedOn: string }>;
  /** Kişi × modül: açık atamada (tamamlanmamış) */
  open: Set<string>;
  /** Açık ataması olan kişiler */
  openUsers: Set<string>;
};

const key = (userId: string, moduleId: string) => `${userId}:${moduleId}`;

async function facts(conn: DbOrTx, userIds: string[]): Promise<Facts> {
  if (userIds.length === 0) return { completions: new Map(), priors: new Map(), open: new Set(), openUsers: new Set() };
  const done = await conn
    .select({ userId: assignments.userId, moduleId: assignmentModules.moduleId, completedAt: assignmentModules.completedAt, expiresAt: assignmentModules.expiresAt })
    .from(assignmentModules)
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .where(and(inArray(assignments.userId, userIds), eq(assignmentModules.status, "completed")))
    .orderBy(desc(assignmentModules.completedAt));
  const completions = new Map<string, { completedAt: Date; expiresAt: Date | null }>();
  for (const d of done) if (!completions.has(key(d.userId, d.moduleId))) completions.set(key(d.userId, d.moduleId), { completedAt: d.completedAt!, expiresAt: d.expiresAt });
  const priorRows = await conn
    .select({ id: priorTrainings.id, userId: priorTrainings.userId, moduleId: priorTrainings.moduleId, completedOn: priorTrainings.completedOn })
    .from(priorTrainings)
    .where(inArray(priorTrainings.userId, userIds))
    .orderBy(desc(priorTrainings.createdAt));
  const priors = new Map<string, { id: string; completedOn: string }>();
  for (const r of priorRows) if (!priors.has(key(r.userId, r.moduleId))) priors.set(key(r.userId, r.moduleId), { id: r.id, completedOn: r.completedOn });
  const openRows = await conn
    .select({ userId: assignments.userId, moduleId: assignmentModules.moduleId, status: assignmentModules.status })
    .from(assignmentModules)
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .where(and(inArray(assignments.userId, userIds), inArray(assignments.status, [...OPEN_STATUSES])));
  return {
    completions,
    priors,
    open: new Set(openRows.filter((r) => r.status !== "completed").map((r) => key(r.userId, r.moduleId))),
    openUsers: new Set(openRows.map((r) => r.userId)),
  };
}

// ---------------------------------------------------------------------------
// Ekran
// ---------------------------------------------------------------------------

export type PeriodicItem = {
  moduleId: string;
  title: string;
  isOhs: boolean;
  state: PeriodicState;
  source: "system" | "prior" | null;
  lastDate: string | null;
  expiresOn: string | null;
  opensOn: string | null;
};
export type PeriodicRow = { userId: string; fullName: string; sicilNo: string; positionName: string; unitName: string | null; items: PeriodicItem[] };
export type PeriodicFilters = { unitId: string | null; moduleId: string | null; state: PeriodicState | null; q: string | null };

/** Eski personel × süreli modüllerin durumu (karar #222): tarih yok / açılacak / açık. */
export async function periodicOverview(
  actor: Actor,
  f: PeriodicFilters,
): Promise<{
  rows: PeriodicRow[];
  truncated: boolean;
  modules: { id: string; title: string; isOhs: boolean; recordable: boolean }[];
  units: { id: string; name: string; parentName: string | null }[];
  can: { record: boolean; start: boolean };
  leadDays: number;
}> {
  assertUser(actor);
  if (!canView(actor)) throw new ForbiddenError("periodic.view");
  const s = await getSettings(["org.timezone", "recert.lead_days"]);
  const today = todayIn(s["org.timezone"]);
  const { people, byUser } = await eligibility(db());
  const units = await db().select({ id: orgUnits.id, name: orgUnits.name, parentId: orgUnits.parentId }).from(orgUnits).where(eq(orgUnits.isActive, true)).orderBy(asc(orgUnits.name));
  const unitName = new Map(units.map((u) => [u.id, u.name]));
  const subtree = f.unitId ? new Set([f.unitId, ...units.filter((u) => u.parentId === f.unitId).map((u) => u.id)]) : null;
  const q = f.q?.trim().toLocaleLowerCase("tr-TR") ?? "";
  const scoped = people.filter(
    (p) => (!subtree || subtree.has(p.orgUnitId)) && (!q || p.fullName.toLocaleLowerCase("tr-TR").includes(q) || p.sicilNo.toLocaleLowerCase("tr-TR").includes(q)),
  );
  const fx = await facts(db(), scoped.map((p) => p.userId));
  const allModules = new Map<string, PeriodicModule>();
  for (const list of byUser.values()) for (const m of list) allModules.set(m.id, m);

  const rows: PeriodicRow[] = [];
  for (const p of scoped) {
    const items = byUser
      .get(p.userId)!
      .filter((m) => !f.moduleId || m.id === f.moduleId)
      .map((m): PeriodicItem => {
        const k = key(p.userId, m.id);
        const c = fx.completions.get(k);
        const prior = fx.priors.get(k);
        const st = periodicState({
          open: fx.open.has(k),
          systemCompletedOn: c ? todayIn(s["org.timezone"], c.completedAt) : null,
          systemExpiresOn: c?.expiresAt ? todayIn(s["org.timezone"], c.expiresAt) : null,
          priorOn: prior?.completedOn ?? null,
          priorExpiresOn: prior ? priorExpiry(prior.completedOn, m.validityMonths) : null,
          leadDays: s["recert.lead_days"],
        });
        return { moduleId: m.id, title: m.title, isOhs: m.isOhs, ...st, opensOn: st.expiresOn ? maxDate(addDays(st.expiresOn, -s["recert.lead_days"]), today) : null };
      });
    if (f.state && !items.some((i) => i.state === f.state)) continue;
    if (items.length) rows.push({ userId: p.userId, fullName: p.fullName, sicilNo: p.sicilNo, positionName: p.positionName, unitName: unitName.get(p.orgUnitId) ?? null, items });
  }
  const parent = new Map(units.map((u) => [u.id, u.name]));
  return {
    rows: rows.slice(0, 500),
    truncated: rows.length > 500,
    modules: [...allModules.values()]
      .sort((a, b) => a.title.localeCompare(b.title, "tr"))
      .map((m) => ({ id: m.id, title: m.title, isOhs: m.isOhs, recordable: canRecordModule(actor, m) })),
    units: units.map((u) => ({ id: u.id, name: u.name, parentName: u.parentId ? (parent.get(u.parentId) ?? null) : null })),
    can: { record: can(actor, "periodic.record"), start: can(actor, "assignments.manage") },
    leadDays: s["recert.lead_days"],
  };
}

const maxDate = (a: string, b: string) => (a > b ? a : b);

// ---------------------------------------------------------------------------
// Son eğitim tarihi
// ---------------------------------------------------------------------------

function validDate(completedOn: string, today: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(completedOn) || completedOn < "1950-01-01" || completedOn > today) throw new ValidationError("prior_date_invalid");
}

/** Seçilen kişiler için aynı modülde son eğitim tarihi (karar #223). Kayıt değiştirilemez; en son giriş geçerlidir. */
export async function recordPriorTrainings(
  actor: Actor,
  input: { userIds: string[]; moduleId: string; completedOn: string; note: string | null },
): Promise<{ saved: number; skipped: number }> {
  assertUser(actor);
  assertCan(actor, "periodic.record");
  const { "org.timezone": tz } = await getSettings(["org.timezone"]);
  validDate(input.completedOn, todayIn(tz));
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0 || userIds.length > 500) throw new ValidationError("invalid_input");
  const note = input.note?.trim().slice(0, 500) || null;
  return withActor(actor, async (tx) => {
    const [m] = await tx.select({ isOhs: modules.isOhs }).from(modules).where(eq(modules.id, input.moduleId)).limit(1);
    if (!m) throw new ValidationError("module_invalid");
    if (!canRecordModule(actor, m)) throw new ForbiddenError("periodic.record");
    const { byUser } = await eligibility(tx, userIds);
    const eligible = userIds.filter((u) => byUser.get(u)?.some((x) => x.id === input.moduleId));
    if (eligible.length) {
      await tx.insert(priorTrainings).values(
        eligible.map((userId) => ({ userId, moduleId: input.moduleId, completedOn: input.completedOn, note, source: "screen" as const, enteredBy: actor.userId })),
      );
    }
    return { saved: eligible.length, skipped: userIds.length - eligible.length };
  });
}

export type PriorRowError = "sicil_missing" | "person_not_found" | "module_not_found" | "not_permitted" | "date_invalid";
export type PriorPreviewRow = { rowNumber: number; sicilNo: string; fullName: string | null; moduleTitle: string; completedOn: string | null; errors: PriorRowError[] };

type AnalyzedRow = PriorPreviewRow & { userId?: string; moduleId?: string; note: string | null };

/** Dosyayı okuyup satırları doğrular (veritabanına yazmaz). Önizleme ve onay aynı analizi kullanır. */
async function analyzePriorImport(actor: Actor & { kind: "user" }, buffer: Buffer): Promise<{ missingColumns: string[]; rows: AnalyzedRow[]; tooManyRows: boolean }> {
  assertCan(actor, "periodic.record");
  if (buffer.length > MAX_PRIOR_BYTES) throw new ValidationError("file_too_large");
  const parsed = await readPriorWorkbook(buffer);
  if (parsed.missingColumns.length) return { missingColumns: parsed.missingColumns, rows: [], tooManyRows: false };
  const { "org.timezone": tz } = await getSettings(["org.timezone"]);
  const today = todayIn(tz);
  const sicils = [...new Set(parsed.rows.map((r) => r.sicilNo).filter(Boolean))];
  const people = sicils.length
    ? await db().select({ userId: personnel.userId, sicilNo: personnel.sicilNo, fullName: personnel.fullName }).from(personnel).where(inArray(personnel.sicilNo, sicils))
    : [];
  const bySicil = new Map(people.map((p) => [matchKey(p.sicilNo), p]));
  const { byUser } = await eligibility(db(), people.map((p) => p.userId));
  const rows = parsed.rows.map((r): AnalyzedRow => {
    const errors: PriorRowError[] = [];
    const person = r.sicilNo ? bySicil.get(matchKey(r.sicilNo)) : undefined;
    if (!r.sicilNo) errors.push("sicil_missing");
    else if (!person) errors.push("person_not_found");
    const mod = person ? byUser.get(person.userId)?.find((m) => matchKey(m.title) === matchKey(r.moduleTitle)) : undefined;
    if (person && !mod) errors.push("module_not_found");
    if (mod && !canRecordModule(actor, mod)) errors.push("not_permitted");
    if (!r.completedOn || r.completedOn > today) errors.push("date_invalid");
    return {
      rowNumber: r.rowNumber,
      sicilNo: r.sicilNo,
      fullName: person?.fullName ?? null,
      moduleTitle: r.moduleTitle,
      completedOn: r.completedOn,
      errors,
      userId: person?.userId,
      moduleId: mod?.id,
      note: r.note,
    };
  });
  return { missingColumns: [], rows, tooManyRows: parsed.tooManyRows };
}

/** Excel'den son eğitim tarihleri (karar #223): Sicil no, Modül, Son eğitim tarihi, Not. Önizleme veritabanına yazmaz. */
export async function previewPriorImport(actor: Actor, buffer: Buffer): Promise<{ missingColumns: string[]; rows: PriorPreviewRow[]; tooManyRows: boolean }> {
  assertUser(actor);
  const a = await analyzePriorImport(actor, buffer);
  return {
    ...a,
    rows: a.rows.map((r) => ({ rowNumber: r.rowNumber, sicilNo: r.sicilNo, fullName: r.fullName, moduleTitle: r.moduleTitle, completedOn: r.completedOn, errors: r.errors })),
  };
}

/** Onay: dosya yeniden okunur, geçerli satırlar tek transaction'da yazılır. */
export async function commitPriorImport(actor: Actor, buffer: Buffer): Promise<{ saved: number; skipped: number }> {
  assertUser(actor);
  const a = await analyzePriorImport(actor, buffer);
  if (a.missingColumns.length) throw new ValidationError("missing_columns", { columns: a.missingColumns.join(", ") });
  const valid = a.rows.filter((r) => r.errors.length === 0 && r.userId && r.moduleId && r.completedOn);
  if (valid.length === 0) throw new ValidationError("no_valid_rows");
  await withActor(actor, (tx) =>
    tx.insert(priorTrainings).values(
      valid.map((r) => ({ userId: r.userId!, moduleId: r.moduleId!, completedOn: r.completedOn!, note: r.note, source: "excel" as const, enteredBy: actor.userId })),
    ),
  );
  return { saved: valid.length, skipped: a.rows.length - valid.length };
}

export const PRIOR_HEADERS = ["Sicil no", "Ad soyad", "Modül", "Son eğitim tarihi", "Not"] as const;

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    return "";
  }
  return String(value);
}

async function readPriorWorkbook(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new ValidationError("file_unreadable");
  }
  const sheet = wb.worksheets.find((ws) => ws.state === "visible") ?? wb.worksheets[0];
  const cols = new Map<string, number>();
  sheet?.getRow(1).eachCell((cell, col) => {
    const h = PRIOR_HEADERS.find((x) => matchKey(x) === matchKey(cellText(cell.value)));
    if (h && !cols.has(h)) cols.set(h, col);
  });
  const required = ["Sicil no", "Modül", "Son eğitim tarihi"];
  const missingColumns = required.filter((h) => !cols.has(h));
  const rows: { rowNumber: number; sicilNo: string; moduleTitle: string; completedOn: string | null; note: string | null }[] = [];
  let tooManyRows = false;
  if (sheet && missingColumns.length === 0) {
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const get = (h: string) => (cols.has(h) ? row.getCell(cols.get(h)!).value : null);
      const sicilNo = cellText(get("Sicil no")).trim();
      const moduleTitle = cellText(get("Modül")).trim();
      const dateCell = get("Son eğitim tarihi");
      const dateText = cellText(dateCell).trim();
      if (!sicilNo && !moduleTitle && !dateText) return;
      if (rows.length >= MAX_PRIOR_ROWS) {
        tooManyRows = true;
        return;
      }
      rows.push({
        rowNumber,
        sicilNo,
        moduleTitle,
        completedOn: dateCell instanceof Date ? parseDate("", dateCell) : parseDate(dateText),
        note: cellText(get("Not")).trim().slice(0, 500) || null,
      });
    });
  }
  return { missingColumns, rows, tooManyRows };
}

/** Şablon: tarihi girilmemiş her kişi × süreli modül bir satır (karar #223); tarih sütunu boş. */
export async function priorTemplate(actor: Actor): Promise<Buffer> {
  assertUser(actor);
  assertCan(actor, "periodic.record");
  const { people, byUser } = await eligibility(db());
  const fx = await facts(db(), people.map((p) => p.userId));
  const wb = new ExcelJS.Workbook();
  wb.creator = "JAPAR Akademi";
  const ws = wb.addWorksheet("Son eğitimler");
  ws.addRow([...PRIOR_HEADERS]);
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  [16, 30, 40, 18, 40].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  for (const p of people) {
    for (const m of byUser.get(p.userId)!) {
      const k = key(p.userId, m.id);
      if (!canRecordModule(actor, m) || fx.completions.has(k) || fx.priors.has(k) || fx.open.has(k)) continue;
      ws.addRow([p.sicilNo, p.fullName, m.title, null, null]);
    }
  }
  ws.getColumn(4).numFmt = "dd.mm.yyyy";
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// Toplu başlatma
// ---------------------------------------------------------------------------

export type StartSkip = "open_assignment" | "nothing_due";

/**
 * "Şimdi başlat" (karar #222): seçilen kişilere, sistemde tamamlanışı ve girilmiş tarihi olmayan süreli teorik modülleri
 * (ve bunlara bağlı teorik sınavları) periyodik atama olarak açar. Açık ataması olan kişi atlanır.
 */
export async function startPeriodicTraining(actor: Actor, userIds: string[]): Promise<{ started: number; skipped: { userId: string; reason: StartSkip }[] }> {
  assertUser(actor);
  assertCan(actor, "assignments.manage");
  const ids = [...new Set(userIds)];
  if (ids.length === 0 || ids.length > 500) throw new ValidationError("invalid_input");
  const skipped: { userId: string; reason: StartSkip }[] = [];
  let started = 0;
  for (const userId of ids) {
    const result = await withActor(actor, async (tx) => {
      const { byUser } = await eligibility(tx, [userId]);
      const fx = await facts(tx, [userId]);
      if (fx.openUsers.has(userId)) return "open_assignment" as const;
      const due = (byUser.get(userId) ?? []).filter((m) => !fx.completions.has(key(userId, m.id)) && !fx.priors.has(key(userId, m.id)));
      if (due.length === 0) return "nothing_due" as const;
      const now = new Date();
      const renew = new Map(due.map((m) => [m.id, { instanceId: null, priorId: null, expiresAt: now }]));
      const id = await createAssignment(tx, { userId, reason: "periodic", createdBy: actor.userId, renew });
      return id ? ("started" as const) : ("nothing_due" as const);
    });
    if (result === "started") started++;
    else skipped.push({ userId, reason: result });
  }
  return { started, skipped };
}
