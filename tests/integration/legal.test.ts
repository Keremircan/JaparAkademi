import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { consents, legalTexts } from "@/server/db/schema";
import { db } from "@/server/db/client";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, isImmutableViolation } from "@/server/errors";
import { acceptConsent, createDraft, pendingConsent, publishText, updateDraft } from "@/server/services/legal";
import { createTestUser } from "../support/factories";

const text = { title: "Aydınlatma Metni", body: "Kişisel verileriniz eğitim süreçleri için işlenmektedir. ".repeat(3) };
const meta = { ip: "10.0.0.1", userAgent: "vitest" };
const english = { title: "Privacy Notice", body: "Your personal data is processed for training purposes. ".repeat(3) };

/** Personel metni TR + EN birlikte yayınlanır (karar #207); Türkçe taslağın kimliği döner. */
async function publishBoth(actor: Parameters<typeof createDraft>[0], input = text, en = english) {
  const tr = await createDraft(actor, input);
  await createDraft(actor, en, "kvkk_personnel", "en");
  await publishText(actor, tr.id);
  return tr;
}

describe("KVKK aydınlatma onayı (SPEC 13.3)", () => {
  it("yayınlanmış metin yokken onay istenmez; taslak onay istemez", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const worker = await createTestUser();
    expect(await pendingConsent(worker.userId)).toBeNull();
    await createDraft(hr.actor, text);
    expect(await pendingConsent(worker.userId)).toBeNull();
  });

  it("yayınlanınca onay istenir; onaylayınca kalkar; yeni sürümde yeniden istenir", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const worker = await createTestUser();
    const v1 = await publishBoth(hr.actor);
    expect((await pendingConsent(worker.userId))?.id).toBe(v1.id);

    await acceptConsent(worker.actor, v1.id, meta);
    await acceptConsent(worker.actor, v1.id, meta); // tekrar onay sessizce yok sayılır
    expect(await pendingConsent(worker.userId)).toBeNull();

    await publishBoth(hr.actor, { ...text, title: "Aydınlatma Metni v2" });
    expect((await pendingConsent(worker.userId))?.version).toBe(2);
    await expect(acceptConsent(worker.actor, v1.id, meta)).rejects.toMatchObject({ code: "legal_text_outdated" });
  });

  it("yayınlanmış metin değiştirilemez; aynı anda tek taslak olur", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const v1 = await createDraft(hr.actor, text);
    await expect(createDraft(hr.actor, text)).rejects.toMatchObject({ code: "draft_exists" });
    await updateDraft(hr.actor, v1.id, { ...text, title: "Düzeltilmiş başlık" });
    await expect(publishText(hr.actor, v1.id)).rejects.toMatchObject({ code: "legal_locale_missing" });
    await createDraft(hr.actor, english, "kvkk_personnel", "en");
    await publishText(hr.actor, v1.id);
    await expect(updateDraft(hr.actor, v1.id, text)).rejects.toMatchObject({ code: "already_published" });

    const err = await withActor(hr.actor, (tx) => tx.update(legalTexts).set({ body: "değişti" }).where(eq(legalTexts.id, v1.id))).catch(
      (e: unknown) => e,
    );
    expect(isImmutableViolation(err)).toBe(true);
  });

  it("onay kaydı değiştirilemez ve silinemez", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const worker = await createTestUser();
    const v1 = await publishBoth(hr.actor);
    await acceptConsent(worker.actor, v1.id, meta);
    const err = await withActor(hr.actor, (tx) => tx.delete(consents).where(eq(consents.userId, worker.userId))).catch((e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);
  });

  it("FG-8.2 personel metni TR + EN; kişi kendi dilindeki metni görür ve onayı o dildeki metne kaydedilir (karar #207)", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const worker = await createTestUser();
    const tr = await publishBoth(hr.actor);
    const shown = await pendingConsent(worker.userId, "en");
    expect(shown).toMatchObject({ locale: "en", title: english.title });
    expect((await pendingConsent(worker.userId, "tr"))?.id).toBe(tr.id);
    // İngilizce metnin onayı aynı sürüm için yeterlidir; Türkçe tekrar istenmez
    await acceptConsent(worker.actor, shown!.id, meta);
    expect(await pendingConsent(worker.userId, "tr")).toBeNull();
    const [row] = await db().select({ locale: legalTexts.locale }).from(consents).innerJoin(legalTexts, eq(legalTexts.id, consents.legalTextId)).where(eq(consents.userId, worker.userId));
    expect(row?.locale).toBe("en");
  });

  it("metni yalnızca İK yönetir (karar #5)", async () => {
    for (const roles of [["sysadmin"], ["ohs_specialist"], []] as const) {
      const u = await createTestUser({ roles: [...roles] });
      await expect(createDraft(u.actor, text)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
});
