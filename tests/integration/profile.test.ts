import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { explicitConsents, mediaAssets, personnel } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { isImmutableViolation } from "@/server/errors";
import { stopJobSender } from "@/server/jobs/send";
import { consentScreenPending, createDraft, explicitConsentState, publishText } from "@/server/services/legal";
import { completeUpload, getAssetForViewer, startUpload } from "@/server/services/media";
import { decideExplicitConsent, myProfile, personPhoto, removeProfilePhoto, setProfilePhoto, updateOwnPhone } from "@/server/services/profile";
import { runRetention } from "@/server/services/retention";
import { subtractYears } from "@/server/state/retention";
import { headObject } from "@/server/storage/client";
import { todayIn } from "@/lib/dates";
import { owner } from "../support/db";
import { createTestUser } from "../support/factories";
import { testSignaturePng } from "../support/signature";

afterAll(async () => {
  await stopJobSender();
});

type TestUser = Awaited<ReturnType<typeof createTestUser>>;
const meta = { ip: "10.0.0.7", userAgent: "vitest" };
const KIND = "explicit_consent_personnel" as const;
const tr = { title: "Açık Rıza Metni", body: "Profil fotoğrafınızın işlenmesine açık rıza vermeniz istenmektedir. ".repeat(2) };
const en = { title: "Explicit Consent", body: "We ask for your explicit consent to process your profile photo. ".repeat(2) };

/** Açık rıza metnini TR + EN yayınlar; Türkçe metnin kimliği döner. */
async function publishExplicit(hr: TestUser, title = tr.title): Promise<string> {
  const draft = await createDraft(hr.actor, { ...tr, title }, KIND, "tr");
  await createDraft(hr.actor, en, KIND, "en");
  await publishText(hr.actor, draft.id);
  return draft.id;
}

/** Profil fotoğrafı olarak görsel yükler (dosya depoya gerçekten gider). */
async function uploadPhoto(u: TestUser, seed = 1): Promise<string> {
  const body = Buffer.from(testSignaturePng(seed).split(",")[1]!, "base64");
  const plan = await startUpload(u.actor, { kind: "image", mime: "image/png", size: body.byteLength, fileName: "ben.png", purpose: "profile_photo" });
  if (plan.mode !== "single") throw new Error("single bekleniyordu");
  const res = await fetch(plan.url, { method: "PUT", body: new Uint8Array(body), headers: { "Content-Type": "image/png" } });
  expect(res.ok).toBe(true);
  await completeUpload(u.actor, { assetId: plan.assetId });
  return plan.assetId;
}

async function asset(id: string) {
  const [row] = await db().select().from(mediaAssets).where(eq(mediaAssets.id, id));
  return row!;
}

describe("Profil ve açık rıza (iş paketi 3.4, kararlar #230–236)", () => {
  it("FG-1.6 açık rıza ayrı ve isteğe bağlı: vermeyen devam eder, karar bir kez sorulur, yeni sürümde yeniden sorulur", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const worker = await createTestUser();
    // Yayınlanmış metin yokken sorulmaz
    expect(await explicitConsentState(worker.userId)).toMatchObject({ text: null, pending: false, granted: false });
    expect(await consentScreenPending(worker.userId)).toBe(false);

    const v1 = await publishExplicit(hr);
    expect(await explicitConsentState(worker.userId, "en")).toMatchObject({ pending: true, granted: false, text: { locale: "en", title: en.title } });
    expect(await consentScreenPending(worker.userId)).toBe(true);

    // Onay ekranında rıza vermedi: ekran kalkar, rıza yok
    await decideExplicitConsent(worker.actor, { legalTextId: v1, granted: false, source: "consent_screen" }, meta);
    expect(await consentScreenPending(worker.userId)).toBe(false);
    // Aynı sürüm için onay ekranından ikinci karar yazılmaz
    await decideExplicitConsent(worker.actor, { legalTextId: v1, granted: true, source: "consent_screen" }, meta);
    expect((await explicitConsentState(worker.userId)).granted).toBe(false);

    // Profilden verir, sonra geri alır; aynı durum tekrar yazılmaz
    await decideExplicitConsent(worker.actor, { legalTextId: v1, granted: true, source: "profile" }, meta);
    await decideExplicitConsent(worker.actor, { legalTextId: v1, granted: true, source: "profile" }, meta);
    expect((await explicitConsentState(worker.userId)).granted).toBe(true);
    await decideExplicitConsent(worker.actor, { legalTextId: v1, granted: false, source: "profile" }, meta);
    const rows = await db().select().from(explicitConsents).where(eq(explicitConsents.userId, worker.userId));
    expect(rows.map((r) => [r.granted, r.source])).toEqual([
      [false, "consent_screen"],
      [true, "profile"],
      [false, "profile"],
    ]);
    expect(rows[0]).toMatchObject({ ip: meta.ip, userAgent: meta.userAgent });
    expect(rows[0]!.decidedAt).toBeInstanceOf(Date);

    // Yeni sürüm: karar yeniden sorulur, eski sürüme karar verilemez
    await publishExplicit(hr, "Açık Rıza Metni v2");
    expect(await consentScreenPending(worker.userId)).toBe(true);
    await expect(decideExplicitConsent(worker.actor, { legalTextId: v1, granted: true, source: "profile" }, meta)).rejects.toMatchObject({
      code: "legal_text_outdated",
    });
  });

  it("açık rıza kaydı değiştirilemez ve silinemez", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const worker = await createTestUser();
    const v1 = await publishExplicit(hr);
    await decideExplicitConsent(worker.actor, { legalTextId: v1, granted: true, source: "consent_screen" }, meta);
    for (const run of [
      () => withActor(hr.actor, (tx) => tx.update(explicitConsents).set({ granted: false }).where(eq(explicitConsents.userId, worker.userId))),
      () => withActor(hr.actor, (tx) => tx.delete(explicitConsents).where(eq(explicitConsents.userId, worker.userId))),
    ]) {
      expect(isImmutableViolation(await run().catch((e: unknown) => e))).toBe(true);
    }
  });

  it("profil fotoğrafı: rıza gerekir; kişi ve İK yükler; kişiyi görebilenler görür; rıza geri alınınca silinir", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const worker = await createTestUser();
    const other = await createTestUser();
    // Personel kütüphane medyası yükleyemez ama profil fotoğrafı yükleyebilir
    await expect(startUpload(worker.actor, { kind: "image", mime: "image/png", size: 10, fileName: "a.png" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      startUpload(worker.actor, { kind: "pdf", mime: "application/pdf", size: 10, fileName: "a.pdf", purpose: "profile_photo" }),
    ).rejects.toMatchObject({ code: "file_type_not_allowed" });

    const v1 = await publishExplicit(hr);
    const first = await uploadPhoto(worker, 1);
    await expect(setProfilePhoto(worker.actor, worker.userId, first)).rejects.toMatchObject({ code: "photo_consent_required" });

    await decideExplicitConsent(worker.actor, { legalTextId: v1, granted: true, source: "consent_screen" }, meta);
    await setProfilePhoto(worker.actor, worker.userId, first);
    expect((await myProfile(worker.actor)).photo?.id).toBe(first);

    // Görünürlük: kendisi ve İK görür; başka personel göremez, başkasının fotoğrafını değiştiremez
    expect(await getAssetForViewer(hr.actor, first)).not.toBeNull();
    expect(await getAssetForViewer(other.actor, first)).toBeNull();
    await expect(personPhoto(other.actor, worker.userId)).rejects.toMatchObject({ code: "not_found" });
    const otherUpload = await uploadPhoto(other, 2);
    await expect(setProfilePhoto(other.actor, worker.userId, otherUpload)).rejects.toMatchObject({ code: "forbidden" });
    await expect(removeProfilePhoto(other.actor, worker.userId)).rejects.toMatchObject({ code: "forbidden" });
    // Başkasının yüklediği dosya bağlanamaz
    await expect(setProfilePhoto(worker.actor, worker.userId, otherUpload)).rejects.toMatchObject({ code: "not_found" });

    // İK yeni fotoğraf yükler: eskisi depodan silinir
    expect(await personPhoto(hr.actor, worker.userId)).toMatchObject({ consent: true, canEdit: true, photo: { id: first } });
    const second = await uploadPhoto(hr, 3);
    await setProfilePhoto(hr.actor, worker.userId, second);
    expect((await asset(first)).status).toBe("purged");
    expect(await headObject((await asset(first)).objectKey)).toBeNull();

    // Rıza geri alınınca fotoğraf silinir ve yenisi bağlanamaz
    await decideExplicitConsent(worker.actor, { legalTextId: v1, granted: false, source: "profile" }, meta);
    const [p] = await db().select({ photo: personnel.photoAssetId }).from(personnel).where(eq(personnel.userId, worker.userId));
    expect(p!.photo).toBeNull();
    expect((await asset(second)).status).toBe("purged");
    expect(await headObject((await asset(second)).objectKey)).toBeNull();
    await expect(setProfilePhoto(hr.actor, worker.userId, await uploadPhoto(hr, 4))).rejects.toMatchObject({ code: "photo_consent_required" });
  });

  it("telefonu kişi değiştirir (+90 biçimi); profilde ad, sicil, birim, pozisyon, iletişim", async () => {
    const worker = await createTestUser({ email: "kisi@japar.test" });
    await updateOwnPhone(worker.actor, "0532 123 45 67");
    let profile = await myProfile(worker.actor);
    expect(profile).toMatchObject({ phone: "+905321234567", email: "kisi@japar.test", sicilNo: worker.sicilNo, photo: null });
    expect(profile.fullName.length).toBeGreaterThan(1);
    await expect(updateOwnPhone(worker.actor, "12ab")).rejects.toMatchObject({ code: "phone_invalid" });
    await updateOwnPhone(worker.actor, "  ");
    profile = await myProfile(worker.actor);
    expect(profile.phone).toBeNull();
  });

  it("FG-12.3 anonimleştirmede profil fotoğrafı silinir, açık rıza kaydındaki IP/tarayıcı temizlenir", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const worker = await createTestUser();
    const v1 = await publishExplicit(hr);
    await decideExplicitConsent(worker.actor, { legalTextId: v1, granted: true, source: "consent_screen" }, meta);
    const photo = await uploadPhoto(worker, 5);
    await setProfilePhoto(worker.actor, worker.userId, photo);
    const today = todayIn("Europe/Istanbul");
    await owner()`update personnel set status = 'terminated', end_date = ${subtractYears(today, 16)} where user_id = ${worker.userId}`;

    const result = await runRetention(systemActor("test:retention"));
    expect(result.anonymized).toBe(1);
    expect(result.images).toBeGreaterThanOrEqual(1);
    const [p] = await db().select({ photo: personnel.photoAssetId }).from(personnel).where(eq(personnel.userId, worker.userId));
    expect(p!.photo).toBeNull();
    expect((await asset(photo)).status).toBe("purged");
    expect(await headObject((await asset(photo)).objectKey)).toBeNull();
    const [row] = await db().select().from(explicitConsents).where(eq(explicitConsents.userId, worker.userId));
    expect(row).toMatchObject({ ip: null, userAgent: null, granted: true });
  });
});
