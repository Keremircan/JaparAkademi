import { desc, eq } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertUser } from "@/server/authz/policy";
import { db } from "@/server/db/client";
import { personErasures, personnel } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { messagesFor } from "@/server/i18n/messages";
import { logger } from "@/server/logger";
import { APP_LOCALES } from "@/lib/locale";
import { cleanEraseReason, confirmationMatches, confirmationPhrase } from "@/lib/erasure";
import type { ResetBlock } from "@/server/state/invitations";
import { checkDeletion } from "./deletion";
import { purgeAnonymizedProfilePhotos } from "./profile";
import { anonymizePeople, purgeAnonymizedSignatureImages } from "./retention";

/**
 * Kişiyi kalıcı silme (kararlar #264–267): üst yönetici, işten ayrılmış kişinin kişisel verisini saklama süresini
 * beklemeden siler. Silme = gece saklama işiyle aynı anonimleştirme (değiştirilemez kayıtlara yalnızca veritabanı
 * fonksiyonu dokunur); eğitim, sınav ve sertifika kayıtları "Anonim #…" adıyla kalır, başkalarının kayıtları bozulmaz.
 * İşlem `person_erasures`'a yazılır (KVKK silme kaydı). Fotoğraf ve imza görselleri hemen depodan silinir.
 */
export async function erasePerson(
  actor: Actor,
  userId: string,
  input: { reason: string; confirmation: string },
): Promise<{ label: string }> {
  assertCan(actor, "people.erase");
  assertUser(actor);
  if (actor.userId === userId) throw new ForbiddenError("self_action");

  const [person] = await db()
    .select({ fullName: personnel.fullName, status: personnel.status, anonymizedAt: personnel.anonymizedAt })
    .from(personnel)
    .where(eq(personnel.userId, userId))
    .limit(1);
  if (!person) throw new NotFoundError("person");
  if (person.anonymizedAt) throw new ValidationError("person_erased");
  if (person.status !== "terminated") throw new ValidationError("person_not_terminated");

  const reason = cleanEraseReason(input.reason);
  if (!reason) throw new ValidationError("erase_reason_required");
  // Onay metni ekrandaki dilde yazılır; iki dilin metni de kabul edilir (karar #265)
  const accepted = APP_LOCALES.some((locale) =>
    confirmationMatches(input.confirmation, confirmationPhrase(messagesFor(locale).admin.people.erase.phrase, person.fullName)),
  );
  if (!accepted) throw new ValidationError("erase_confirmation_mismatch");

  const label = await withActor(actor, async (tx) => {
    const done = await anonymizePeople(tx, [userId]);
    // Aynı anda başka bir silme ya da gece işi çalıştıysa
    if (done.length === 0) throw new ValidationError("person_erased");
    await tx.insert(personErasures).values({ userId, erasedBy: actor.userId, reason });
    const [row] = await tx.select({ fullName: personnel.fullName }).from(personnel).where(eq(personnel.userId, userId)).limit(1);
    return row!.fullName;
  });

  // Depo erişilemezse kayıtlar "purged" olmaz; gece saklama işi yeniden dener
  try {
    await purgeAnonymizedSignatureImages(actor, [userId]);
    await purgeAnonymizedProfilePhotos(actor, 10, [userId]);
  } catch (err) {
    logger.error({ err, userId }, "Silinen kişinin görselleri depodan silinemedi");
  }
  return { label };
}

export type ErasureInfo = { erasedAt: Date; erasedByName: string; reason: string };

/** Kişi sayfası: kişisel veriler ne zaman, kimin tarafından, hangi gerekçeyle silindi (yalnızca üst yönetici görür). */
export async function erasureInfo(actor: Actor, userId: string): Promise<ErasureInfo | null> {
  assertCan(actor, "people.erase");
  const [row] = await db()
    .select({ erasedAt: personErasures.erasedAt, erasedByName: personnel.fullName, reason: personErasures.reason })
    .from(personErasures)
    .innerJoin(personnel, eq(personnel.userId, personErasures.erasedBy))
    .where(eq(personErasures.userId, userId))
    .orderBy(desc(personErasures.erasedAt))
    .limit(1);
  return row ?? null;
}

/**
 * Kişi sayfasında hangi silme yolunun geçerli olduğu (karar #290). Sayfa açılırken "Kişiyi sil" düğmesinin yaptığı
 * denetim (deneme silme + geri alma, `checkDeletion`) yapılır; sayfa böylece yolu baştan söyler:
 * - `delete`: geçmiş kaydı yok; İK kişiyi doğrudan siler, işten ayrıldı işaretlemesi gerekmez (karar #285);
 * - `history`: geçmiş kaydı var; kişi işten ayrıldı yapılır, kişisel verileri üst yönetici siler (kararlar #264–267);
 * - `owner_only` / `sysadmin_only`: bu kişiyi silmeye yetkiniz yok (şifre sıfırlamadaki kural, `resetBlock`).
 */
export type PersonDeletePath = "delete" | "history" | ResetBlock;

export async function personDeletePath(actor: Actor, userId: string): Promise<PersonDeletePath> {
  try {
    // Kişinin önce silinmesi gereken bağlı kaydı tanımlı değil: sonuç "ok" ya da "history"
    return (await checkDeletion(actor, "person", userId)).state === "ok" ? "delete" : "history";
  } catch (err) {
    if (err instanceof ForbiddenError && (err.permission === "owner_only" || err.permission === "sysadmin_only")) return err.permission;
    throw err;
  }
}
