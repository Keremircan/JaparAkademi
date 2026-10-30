import { createTranslator } from "next-intl";
import { and, asc, desc, eq, isNull, notInArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertUser } from "@/server/authz/policy";
import { db, type DbOrTx } from "@/server/db/client";
import { evacuationMarks, evacuationRollcalls, reportExports, users, visitors, visits } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { NotFoundError, ValidationError } from "@/server/errors";
import { renderReportPdf } from "@/server/pdf/report";
import { toAppLocale, type AppLocale } from "@/lib/locale";
import { messagesFor } from "@/server/i18n/messages";
import { getSettings } from "../settings";

/**
 * Tesis içindekiler ve tahliye yoklaması (FG-8.1, iş paketi 2.4, kararlar #156–163).
 * Faz 2'de yalnızca içerideki ziyaretçi ve taşeronlar (personel PDKS ile Faz 3). Güvenlik ve İSG uzmanı.
 */

const hostUser = alias(users, "evac_host");
const hostName = sql<string>`coalesce(${hostUser.name}, ${visits.hostNameText})`;

export type InsidePerson = {
  visitId: string;
  fullName: string;
  companyName: string | null;
  visitorType: "office" | "site" | "contractor";
  hostName: string;
  checkedInAt: Date | null;
  badgeNo: string | null;
};

const personColumns = {
  visitId: visits.id,
  fullName: visitors.fullName,
  companyName: visitors.companyName,
  visitorType: visits.visitorType,
  hostName,
  checkedInAt: visits.checkedInAt,
  badgeNo: visits.badgeNo,
};

/** Şu an içeride olanlar (karar #156): çıkışı yapılmamış her giriş, tarihten bağımsız. */
export async function insideNow(actor: Actor, conn: DbOrTx = db()): Promise<InsidePerson[]> {
  assertCan(actor, "evacuation.manage");
  return conn
    .select(personColumns)
    .from(visits)
    .innerJoin(visitors, eq(visitors.id, visits.visitorId))
    .leftJoin(hostUser, eq(hostUser.id, visits.hostUserId))
    .where(eq(visits.status, "checked_in"))
    .orderBy(asc(visitors.fullName));
}

async function rollcallPeople(rollcallId: string) {
  return db()
    .select({ ...personColumns, markId: evacuationMarks.id, safeAt: evacuationMarks.safeAt })
    .from(evacuationMarks)
    .innerJoin(visits, eq(visits.id, evacuationMarks.visitId))
    .innerJoin(visitors, eq(visitors.id, visits.visitorId))
    .leftJoin(hostUser, eq(hostUser.id, visits.hostUserId))
    .where(eq(evacuationMarks.rollcallId, rollcallId))
    .orderBy(asc(visitors.fullName));
}

/** Açık yoklama (yoksa null) ve kişileri. */
export async function openRollcall(actor: Actor) {
  assertCan(actor, "evacuation.manage");
  const [r] = await db().select().from(evacuationRollcalls).where(isNull(evacuationRollcalls.endedAt)).limit(1);
  if (!r) return null;
  return { ...r, people: await rollcallPeople(r.id) };
}

export async function getRollcall(actor: Actor, id: string) {
  assertCan(actor, "evacuation.manage");
  const [r] = await db().select().from(evacuationRollcalls).where(eq(evacuationRollcalls.id, id)).limit(1);
  if (!r) throw new NotFoundError("rollcall");
  return { ...r, people: await rollcallPeople(r.id) };
}

export async function recentRollcalls(actor: Actor) {
  assertCan(actor, "evacuation.manage");
  const starter = alias(users, "rc_starter");
  return db()
    .select({
      id: evacuationRollcalls.id,
      kind: evacuationRollcalls.kind,
      startedAt: evacuationRollcalls.startedAt,
      endedAt: evacuationRollcalls.endedAt,
      startedByName: starter.name,
      total: sql<number>`(select count(*)::int from ${evacuationMarks} m where m.rollcall_id = ${evacuationRollcalls.id})`,
      safe: sql<number>`(select count(*)::int from ${evacuationMarks} m where m.rollcall_id = ${evacuationRollcalls.id} and m.safe_at is not null)`,
    })
    .from(evacuationRollcalls)
    .innerJoin(starter, eq(starter.id, evacuationRollcalls.startedBy))
    .orderBy(desc(evacuationRollcalls.startedAt))
    .limit(20);
}

/** Yoklama başlatır (karar #157): o anda içeridekiler eklenir. Aynı anda tek açık yoklama. */
export async function startRollcall(actor: Actor, kind: "drill" | "real"): Promise<{ id: string }> {
  assertCan(actor, "evacuation.manage");
  assertUser(actor);
  return withActor(actor, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('evacuation_rollcall'))`);
    const [open] = await tx.select({ id: evacuationRollcalls.id }).from(evacuationRollcalls).where(isNull(evacuationRollcalls.endedAt)).limit(1);
    if (open) throw new ValidationError("rollcall_open");
    const [r] = await tx.insert(evacuationRollcalls).values({ kind, startedBy: actor.userId }).returning({ id: evacuationRollcalls.id });
    const inside = await insideNow(actor, tx);
    if (inside.length) await tx.insert(evacuationMarks).values(inside.map((p) => ({ rollcallId: r!.id, visitId: p.visitId })));
    return { id: r!.id };
  });
}

async function assertOpen(conn: DbOrTx, id: string) {
  const [r] = await conn.select().from(evacuationRollcalls).where(eq(evacuationRollcalls.id, id)).limit(1);
  if (!r) throw new NotFoundError("rollcall");
  if (r.endedAt) throw new ValidationError("rollcall_ended");
  return r;
}

/** Listeyi yenile: yoklama başladıktan sonra girenler eklenir. Eklenen kişi sayısı döner. */
export async function refreshRollcall(actor: Actor, id: string): Promise<number> {
  assertCan(actor, "evacuation.manage");
  return withActor(actor, async (tx) => {
    await assertOpen(tx, id);
    const existing = await tx.select({ visitId: evacuationMarks.visitId }).from(evacuationMarks).where(eq(evacuationMarks.rollcallId, id));
    const ids = existing.map((e) => e.visitId);
    const added = await tx
      .select({ id: visits.id })
      .from(visits)
      .where(ids.length ? and(eq(visits.status, "checked_in"), notInArray(visits.id, ids)) : eq(visits.status, "checked_in"));
    if (added.length) await tx.insert(evacuationMarks).values(added.map((v) => ({ rollcallId: id, visitId: v.id })));
    return added.length;
  });
}

/** "Toplanma alanında" işareti; yoklama açıkken geri alınabilir (karar #158). */
export async function setSafe(actor: Actor, rollcallId: string, visitId: string, safe: boolean): Promise<void> {
  assertCan(actor, "evacuation.manage");
  assertUser(actor);
  await withActor(actor, async (tx) => {
    await assertOpen(tx, rollcallId);
    const r = await tx
      .update(evacuationMarks)
      .set(safe ? { safeAt: new Date(), safeBy: actor.userId } : { safeAt: null, safeBy: null })
      .where(and(eq(evacuationMarks.rollcallId, rollcallId), eq(evacuationMarks.visitId, visitId)))
      .returning({ id: evacuationMarks.id });
    if (r.length === 0) throw new NotFoundError("rollcall_person");
  });
}

/** Bitir (karar #159): eksik varken de bitirilebilir; eksikler kayıtta kalır, kimse otomatik çıkmış sayılmaz. */
export async function endRollcall(actor: Actor, id: string): Promise<void> {
  assertCan(actor, "evacuation.manage");
  assertUser(actor);
  await withActor(actor, async (tx) => {
    await assertOpen(tx, id);
    await tx.update(evacuationRollcalls).set({ endedAt: new Date(), endedBy: actor.userId }).where(eq(evacuationRollcalls.id, id));
  });
}

/**
 * Kağıt yedeği (karar #161): içeridekiler ya da bir yoklamanın sonucu, A4 PDF. Her indirme `report_exports`'a yazılır.
 */
export async function evacuationPdf(actor: Actor, rollcallId: string | null, locale: AppLocale = "tr"): Promise<{ buffer: Buffer; fileName: string }> {
  assertCan(actor, "evacuation.manage");
  assertUser(actor);
  const { "org.timezone": tz } = await getSettings(["org.timezone"]);
  // İndiren kişinin dilinde (karar #217)
  const messages = messagesFor(locale);
  const t = createTranslator({ locale: toAppLocale(locale), messages, namespace: "evacuation.pdf" });
  const tt = createTranslator({ locale: toAppLocale(locale), messages, namespace: "visitors.types" });
  const appName = createTranslator({ locale: toAppLocale(locale), messages, namespace: "app" })("name");
  const time = (d: Date) => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: tz }).format(d);
  const rollcall = rollcallId ? await getRollcall(actor, rollcallId) : null;
  const people = rollcall ? rollcall.people : (await insideNow(actor)).map((p) => ({ ...p, safeAt: null as Date | null }));
  const title = rollcall ? t("rollcallTitle", { kind: t(`kinds.${rollcall.kind}`) }) : t("insideTitle");
  const meta = [t("generated", { date: time(new Date()) }), t("count", { count: people.length })];
  if (rollcall) {
    meta.push(t("started", { date: time(rollcall.startedAt) }));
    if (rollcall.endedAt) meta.push(t("ended", { date: time(rollcall.endedAt) }));
  }
  const buffer = await renderReportPdf({
    appName,
    title,
    meta,
    warnings: [],
    tables: [
      {
        title: t("table"),
        headers: [t("cols.name"), t("cols.company"), t("cols.type"), t("cols.host"), t("cols.checkedIn"), t("cols.badge"), t("cols.safe")],
        rows: people.map((p) => [p.fullName, p.companyName ?? "", tt(p.visitorType), p.hostName, p.checkedInAt ? time(p.checkedInAt) : "", p.badgeNo ?? "", p.safeAt ? time(p.safeAt) : "☐"]),
      },
    ],
    footer: `${appName} · ${title}`,
  });
  await withActor(actor, (tx) =>
    tx.insert(reportExports).values({ actorId: actor.userId, report: "evacuation", format: "pdf", filters: { rollcallId }, rowCount: people.length }),
  );
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return { buffer, fileName: `tahliye-${stamp}.pdf` };
}
