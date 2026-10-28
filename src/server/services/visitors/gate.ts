import { and, asc, eq, gte, ilike, inArray, isNull, max, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertUser } from "@/server/authz/policy";
import { db, type DbOrTx, type Tx } from "@/server/db/client";
import { blacklistEntries, contractorClearances, personnel, users, visitDenials, visitors, visitorSignatures, visits } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { NotFoundError, ValidationError } from "@/server/errors";
import { todayIn } from "@/lib/dates";
import { canTransition, isBlacklistActive } from "@/server/state/visits";
import { notify, usersWithRole } from "../notifications";
import { getSettings } from "../settings";
import { protectVisitorId, type ProtectedVisitorId, type VisitorIdInput } from "./identity";

/**
 * Kapı (SPEC 8.2/6–8, iş paketi 2.3b, kararlar #147–155).
 * Giriş: bilgilendirilmiş ziyaret + kimlik no + kart no + ev sahibi; kara liste eşleşmesinde sistem girişi reddeder.
 * Çıkış: kart iadesi işaretlenir. Girişten sonra kayıt veritabanında kilitlenir.
 */

const hostUser = alias(users, "gate_host");
const hostName = sql<string>`coalesce(${hostUser.name}, ${visits.hostNameText})`;

async function today(conn: DbOrTx = db()): Promise<string> {
  const { "org.timezone": tz } = await getSettings(["org.timezone"], conn);
  return todayIn(tz);
}

/** Ziyaretçinin bugün geçerli taşeron geçerliliğinin bitişi (yoksa null). */
export async function activeClearanceUntil(visitorId: string, conn: DbOrTx = db()): Promise<string | null> {
  const [row] = await conn
    .select({ until: max(contractorClearances.validUntil) })
    .from(contractorClearances)
    .where(and(eq(contractorClearances.visitorId, visitorId), gte(contractorClearances.validUntil, await today(conn))));
  return row?.until ?? null;
}

/**
 * Kapı listesi (karar #147): bugünün planlı/bilgilendirilmiş ziyaretleri ve tarihten bağımsız içeride olanlar.
 * Arama: 6 haneli kod ya da ad.
 */
export async function gateList(actor: Actor, q?: string) {
  assertCan(actor, "visits.view_all");
  const day = await today();
  const where: SQL[] = [or(and(eq(visits.plannedDate, day), inArray(visits.status, ["planned", "briefed"])), eq(visits.status, "checked_in"))!];
  const term = q?.trim();
  if (term) where.push(/^\d{6}$/.test(term) ? eq(visits.code, term) : ilike(visitors.fullName, `%${term.replace(/[%_\\]/g, "\\$&")}%`));
  const rows = await db()
    .select({
      id: visits.id,
      visitorId: visits.visitorId,
      code: visits.code,
      status: visits.status,
      visitorType: visits.visitorType,
      plannedDate: visits.plannedDate,
      selfRegistered: visits.selfRegistered,
      hostUserId: visits.hostUserId,
      hostName,
      badgeNo: visits.badgeNo,
      checkedInAt: visits.checkedInAt,
      fullName: visitors.fullName,
      companyName: visitors.companyName,
      hmac: visitors.nationalIdHmac,
      nationalIdMasked: visitors.nationalIdMasked,
    })
    .from(visits)
    .innerJoin(visitors, eq(visitors.id, visits.visitorId))
    .leftJoin(hostUser, eq(hostUser.id, visits.hostUserId))
    .where(and(...where))
    .orderBy(asc(visits.status), asc(visitors.fullName))
    .limit(300);
  const hmacs = rows.map((r) => r.hmac).filter((h): h is string => !!h);
  const flagged = hmacs.length ? await activeBlacklistHmacsWithIds(hmacs, day) : new Map<string, string>();
  const clearances = rows.length
    ? await db()
        .select({ visitorId: contractorClearances.visitorId, until: max(contractorClearances.validUntil) })
        .from(contractorClearances)
        .where(and(inArray(contractorClearances.visitorId, rows.map((r) => r.visitorId)), gte(contractorClearances.validUntil, day)))
        .groupBy(contractorClearances.visitorId)
    : [];
  const until = new Map(clearances.map((c) => [c.visitorId, c.until]));
  return rows.map(({ hmac, ...r }) => ({
    ...r,
    hasId: !!hmac,
    blacklisted: !!hmac && flagged.has(hmac),
    clearanceUntil: until.get(r.visitorId) ?? null,
    canCheckIn: r.status === "briefed",
    canCheckOut: r.status === "checked_in",
  }));
}

/** Kara listede geçerli kayıtlar: kimlik özeti → kayıt kimliği. */
async function activeBlacklistHmacsWithIds(hmacs: readonly string[], day: string, conn: DbOrTx = db()): Promise<Map<string, string>> {
  const rows = await conn
    .select({ id: blacklistEntries.id, hmac: blacklistEntries.nationalIdHmac, liftedAt: blacklistEntries.liftedAt, endsAt: blacklistEntries.endsAt })
    .from(blacklistEntries)
    .where(and(inArray(blacklistEntries.nationalIdHmac, [...hmacs]), isNull(blacklistEntries.liftedAt)));
  return new Map(rows.filter((r) => isBlacklistActive(r, day)).map((r) => [r.hmac!, r.id]));
}

/**
 * Kimlik birleştirme (karar #150): kapıda girilen kimlik başka bir ziyaretçi kaydıyla eşleşirse ziyaret o kişiye
 * taşınır, ad ve iletişim güncellenir; başka ziyareti kalmayan geçici kayıt silinir.
 */
async function attachIdentity(tx: Tx, visitId: string, currentVisitorId: string, id: ProtectedVisitorId): Promise<string> {
  const [current] = await tx.select().from(visitors).where(eq(visitors.id, currentVisitorId)).limit(1);
  const [existing] = await tx.select({ id: visitors.id }).from(visitors).where(eq(visitors.nationalIdHmac, id.hmac)).limit(1);
  if (!existing) {
    await tx
      .update(visitors)
      .set({ idKind: id.idKind, idCountry: id.idCountry, nationalIdEnc: id.enc, nationalIdHmac: id.hmac, nationalIdMasked: id.masked })
      .where(eq(visitors.id, currentVisitorId));
    return currentVisitorId;
  }
  if (existing.id === currentVisitorId) return currentVisitorId;
  await tx
    .update(visitors)
    .set({
      fullName: current!.fullName,
      companyName: current!.companyName,
      contractorCompanyId: current!.contractorCompanyId,
      phone: current!.phone ?? undefined,
      email: current!.email ?? undefined,
    })
    .where(eq(visitors.id, existing.id));
  await tx.update(visits).set({ visitorId: existing.id }).where(eq(visits.id, visitId));
  await tx.update(visitorSignatures).set({ visitorId: existing.id }).where(eq(visitorSignatures.visitorId, currentVisitorId));
  await tx.update(contractorClearances).set({ visitorId: existing.id }).where(eq(contractorClearances.visitorId, currentVisitorId));
  const [other] = await tx.select({ id: visits.id }).from(visits).where(and(eq(visits.visitorId, currentVisitorId), ne(visits.id, visitId))).limit(1);
  if (!other) await tx.delete(visitors).where(eq(visitors.id, currentVisitorId));
  return existing.id;
}

export type CheckInInput = {
  badgeNo: string;
  ppe: string[];
  /** Kendi kaydında zorunlu: gerçek ev sahibinin sicil no'su (karar #148). */
  hostSicilNo?: string | null;
  /** Ziyaretçinin kimliği kayıtlı değilse zorunlu (karar #111). */
  id?: VisitorIdInput | null;
};

/**
 * Giriş (karar #148, #151): kara liste eşleşmesinde giriş yapılmaz; red kaydedilir ve İSG uzmanına bildirim gider.
 * Sonuç: { checkedIn: true } ya da { denied: true }.
 */
export async function checkIn(actor: Actor, visitId: string, input: CheckInInput): Promise<{ checkedIn: true } | { denied: true }> {
  assertCan(actor, "visits.manage_all");
  assertUser(actor);
  const [visit] = await db().select().from(visits).where(eq(visits.id, visitId)).limit(1);
  if (!visit) throw new NotFoundError("visit");
  if (!canTransition(visit.status, "checked_in")) throw new ValidationError("visit_not_briefed");
  const s = await getSettings(["org.timezone", "visitor.ppe_items"]);
  const day = todayIn(s["org.timezone"]);
  if (visit.plannedDate !== day) throw new ValidationError("visit_not_today");

  const badgeNo = input.badgeNo.trim();
  if (badgeNo.length < 1 || badgeNo.length > 30) throw new ValidationError("badge_required");
  const ppe = [...new Set(input.ppe)];
  if (ppe.some((p) => !s["visitor.ppe_items"].includes(p))) throw new ValidationError("invalid_input");

  let hostUserId = visit.hostUserId;
  if (!hostUserId) {
    const sicil = input.hostSicilNo?.trim();
    if (!sicil) throw new ValidationError("host_required");
    const [host] = await db()
      .select({ userId: personnel.userId })
      .from(personnel)
      .where(and(eq(personnel.sicilNo, sicil), eq(personnel.status, "active")))
      .limit(1);
    if (!host) throw new ValidationError("host_not_found");
    hostUserId = host.userId;
  }

  const [visitor] = await db().select({ hmac: visitors.nationalIdHmac, fullName: visitors.fullName }).from(visitors).where(eq(visitors.id, visit.visitorId)).limit(1);
  let protectedId: ProtectedVisitorId | null = null;
  if (!visitor!.hmac) {
    if (!input.id) throw new ValidationError("visitor_id_required");
    protectedId = protectVisitorId(input.id);
  }
  const hmac = protectedId?.hmac ?? visitor!.hmac!;
  const entryId = (await activeBlacklistHmacsWithIds([hmac], day)).get(hmac);

  return withActor(actor, async (tx) => {
    if (protectedId) await attachIdentity(tx, visit.id, visit.visitorId, protectedId);
    if (entryId) {
      // Giriş yasağı uygulanır (FG-8.4); kişiyi değil mevcut yasağı uygular, kaldırma İSG uzmanındadır
      await tx.insert(visitDenials).values({ visitId: visit.id, blacklistEntryId: entryId, deniedBy: actor.userId });
      await notify(tx, {
        kind: "blacklist_denied",
        userIds: await usersWithRole(tx, "ohs_specialist"),
        subjectKey: `visit-denied:${visit.id}`,
        link: `/security/visits/${visit.id}`,
      });
      return { denied: true as const };
    }
    await tx
      .update(visits)
      .set({ status: "checked_in", hostUserId, badgeNo, ppeIssued: ppe, checkedInAt: new Date(), checkedInBy: actor.userId })
      .where(eq(visits.id, visit.id));
    // SPEC 10.2: ev sahibine "ziyaretçiniz geldi" (karar #155)
    await notify(tx, {
      kind: "visitor_arrived",
      userIds: [hostUserId],
      exclude: [actor.userId],
      subjectKey: `visit:${visit.id}`,
      link: `/visits/${visit.id}`,
      params: { name: visitor!.fullName },
    });
    return { checkedIn: true as const };
  });
}

/** Çıkış: kart iadesi işaretlenir; sonra kayıt donar (karar #153). */
export async function checkOut(actor: Actor, visitId: string, badgeReturned: boolean): Promise<void> {
  assertCan(actor, "visits.manage_all");
  assertUser(actor);
  const [visit] = await db().select({ status: visits.status }).from(visits).where(eq(visits.id, visitId)).limit(1);
  if (!visit) throw new NotFoundError("visit");
  if (!canTransition(visit.status, "checked_out")) throw new ValidationError("visit_not_inside");
  await withActor(actor, (tx) =>
    tx.update(visits).set({ status: "checked_out", checkedOutAt: new Date(), checkedOutBy: actor.userId, badgeReturned }).where(eq(visits.id, visitId)),
  );
}
