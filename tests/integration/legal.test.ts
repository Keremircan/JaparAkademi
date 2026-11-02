import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { consents, legalTexts } from "@/server/db/schema";
import { db } from "@/server/db/client";
import { withActor } from "@/server/db/with-actor";
import { placeholdersIn } from "@/lib/legal";
import { ForbiddenError, isImmutableViolation } from "@/server/errors";
import { acceptConsent, createDraft, createSampleDrafts, listTexts, pendingConsent, publishText, updateDraft } from "@/server/services/legal";
import { SAMPLE_KINDS } from "@/server/services/legal-samples";
import { setSetting } from "@/server/services/settings";
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

describe("Örnek metinler ve doldurulacak alanlar (iş paketi 3.8)", () => {
  /** `[[...]]` alanlarını doldurur (İK'nın kurum bilgilerini yazması). */
  const fill = (s: string) => s.replace(/\[\[[^\]]+\]\]/g, "JAPAR");

  it("FG-1.6 örnek metinle başla: türün TR + EN taslağı aynı sürümle açılır, saklama süreleri parametreden gelir (karar #245)", async () => {
    const admin = await createTestUser({ roles: ["sysadmin"] });
    await setSetting(admin.actor, "retention.personnel_years_after_exit", 12);
    const hr = await createTestUser({ roles: ["hr"] });
    await publishBoth(hr.actor);

    for (const kind of SAMPLE_KINDS) {
      const { version } = await createSampleDrafts(hr.actor, kind);
      const drafts = (await listTexts(hr.actor, kind)).filter((r) => !r.publishedAt);
      expect(drafts.map((r) => r.locale).sort()).toEqual(["en", "tr"]);
      expect(drafts.every((r) => r.version === version && r.createdBy === hr.userId)).toBe(true);
      for (const r of drafts) expect(placeholdersIn(r.title, r.body).length).toBeGreaterThan(0);
    }
    // Yayınlanmış sürüm 1'in üstüne sürüm 2 açılır
    const personnel = (await listTexts(hr.actor, "kvkk_personnel")).filter((r) => !r.publishedAt);
    expect(personnel[0]?.version).toBe(2);
    expect(personnel.find((r) => r.locale === "tr")?.body).toContain("12 yıl saklanır");

    // Taslak varken ikinci örnek ya da yeni taslak açılmaz
    await expect(createSampleDrafts(hr.actor, "kvkk_personnel")).rejects.toMatchObject({ code: "draft_exists" });
    await expect(createDraft(hr.actor, text)).rejects.toMatchObject({ code: "draft_exists" });
  });

  it("FG-1.6 [[...]] alanları her dilde doldurulmadan yayınlanmaz; doldurulunca yayınlanır ve onay istenir (karar #246)", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const worker = await createTestUser();
    await createSampleDrafts(hr.actor, "kvkk_personnel");
    const drafts = await listTexts(hr.actor, "kvkk_personnel");
    const tr = drafts.find((r) => r.locale === "tr")!;
    const en = drafts.find((r) => r.locale === "en")!;

    await expect(publishText(hr.actor, tr.id)).rejects.toMatchObject({ code: "legal_placeholders" });
    await updateDraft(hr.actor, tr.id, { title: tr.title, body: fill(tr.body) });
    // İngilizcede alan kaldıkça yine yayınlanmaz
    await expect(publishText(hr.actor, en.id)).rejects.toMatchObject({ code: "legal_placeholders" });
    expect(await pendingConsent(worker.userId)).toBeNull();

    await updateDraft(hr.actor, en.id, { title: en.title, body: fill(en.body) });
    await publishText(hr.actor, tr.id);
    expect((await pendingConsent(worker.userId))?.id).toBe(tr.id);
  });

  it("başlıktaki alan da yayını engeller; elle yazılan taslakta da kural aynıdır", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const tr = await createDraft(hr.actor, { ...text, title: "Aydınlatma Metni [[Yıl]]" });
    await createDraft(hr.actor, english, "kvkk_personnel", "en");
    await expect(publishText(hr.actor, tr.id)).rejects.toMatchObject({ code: "legal_placeholders" });
    await updateDraft(hr.actor, tr.id, text);
    await publishText(hr.actor, tr.id);
  });

  it("örnek metni yalnızca metni yöneten açar; ziyaretçi kurallarının örneği yoktur (karar #5, #245)", async () => {
    for (const roles of [["sysadmin"], ["ohs_specialist"], []] as const) {
      const u = await createTestUser({ roles: [...roles] });
      for (const kind of SAMPLE_KINDS) await expect(createSampleDrafts(u.actor, kind)).rejects.toBeInstanceOf(ForbiddenError);
    }
    const ohs = await createTestUser({ roles: ["ohs_specialist"] });
    await expect(createSampleDrafts(ohs.actor, "visitor_rules")).rejects.toMatchObject({ code: "invalid_input" });
    expect(await listTexts(ohs.actor, "visitor_rules")).toHaveLength(0);
  });
});
