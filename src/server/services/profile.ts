import { and, eq, isNotNull, ne } from "drizzle-orm";
import type { Actor, UserActor } from "@/server/authz/actor";
import { assertUser, can } from "@/server/authz/policy";
import { isPersonInScope } from "@/server/authz/scope";
import { db } from "@/server/db/client";
import { mediaAssets, orgUnits, personnel, positions } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { logger } from "@/server/logger";
import { normalizePhone } from "@/server/state/invitations";
import { deleteObjects } from "@/server/storage/client";
import type { RequestMeta } from "./auth";
import { canViewPerson } from "./assignments";
import {
  assertCurrentExplicitText,
  explicitConsentState,
  hasExplicitConsent,
  insertExplicitDecision,
  type ExplicitConsentState,
} from "./legal";
import { assetsInfo, type AssetInfo } from "./media";

/**
 * Detaylı profil ve açık rıza (iş paketi 3.4, kararlar #230–236).
 * Profil fotoğrafı yalnızca kişinin güncel açık rızası varken yüklenir; rıza geri alınınca ve anonimleştirmede silinir.
 * Fotoğrafı kişiyi görebilenler görür (`canViewPerson`: kendisi, İK, kapsamdaki bölüm sorumlusu, eğitmeni) ve
 * personel ekranındaki yöneticiler. Telefonu kişi değiştirir; e-postayı yalnızca İK (şifre sıfırlama adresi).
 */

export type MyProfile = {
  fullName: string;
  sicilNo: string;
  email: string | null;
  phone: string | null;
  positionName: string | null;
  unitPath: string | null;
  photo: AssetInfo | null;
  consent: ExplicitConsentState;
};

type PhotoAsset = { id: string; objectKey: string; derived: { webpKey?: string; thumbKey?: string; posterKey?: string } };

async function unitPathFor(unitId: string): Promise<string> {
  const [unit] = await db().select().from(orgUnits).where(eq(orgUnits.id, unitId)).limit(1);
  const [parent] = unit?.parentId
    ? await db().select({ name: orgUnits.name }).from(orgUnits).where(eq(orgUnits.id, unit.parentId)).limit(1)
    : [];
  return [parent?.name, unit?.name].filter(Boolean).join(" / ");
}

async function photoInfo(assetId: string | null): Promise<AssetInfo | null> {
  if (!assetId) return null;
  return (await assetsInfo([assetId])).get(assetId) ?? null;
}

export async function myProfile(actor: Actor, locale = "tr"): Promise<MyProfile> {
  assertUser(actor);
  const [row] = await db()
    .select({ p: personnel, positionName: positions.name, unitId: positions.orgUnitId })
    .from(personnel)
    .leftJoin(positions, eq(positions.id, personnel.positionId))
    .where(eq(personnel.userId, actor.userId))
    .limit(1);
  if (!row) throw new NotFoundError("person");
  const [photo, consent, unitPath] = await Promise.all([
    photoInfo(row.p.photoAssetId),
    explicitConsentState(actor.userId, locale),
    row.unitId ? unitPathFor(row.unitId) : Promise.resolve(null),
  ]);
  return {
    fullName: row.p.fullName,
    sicilNo: row.p.sicilNo,
    email: row.p.email,
    phone: row.p.phone,
    positionName: row.positionName,
    unitPath,
    photo,
    consent,
  };
}

/** Kişi kendi telefonunu değiştirir (`+90…` biçimi, karar #188). Boş bırakılırsa silinir. */
export async function updateOwnPhone(actor: Actor, raw: string | null): Promise<void> {
  assertUser(actor);
  const value = raw?.trim() || null;
  const phone = value ? normalizePhone(value) : null;
  if (value && !phone) throw new ValidationError("phone_invalid");
  await withActor(actor, (tx) => tx.update(personnel).set({ phone }).where(eq(personnel.userId, actor.userId)));
}

/** Başkasının fotoğrafını değiştirebilir mi: personel yönetimi yetkisi + kapsam. Kendi fotoğrafı her zaman. */
async function canEditPhotoOf(actor: UserActor, userId: string): Promise<boolean> {
  if (actor.userId === userId) return true;
  return can(actor, "people.manage") && (await isPersonInScope(actor, userId));
}

async function currentPhoto(userId: string): Promise<PhotoAsset | null> {
  const [row] = await db()
    .select({ id: mediaAssets.id, objectKey: mediaAssets.objectKey, derived: mediaAssets.derived })
    .from(personnel)
    .innerJoin(mediaAssets, eq(mediaAssets.id, personnel.photoAssetId))
    .where(eq(personnel.userId, userId))
    .limit(1);
  return row ?? null;
}

function objectKeys(a: PhotoAsset): string[] {
  return [a.objectKey, a.derived.webpKey, a.derived.thumbKey, a.derived.posterKey].filter((k): k is string => !!k && k !== "pending");
}

/**
 * Fotoğraf dosyaları önce depodan silinir; silinemezse hata verilir ve kayıt değişmez (rıza geri alma da yazılmaz).
 * Ardından kayıt `purged` olur ve personelden bağ kaldırılır (aynı transaction'da çağırana bırakılır).
 */
async function deletePhotoObjects(asset: PhotoAsset): Promise<void> {
  try {
    await deleteObjects(objectKeys(asset));
  } catch (err) {
    logger.error({ err, assetId: asset.id }, "Profil fotoğrafı depodan silinemedi");
    throw new ValidationError("photo_delete_failed");
  }
}

/** Kişinin profil fotoğrafını bağlar (yenisi eskisinin yerine geçer, eskisi silinir). */
export async function setProfilePhoto(actor: Actor, userId: string, assetId: string): Promise<void> {
  assertUser(actor);
  if (!(await canEditPhotoOf(actor, userId))) throw new ForbiddenError("profile.photo");
  if (!(await hasExplicitConsent(userId))) throw new ValidationError("photo_consent_required");
  const [asset] = await db().select().from(mediaAssets).where(eq(mediaAssets.id, assetId)).limit(1);
  if (!asset || asset.createdBy !== actor.userId) throw new NotFoundError("media");
  if (asset.kind !== "image" || !["uploaded", "processing", "ready"].includes(asset.status)) {
    throw new ValidationError("file_type_not_allowed");
  }
  const old = await currentPhoto(userId);
  if (old?.id === assetId) return;
  if (old) await deletePhotoObjects(old);
  await withActor(actor, async (tx) => {
    const updated = await tx
      .update(personnel)
      .set({ photoAssetId: assetId })
      .where(eq(personnel.userId, userId))
      .returning({ userId: personnel.userId });
    if (updated.length === 0) throw new NotFoundError("person");
    if (old) await tx.update(mediaAssets).set({ status: "purged" }).where(eq(mediaAssets.id, old.id));
  });
}

/** Profil fotoğrafını kaldırır (kişi ya da İK). */
export async function removeProfilePhoto(actor: Actor, userId: string): Promise<void> {
  assertUser(actor);
  if (!(await canEditPhotoOf(actor, userId))) throw new ForbiddenError("profile.photo");
  const old = await currentPhoto(userId);
  if (!old) return;
  await deletePhotoObjects(old);
  await withActor(actor, async (tx) => {
    await tx.update(personnel).set({ photoAssetId: null }).where(eq(personnel.userId, userId));
    await tx.update(mediaAssets).set({ status: "purged" }).where(eq(mediaAssets.id, old.id));
  });
}

/**
 * Açık rıza kararı (onay ekranında ya da profilde). Onay ekranında yalnızca karar bekleniyorsa yazılır.
 * Profilde durum değişmiyorsa bir şey yazılmaz. Rıza verilmezse/geri alınırsa profil fotoğrafı silinir.
 */
export async function decideExplicitConsent(
  actor: Actor,
  input: { legalTextId: string; granted: boolean; source: "consent_screen" | "profile" },
  meta: Pick<RequestMeta, "ip" | "userAgent">,
): Promise<void> {
  assertUser(actor);
  await assertCurrentExplicitText(input.legalTextId);
  const state = await explicitConsentState(actor.userId);
  if (input.source === "consent_screen" && !state.pending) return;
  if (input.source === "profile" && !state.pending && state.granted === input.granted) return;
  const old = input.granted ? null : await currentPhoto(actor.userId);
  if (old) await deletePhotoObjects(old);
  await withActor(actor, async (tx) => {
    await insertExplicitDecision(tx, actor, input, meta);
    if (old) {
      await tx.update(personnel).set({ photoAssetId: null }).where(eq(personnel.userId, actor.userId));
      await tx.update(mediaAssets).set({ status: "purged" }).where(eq(mediaAssets.id, old.id));
    }
  });
}

export type PersonPhoto = { photo: AssetInfo | null; consent: boolean; canEdit: boolean };

/** Personel ekranı için fotoğraf ve düzenleme durumu (kişiyi görebilen yönetici). */
export async function personPhoto(actor: Actor, userId: string): Promise<PersonPhoto> {
  assertUser(actor);
  if (!(await canViewProfilePhotoOf(actor, userId))) throw new NotFoundError("person");
  const [row] = await db().select({ photoAssetId: personnel.photoAssetId }).from(personnel).where(eq(personnel.userId, userId)).limit(1);
  if (!row) throw new NotFoundError("person");
  const [photo, consent, canEdit] = await Promise.all([photoInfo(row.photoAssetId), hasExplicitConsent(userId), canEditPhotoOf(actor, userId)]);
  return { photo, consent, canEdit };
}

async function canViewProfilePhotoOf(actor: Actor, userId: string): Promise<boolean> {
  if (await canViewPerson(actor, userId)) return true;
  return can(actor, "people.view") && (await isPersonInScope(actor, userId));
}

/** Medya erişimi: dosya birinin profil fotoğrafıysa o kişiyi görebilenler. */
export async function canViewProfilePhoto(actor: Actor, assetId: string): Promise<boolean> {
  const [row] = await db().select({ userId: personnel.userId }).from(personnel).where(eq(personnel.photoAssetId, assetId)).limit(1);
  return !!row && (await canViewProfilePhotoOf(actor, row.userId));
}

/** Gece saklama işi: anonimleştirilen kişilerin profil fotoğrafları depodan silinir ve bağ kaldırılır. */
export async function purgeAnonymizedProfilePhotos(actor: Actor, limit = 200): Promise<number> {
  const rows = await db()
    .select({ userId: personnel.userId, id: mediaAssets.id, objectKey: mediaAssets.objectKey, derived: mediaAssets.derived })
    .from(personnel)
    .innerJoin(mediaAssets, eq(mediaAssets.id, personnel.photoAssetId))
    .where(and(isNotNull(personnel.anonymizedAt), ne(mediaAssets.status, "purged")))
    .limit(limit);
  if (rows.length === 0) return 0;
  await deleteObjects(rows.flatMap(objectKeys));
  await withActor(actor, async (tx) => {
    for (const r of rows) {
      await tx.update(personnel).set({ photoAssetId: null }).where(eq(personnel.userId, r.userId));
      await tx.update(mediaAssets).set({ status: "purged" }).where(eq(mediaAssets.id, r.id));
    }
  });
  return rows.length;
}
