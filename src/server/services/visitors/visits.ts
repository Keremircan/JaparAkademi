import { and, asc, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Actor, UserActor } from "@/server/authz/actor";
import { assertUser, can } from "@/server/authz/policy";
import { db, type Tx } from "@/server/db/client";
import { contractorCompanies, personnel, users, visitors, visits } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { todayIn } from "@/lib/dates";
import { isVisitCancellable, isVisitEditable, type VisitStatus } from "@/server/state/visits";
import { getSettings } from "../settings";
import { activeBlacklistHmacs } from "./blacklist";
import { cleanContact, protectVisitorId, type VisitorIdInput } from "./identity";
import { newVisitCode, sendVisitLink } from "./session";
import type { VisitorType } from "./briefings";

/**
 * Ziyaret ön kaydı (SPEC 8.2/1, iş paketi 2.2, kararlar #129–133).
 * - Her personel kendini ev sahibi olarak ziyaretçi kaydedebilir; yalnızca kendi ziyaretlerini görür.
 * - Güvenlik herkes adına kayıt açar ve kimlik no girer; İSG uzmanı tüm ziyaretleri görür.
 * - Kimlik no ve kara liste bilgisi ev sahibine gösterilmez.
 */


export type VisitInput = {
  visitorType: VisitorType;
  plannedDate: string;
  fullName: string;
  companyName?: string | null;
  contractorCompanyId?: string | null;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
  /** Yalnızca güvenlik: ev sahibinin sicil no'su (boşsa kendisi). */
  hostSicilNo?: string | null;
  /** Yalnızca güvenlik (karar #129). */
  id?: VisitorIdInput | null;
};

const hostUser = alias(users, "visit_host");
/** Ev sahibi adı: personel kaydı ya da kendi kaydında yazılan ad (karar #139). */
const hostName = sql<string>`coalesce(${hostUser.name}, ${visits.hostNameText})`;

async function today(): Promise<string> {
  const { "org.timezone": tz } = await getSettings(["org.timezone"]);
  return todayIn(tz);
}

async function resolveHost(actor: UserActor, sicilNo: string | null | undefined): Promise<string> {
  if (!sicilNo?.trim()) return actor.userId;
  if (!can(actor, "visits.manage_all")) throw new ForbiddenError("visits.manage_all");
  const [row] = await db()
    .select({ userId: personnel.userId })
    .from(personnel)
    .where(and(eq(personnel.sicilNo, sicilNo.trim()), eq(personnel.status, "active")))
    .limit(1);
  if (!row) throw new ValidationError("host_not_found");
  return row.userId;
}

async function validate(actor: UserActor, input: VisitInput, opts: { requireFuture: boolean }) {
  const { "visitor.types": types } = await getSettings(["visitor.types"]);
  if (!types[input.visitorType]?.enabled) throw new ValidationError("visitor_type_disabled");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.plannedDate)) throw new ValidationError("invalid_date");
  if (opts.requireFuture && input.plannedDate < (await today())) throw new ValidationError("date_in_past");
  const fullName = input.fullName.trim();
  if (fullName.length < 2 || fullName.length > 200) throw new ValidationError("invalid_name");
  if (input.id && !can(actor, "visits.manage_all")) throw new ForbiddenError("visits.manage_all");
  const note = input.note?.trim() || null;
  if (note && note.length > 500) throw new ValidationError("invalid_input");

  let companyName = input.companyName?.trim() || null;
  let contractorCompanyId: string | null = null;
  if (input.visitorType === "contractor") {
    if (!input.contractorCompanyId) throw new ValidationError("company_required");
    const [company] = await db()
      .select({ id: contractorCompanies.id, name: contractorCompanies.name, archivedAt: contractorCompanies.archivedAt })
      .from(contractorCompanies)
      .where(eq(contractorCompanies.id, input.contractorCompanyId))
      .limit(1);
    if (!company || company.archivedAt) throw new ValidationError("company_required");
    contractorCompanyId = company.id;
    companyName = company.name;
  }
  return { fullName, companyName, contractorCompanyId, note, ...cleanContact(input), id: input.id ? protectVisitorId(input.id) : null };
}

type Cleaned = Awaited<ReturnType<typeof validate>>;

/** Kimlik no varsa aynı kişinin kaydını günceller (taşeron yeniden tanınır), yoksa yeni ziyaretçi açar. */
async function upsertVisitor(tx: Tx, v: Cleaned): Promise<string> {
  const base = {
    fullName: v.fullName,
    companyName: v.companyName,
    contractorCompanyId: v.contractorCompanyId,
    phone: v.phone,
    email: v.email,
  };
  if (v.id) {
    const [existing] = await tx.select({ id: visitors.id }).from(visitors).where(eq(visitors.nationalIdHmac, v.id.hmac)).limit(1);
    if (existing) {
      await tx.update(visitors).set(base).where(eq(visitors.id, existing.id));
      return existing.id;
    }
  }
  const [row] = await tx
    .insert(visitors)
    .values({
      ...base,
      idKind: v.id?.idKind ?? null,
      idCountry: v.id?.idCountry ?? null,
      nationalIdEnc: v.id?.enc ?? null,
      nationalIdHmac: v.id?.hmac ?? null,
      nationalIdMasked: v.id?.masked ?? null,
    })
    .returning({ id: visitors.id });
  return row!.id;
}

export async function createVisit(actor: Actor, input: VisitInput): Promise<{ id: string }> {
  assertUser(actor);
  const hostUserId = await resolveHost(actor, input.hostSicilNo);
  const v = await validate(actor, input, { requireFuture: true });
  return withActor(actor, async (tx) => {
    const visitorId = await upsertVisitor(tx, v);
    const [row] = await tx
      .insert(visits)
      .values({
        visitorId,
        visitorType: input.visitorType,
        hostUserId,
        plannedDate: input.plannedDate,
        note: v.note,
        code: await newVisitCode(tx),
        createdBy: actor.userId,
      })
      .returning({ id: visits.id });
    // E-posta varsa bilgilendirme bağlantısı (karar #137)
    await sendVisitLink(tx, row!.id);
    return { id: row!.id };
  });
}

export type VisitFilters = { from?: string; to?: string; status?: VisitStatus; scope?: "all" | "mine" };

/** Liste: "mine" ev sahibinin kendi ziyaretleri; "all" yalnızca güvenlik ve İSG. Varsayılan bugünden ileri. */
export async function listVisits(actor: Actor, filters: VisitFilters = {}) {
  assertUser(actor);
  const all = filters.scope === "all";
  if (all && !can(actor, "visits.view_all")) throw new ForbiddenError("visits.view_all");
  const from = filters.from ?? (await today());
  const where: SQL[] = [gte(visits.plannedDate, from)];
  if (filters.to) where.push(lte(visits.plannedDate, filters.to));
  if (filters.status) where.push(eq(visits.status, filters.status));
  if (!all) where.push(eq(visits.hostUserId, actor.userId));

  const rows = await db()
    .select({
      id: visits.id,
      plannedDate: visits.plannedDate,
      status: visits.status,
      visitorType: visits.visitorType,
      fullName: visitors.fullName,
      companyName: visitors.companyName,
      hostName,
      selfRegistered: visits.selfRegistered,
      hmac: visitors.nationalIdHmac,
      nationalIdMasked: visitors.nationalIdMasked,
    })
    .from(visits)
    .innerJoin(visitors, eq(visitors.id, visits.visitorId))
    .leftJoin(hostUser, eq(hostUser.id, visits.hostUserId))
    .where(and(...where))
    .orderBy(asc(visits.plannedDate), asc(visitors.fullName))
    .limit(500);

  const flagged = all ? await activeBlacklistHmacs(rows.map((r) => r.hmac).filter((h): h is string => !!h)) : new Set<string>();
  return rows.map(({ hmac, nationalIdMasked, ...r }) => ({
    ...r,
    // Kimlik ve kara liste yalnızca güvenlik / İSG görünümünde (karar #131)
    nationalIdMasked: all ? nationalIdMasked : null,
    blacklisted: all && !!hmac && flagged.has(hmac),
  }));
}

async function loadVisit(id: string) {
  const [row] = await db()
    .select({
      id: visits.id,
      visitorId: visits.visitorId,
      plannedDate: visits.plannedDate,
      status: visits.status,
      visitorType: visits.visitorType,
      note: visits.note,
      hostUserId: visits.hostUserId,
      hostName,
      cancelReason: visits.cancelReason,
      code: visits.code,
      selfRegistered: visits.selfRegistered,
      briefingCompletedAt: visits.briefingCompletedAt,
      briefingLocale: visits.briefingLocale,
      quizScore: visits.quizScore,
      cancelledAt: visits.cancelledAt,
      createdAt: visits.createdAt,
      fullName: visitors.fullName,
      companyName: visitors.companyName,
      contractorCompanyId: visitors.contractorCompanyId,
      phone: visitors.phone,
      email: visitors.email,
      idKind: visitors.idKind,
      hmac: visitors.nationalIdHmac,
      nationalIdMasked: visitors.nationalIdMasked,
      anonymizedAt: visitors.anonymizedAt,
    })
    .from(visits)
    .innerJoin(visitors, eq(visitors.id, visits.visitorId))
    .leftJoin(hostUser, eq(hostUser.id, visits.hostUserId))
    .where(eq(visits.id, id))
    .limit(1);
  if (!row) throw new NotFoundError("visit");
  return row;
}

/** Ev sahibi kendi ziyaretini; güvenlik ve İSG her ziyareti görür. Başkasının ziyareti 404. */
export async function getVisit(actor: Actor, id: string) {
  assertUser(actor);
  const row = await loadVisit(id);
  const viewAll = can(actor, "visits.view_all");
  if (!viewAll && row.hostUserId !== actor.userId) throw new NotFoundError("visit");
  const { hmac, ...rest } = row;
  const blacklisted = viewAll && !!hmac && (await activeBlacklistHmacs([hmac])).size > 0;
  return {
    ...rest,
    nationalIdMasked: viewAll ? rest.nationalIdMasked : null,
    idKind: viewAll ? rest.idKind : null,
    blacklisted,
    canEdit: isVisitEditable(row.status) && (row.hostUserId === actor.userId || can(actor, "visits.manage_all")),
    canCancel: isVisitCancellable(row.status) && (row.hostUserId === actor.userId || can(actor, "visits.manage_all")),
    canSetId: can(actor, "visits.manage_all"),
  };
}

async function assertMayChange(actor: UserActor, id: string) {
  const row = await loadVisit(id);
  if (row.hostUserId !== actor.userId && !can(actor, "visits.manage_all")) {
    // Başkasının ziyaretinin varlığı belli edilmez
    if (!can(actor, "visits.view_all")) throw new NotFoundError("visit");
    throw new ForbiddenError("visits.manage_all");
  }
  return row;
}

/** Ön kayıt düzeltmesi: yalnızca bilgilendirme başlamadan (karar #135). Ev sahibi değiştirilmez. */
export async function updateVisit(actor: Actor, id: string, input: Omit<VisitInput, "hostSicilNo">): Promise<void> {
  assertUser(actor);
  const row = await assertMayChange(actor, id);
  if (!isVisitEditable(row.status)) throw new ValidationError("visit_locked");
  const v = await validate(actor, input, { requireFuture: input.plannedDate !== row.plannedDate });
  const emailChanged = !!v.email && v.email !== row.email;
  await withActor(actor, async (tx) => {
    // Kimlik girilirse aynı kimlikli mevcut ziyaretçiye bağlanır
    let visitorId = row.visitorId;
    if (v.id) {
      visitorId = await upsertVisitor(tx, v);
    } else {
      await tx
        .update(visitors)
        .set({ fullName: v.fullName, companyName: v.companyName, contractorCompanyId: v.contractorCompanyId, phone: v.phone, email: v.email })
        .where(eq(visitors.id, row.visitorId));
    }
    await tx
      .update(visits)
      .set({ visitorId, visitorType: input.visitorType, plannedDate: input.plannedDate, note: v.note })
      .where(eq(visits.id, id));
    // Yeni e-posta adresine bağlantı gider
    if (emailChanged) await sendVisitLink(tx, id);
  });
}

/** Bilgilendirme bağlantısını yeniden gönderir (yeni belirteç; eskisi gün sonuna kadar geçerli kalır). */
export async function resendVisitLink(actor: Actor, id: string): Promise<void> {
  assertUser(actor);
  const row = await assertMayChange(actor, id);
  if (row.status !== "planned") throw new ValidationError("visit_locked");
  if (!row.email) throw new ValidationError("visit_no_email");
  await withActor(actor, async (tx) => {
    await sendVisitLink(tx, id);
  });
}

export async function cancelVisit(actor: Actor, id: string, reason: string): Promise<void> {
  assertUser(actor);
  const row = await assertMayChange(actor, id);
  if (!isVisitCancellable(row.status)) throw new ValidationError("visit_locked");
  const text = reason.trim();
  if (text.length < 3 || text.length > 500) throw new ValidationError("reason_required");
  await withActor(actor, (tx) =>
    tx
      .update(visits)
      .set({ status: "cancelled", cancelReason: text, cancelledAt: new Date(), cancelledBy: actor.userId })
      .where(eq(visits.id, id)),
  );
}

/** Ziyaretçinin geçmiş ziyaretleri (güvenlik / İSG), ayrıntı ekranında. */
export async function visitorHistory(actor: Actor, visitorId: string) {
  assertUser(actor);
  if (!can(actor, "visits.view_all")) throw new ForbiddenError("visits.view_all");
  return db()
    .select({ id: visits.id, plannedDate: visits.plannedDate, status: visits.status, visitorType: visits.visitorType, hostName })
    .from(visits)
    .leftJoin(hostUser, eq(hostUser.id, visits.hostUserId))
    .where(eq(visits.visitorId, visitorId))
    .orderBy(desc(visits.plannedDate))
    .limit(50);
}

