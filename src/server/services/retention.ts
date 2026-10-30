import { and, eq, inArray, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { blacklistEntries, mediaAssets, personnel, signatures, visitors, visitorSignatures, visits } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { todayIn } from "@/lib/dates";
import { logger } from "@/server/logger";
import { auditPurgeBefore, personnelAnonymizationCutoff } from "@/server/state/retention";
import { loginAttemptPurgeBefore } from "@/server/state/login-log";
import { deleteObjects } from "@/server/storage/client";
import { notify, usersWithRole } from "./notifications";
import { getSettings } from "./settings";
import { purgeExpiredInviteLinks } from "@/server/services/invitation-batches";

/**
 * Saklama süresi işleri (SPEC 12.3, iş paketi 2.1, kararlar #120–125). Worker her gece çalıştırır.
 * Değiştirilemez tablolara yalnızca veritabanı fonksiyonları dokunur (drizzle/0025_retention_functions.sql).
 */

/** Bir gecede işlenecek en çok kişi / imza görseli (iş yükü sınırı; kalan ertesi gece işlenir). */
const MAX_PEOPLE_PER_RUN = 200;
const MAX_IMAGES_PER_RUN = 500;

export type RetentionResult = {
  anonymized: number;
  images: number;
  auditRows: number;
  visitors: number;
  blacklist: number;
  inviteLinks: number;
  loginAttempts: number;
};

/** Süresi dolan ayrılmış personeli anonimleştirir ve sistem yöneticilerine bildirir (karar #125). */
export async function anonymizeDuePersonnel(actor: Actor, now: Date = new Date()): Promise<number> {
  const s = await getSettings(["org.timezone", "retention.personnel_years_after_exit"]);
  const cutoff = personnelAnonymizationCutoff(todayIn(s["org.timezone"], now), s["retention.personnel_years_after_exit"]);
  const due = await db()
    .select({ userId: personnel.userId })
    .from(personnel)
    .where(and(eq(personnel.status, "terminated"), isNotNull(personnel.endDate), lte(personnel.endDate, cutoff), isNull(personnel.anonymizedAt)))
    .orderBy(personnel.endDate)
    .limit(MAX_PEOPLE_PER_RUN);
  if (due.length === 0) return 0;

  const ids = due.map((d) => d.userId);
  return withActor(actor, async (tx) => {
    const rows = await tx.execute<{ id: string }>(
      sql`select app_anonymize_people(array[${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )}]::uuid[]) as id`,
    );
    const n = rows.length;
    if (n > 0) {
      // Yetkinlik kayıtlarındaki gerekçe metinleri (karar #219)
      await tx.execute(sql`select app_anonymize_competency_grants(array[${sql.join(rows.map((r) => sql`${r.id}`), sql`, `)}]::uuid[])`);
      await notify(tx, {
        kind: "retention_completed",
        userIds: await usersWithRole(tx, "sysadmin"),
        subjectKey: `retention:${todayIn("UTC", now)}`,
        link: "/admin/audit",
        params: { count: n },
      });
    }
    return n;
  });
}

/** Anonimleştirilen kişilerin imza görsellerini depodan siler (karar #123); imza kaydı ve özeti kalır. */
export async function purgeAnonymizedSignatureImages(actor: Actor): Promise<number> {
  const assets = await db()
    .selectDistinct({ id: mediaAssets.id, objectKey: mediaAssets.objectKey, derived: mediaAssets.derived })
    .from(signatures)
    .innerJoin(personnel, eq(personnel.userId, signatures.signerUserId))
    .innerJoin(mediaAssets, eq(mediaAssets.id, signatures.imageAssetId))
    .where(and(isNotNull(personnel.anonymizedAt), ne(mediaAssets.status, "purged")))
    .limit(MAX_IMAGES_PER_RUN);
  if (assets.length === 0) return 0;

  const keys = assets.flatMap((a) => [a.objectKey, a.derived.webpKey, a.derived.thumbKey, a.derived.posterKey].filter((k): k is string => !!k));
  await deleteObjects(keys);
  await withActor(actor, async (tx) => {
    for (const a of assets) await tx.update(mediaAssets).set({ status: "purged" }).where(eq(mediaAssets.id, a.id));
  });
  return assets.length;
}

/**
 * Ziyaretçi verisi (karar #134): son ziyaret tarihi + `retention.visitor_years`; taşeron ziyareti olan kişide
 * `retention.contractor_years`. İçerideki ziyaretçiye veritabanı fonksiyonu dokunmaz.
 */
export async function anonymizeDueVisitors(actor: Actor, now: Date = new Date()): Promise<number> {
  const s = await getSettings(["org.timezone", "retention.visitor_years", "retention.contractor_years"]);
  const today = todayIn(s["org.timezone"], now);
  const visitorCutoff = personnelAnonymizationCutoff(today, s["retention.visitor_years"]);
  const contractorCutoff = personnelAnonymizationCutoff(today, s["retention.contractor_years"]);
  const isContractor = sql<boolean>`bool_or(${visits.visitorType} = 'contractor')`;
  const last = sql<string>`max(${visits.plannedDate})`;
  const due = await db()
    .select({ id: visitors.id })
    .from(visitors)
    .innerJoin(visits, eq(visits.visitorId, visitors.id))
    .where(isNull(visitors.anonymizedAt))
    .groupBy(visitors.id)
    .having(sql`(${isContractor} and ${last} <= ${contractorCutoff}) or (not ${isContractor} and ${last} <= ${visitorCutoff})`)
    .limit(MAX_PEOPLE_PER_RUN);
  if (due.length === 0) return 0;
  // İmza görsellerinin anahtarları fonksiyon silmeden önce alınır; nesneler işlemden sonra depodan silinir
  const images = await db()
    .select({ key: visitorSignatures.imageKey })
    .from(visitorSignatures)
    .where(inArray(visitorSignatures.visitorId, due.map((d) => d.id)));
  const n = await withActor(actor, async (tx) => {
    const rows = await tx.execute(sql`select app_anonymize_visitors(array[${sql.join(due.map((d) => sql`${d.id}`), sql`, `)}]::uuid[])`);
    return rows.length;
  });
  const keys = images.map((i) => i.key).filter((k): k is string => !!k);
  if (keys.length) {
    try {
      await deleteObjects(keys);
    } catch (err) {
      logger.error({ err, keys }, "Ziyaretçi imza görselleri silinemedi");
    }
  }
  return n;
}

/** Kara liste: kaldırılmasından `retention.blacklist_years_after_lift` sonra kişi verisi silinir. */
export async function anonymizeLiftedBlacklist(actor: Actor, now: Date = new Date()): Promise<number> {
  const { "retention.blacklist_years_after_lift": years } = await getSettings(["retention.blacklist_years_after_lift"]);
  const before = auditPurgeBefore(now, years);
  const due = await db()
    .select({ id: blacklistEntries.id })
    .from(blacklistEntries)
    .where(and(isNotNull(blacklistEntries.liftedAt), lte(blacklistEntries.liftedAt, before), isNull(blacklistEntries.anonymizedAt)))
    .limit(MAX_PEOPLE_PER_RUN);
  if (due.length === 0) return 0;
  return withActor(actor, async (tx) => {
    const rows = await tx.execute(sql`select app_anonymize_blacklist(array[${sql.join(due.map((d) => sql`${d.id}`), sql`, `)}]::uuid[])`);
    return rows.length;
  });
}

/** Saklama süresini geçen denetim kayıtlarını siler (retention.audit_years). */
export async function purgeOldAuditLog(actor: Actor, now: Date = new Date()): Promise<number> {
  const { "retention.audit_years": years } = await getSettings(["retention.audit_years"]);
  const before = auditPurgeBefore(now, years);
  return withActor(actor, async (tx) => {
    const r = await tx.execute<{ n: string }>(sql`select app_purge_audit(${before.toISOString()}::timestamptz) as n`);
    return Number(r[0]?.n ?? 0);
  });
}

/** Saklama süresini (`retention.login_attempt_days`) geçen giriş kayıtlarını siler (karar #216). */
export async function purgeOldLoginAttempts(actor: Actor, now: Date = new Date()): Promise<number> {
  const { "retention.login_attempt_days": days } = await getSettings(["retention.login_attempt_days"]);
  const before = loginAttemptPurgeBefore(now, days);
  return withActor(actor, async (tx) => {
    const r = await tx.execute<{ n: string }>(sql`select app_purge_login_attempts(${before.toISOString()}::timestamptz) as n`);
    return Number(r[0]?.n ?? 0);
  });
}

/** Gece işi: sırayla personel, ziyaretçi ve kara liste anonimleştirme, imza görselleri, denetim kaydı, eski davet bağlantıları. */
export async function runRetention(actor: Actor, now: Date = new Date()): Promise<RetentionResult> {
  const anonymized = await anonymizeDuePersonnel(actor, now);
  let images = 0;
  try {
    images = await purgeAnonymizedSignatureImages(actor);
  } catch (err) {
    // Depo erişilemezse kayıtlar "purged" olmaz; ertesi gece yeniden denenir
    logger.error({ err }, "İmza görselleri silinemedi");
  }
  const visitorCount = await anonymizeDueVisitors(actor, now);
  const blacklist = await anonymizeLiftedBlacklist(actor, now);
  const auditRows = await purgeOldAuditLog(actor, now);
  // Süresi dolan toplu WhatsApp davetlerinin saklanan bağlantıları (karar #201)
  const inviteLinks = await purgeExpiredInviteLinks(actor, now);
  const loginAttemptRows = await purgeOldLoginAttempts(actor, now);
  return { anonymized, images, auditRows, visitors: visitorCount, blacklist, inviteLinks, loginAttempts: loginAttemptRows };
}
