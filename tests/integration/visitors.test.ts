import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { auditLog, blacklistEntries, notifications, visitorBriefingCards, visitorBriefings, visitors, visits } from "@/server/db/schema";
import { ForbiddenError, isImmutableViolation, NotFoundError, ValidationError } from "@/server/errors";
import { todayIn } from "@/lib/dates";
import { createDraft, publishText } from "@/server/services/legal";
import { anonymizeDueVisitors, anonymizeLiftedBlacklist } from "@/server/services/retention";
import { setSetting } from "@/server/services/settings";
import {
  addToBlacklist,
  cancelVisit,
  createBriefingDraft,
  createCompany,
  createVisit,
  getBriefing,
  getVisit,
  liftBlacklist,
  listBriefings,
  listCompanies,
  listVisits,
  publishBriefing,
  saveBriefingDraft,
  setCompanyArchived,
  updateVisit,
} from "@/server/services/visitors";
import { subtractYears } from "@/server/state/retention";
import { owner } from "../support/db";
import { createTestUser } from "../support/factories";
import { testNationalId } from "../support/national-id";

const today = () => todayIn("Europe/Istanbul");
const visit = (extra: object = {}) => ({ visitorType: "office" as const, plannedDate: today(), fullName: "Ayşe Ziyaretçi", ...extra });

async function roles() {
  const security = await createTestUser({ roles: ["security"] });
  const ohs = await createTestUser({ roles: ["ohs_specialist"] });
  const host = await createTestUser();
  const other = await createTestUser();
  return { security, ohs, host, other };
}

describe("Ziyaret ön kaydı (SPEC 8.2, iş paketi 2.2)", () => {
  it("FG-8 ev sahibi kendi ziyaretçisini kaydeder ve yalnızca kendi ziyaretlerini görür", async () => {
    const { host, other } = await roles();
    const { id } = await createVisit(host.actor, visit({ email: "Ayse@Firma.com" }));
    const mine = await listVisits(host.actor, { scope: "mine" });
    expect(mine.map((r) => r.id)).toEqual([id]);
    expect(mine[0]).toMatchObject({ nationalIdMasked: null, blacklisted: false });
    expect(await listVisits(other.actor, { scope: "mine" })).toHaveLength(0);
    await expect(getVisit(other.actor, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listVisits(host.actor, { scope: "all" })).rejects.toBeInstanceOf(ForbiddenError);
    const [row] = await db().select().from(visitors).innerJoin(visits, eq(visits.visitorId, visitors.id)).where(eq(visits.id, id));
    expect(row!.visitors.email).toBe("ayse@firma.com");
  });

  it("ev sahibi kimlik no giremez, başkası adına kayıt açamaz", async () => {
    const { host, other } = await roles();
    await expect(createVisit(host.actor, visit({ id: { idKind: "tc", idNumber: testNationalId(11) } }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createVisit(host.actor, visit({ hostSicilNo: other.sicilNo }))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("güvenlik başkası adına kayıt açar; aynı kimlik no aynı ziyaretçidir (taşeron tanınır)", async () => {
    const { security, host } = await roles();
    const tc = testNationalId(22);
    const a = await createVisit(security.actor, visit({ hostSicilNo: host.sicilNo, id: { idKind: "tc", idNumber: tc } }));
    const b = await createVisit(security.actor, visit({ fullName: "Ayşe Z. Yeni", id: { idKind: "tc", idNumber: tc } }));
    const rows = await db().select({ visitorId: visits.visitorId, hostUserId: visits.hostUserId }).from(visits);
    const va = rows.find((r) => r.hostUserId === host.userId)!;
    expect(new Set(rows.map((r) => r.visitorId)).size).toBe(1);
    const detail = await getVisit(security.actor, a.id);
    expect(detail.nationalIdMasked).toMatch(/^\d{3}\*{6}\d{2}$/);
    expect(detail.fullName).toBe("Ayşe Z. Yeni");
    // Ev sahibi kendi ziyaretinde kimliği görmez
    const hostView = await getVisit(host.actor, a.id);
    expect(hostView).toMatchObject({ nationalIdMasked: null, idKind: null, canSetId: false });
    expect(va.visitorId).toBeTruthy();
    expect(b.id).not.toBe(a.id);
    await expect(createVisit(security.actor, visit({ hostSicilNo: "YOK-9999" }))).rejects.toMatchObject({ code: "host_not_found" });
    await expect(createVisit(security.actor, visit({ id: { idKind: "tc", idNumber: "12345678901" } }))).rejects.toMatchObject({ code: "national_id_invalid" });
    await createVisit(security.actor, visit({ id: { idKind: "passport", idCountry: "DE", idNumber: "C01X00T47" } }));
    await expect(createVisit(security.actor, visit({ id: { idKind: "passport", idCountry: "Almanya", idNumber: "C01X00T47" } }))).rejects.toMatchObject({
      code: "passport_invalid",
    });
  });

  it("taşeron tipinde etkin firma zorunlu; kapalı tip ve geçmiş tarih reddedilir", async () => {
    const { security, ohs, host } = await roles();
    await expect(createVisit(host.actor, visit({ visitorType: "contractor" }))).rejects.toMatchObject({ code: "company_required" });
    const { id: companyId } = await createCompany(security.actor, { name: "Bakım A.Ş.", taxNo: "1234567890" });
    const v = await createVisit(host.actor, visit({ visitorType: "contractor", contractorCompanyId: companyId, companyName: "yanlış ad" }));
    expect((await getVisit(host.actor, v.id)).companyName).toBe("Bakım A.Ş.");
    await setCompanyArchived(security.actor, companyId, true);
    await expect(createVisit(host.actor, visit({ visitorType: "contractor", contractorCompanyId: companyId }))).rejects.toMatchObject({ code: "company_required" });
    await expect(createVisit(host.actor, visit({ plannedDate: subtractYears(today(), 1) }))).rejects.toMatchObject({ code: "date_in_past" });
    const types = { office: { enabled: false, questionCount: 0, passScore: 100, cardMinSeconds: 10, validityYears: 0 } };
    await setSetting(ohs.actor, "visitor.types", {
      ...types,
      site: { enabled: true, questionCount: 3, passScore: 100, cardMinSeconds: 15, validityYears: 0 },
      contractor: { enabled: true, questionCount: 10, passScore: 80, cardMinSeconds: 20, validityYears: 1 },
    });
    await expect(createVisit(host.actor, visit())).rejects.toMatchObject({ code: "visitor_type_disabled" });
  });

  it("FG-8 iptal gerekçeli; bilgilendirme başlayınca ziyaret değiştirilemez", async () => {
    const { host, other, security } = await roles();
    const { id } = await createVisit(host.actor, visit());
    await expect(cancelVisit(other.actor, id, "Gelmeyecek")).rejects.toBeInstanceOf(NotFoundError);
    await updateVisit(host.actor, id, visit({ fullName: "Düzeltilmiş Ad", note: "Toplantı" }));
    expect((await getVisit(host.actor, id)).fullName).toBe("Düzeltilmiş Ad");
    await owner()`update visits set status = 'briefed' where id = ${id}`;
    await expect(updateVisit(host.actor, id, visit())).rejects.toMatchObject({ code: "visit_locked" });
    await expect(cancelVisit(host.actor, id, "")).rejects.toMatchObject({ code: "reason_required" });
    await cancelVisit(security.actor, id, "Toplantı ertelendi");
    const v = await getVisit(host.actor, id);
    expect(v).toMatchObject({ status: "cancelled", cancelReason: "Toplantı ertelendi", canEdit: false, canCancel: false });
    await expect(cancelVisit(host.actor, id, "Tekrar")).rejects.toMatchObject({ code: "visit_locked" });
  });
});

describe("Kara liste (FG-8.4)", () => {
  it("yalnızca İSG uzmanı ve güvenlik ekler; güvenlik ve İSG listede işaretli görür, ev sahibi görmez", async () => {
    const { security, ohs, host } = await roles();
    const tc = testNationalId(33);
    await expect(addToBlacklist(host.actor, { fullName: "Yasaklı Kişi", idKind: "tc", idNumber: tc, reason: "Tesis kurallarını ihlal" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await addToBlacklist(security.actor, { fullName: "Yasaklı Kişi", idKind: "tc", idNumber: tc, reason: "Tesis kurallarını ihlal etti" });
    await expect(addToBlacklist(ohs.actor, { fullName: "Yasaklı", idKind: "tc", idNumber: tc, reason: "Tekrar ekleme denemesi" })).rejects.toMatchObject({
      code: "blacklist_exists",
    });
    // İSG uzmanına bildirim
    const notes = await db().select().from(notifications).where(eq(notifications.userId, ohs.userId));
    expect(notes.map((n) => n.kind)).toContain("blacklist_added");

    const v = await createVisit(security.actor, visit({ hostSicilNo: host.sicilNo, id: { idKind: "tc", idNumber: tc } }));
    expect((await listVisits(security.actor, { scope: "all" })).find((r) => r.id === v.id)?.blacklisted).toBe(true);
    expect((await listVisits(ohs.actor, { scope: "all" })).find((r) => r.id === v.id)?.blacklisted).toBe(true);
    expect((await getVisit(security.actor, v.id)).blacklisted).toBe(true);
    expect((await listVisits(host.actor, { scope: "mine" }))[0]?.blacklisted).toBe(false);
    expect((await getVisit(host.actor, v.id)).blacklisted).toBe(false);
  });

  it("kayıt değiştirilemez; kaldırma gerekçeli ve bir kez", async () => {
    const { security } = await roles();
    await addToBlacklist(security.actor, { fullName: "Geçici Yasak", idKind: "tc", idNumber: testNationalId(44), reason: "Uyarıya rağmen fotoğraf çekti" });
    const [entry] = await db().select().from(blacklistEntries);
    const err = await db()
      .update(blacklistEntries)
      .set({ reason: "değişti" })
      .where(eq(blacklistEntries.id, entry!.id))
      .catch((e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);
    await expect(liftBlacklist(security.actor, entry!.id, "kısa")).rejects.toMatchObject({ code: "reason_required" });
    await liftBlacklist(security.actor, entry!.id, "İSG uzmanı görüşmesiyle kaldırıldı");
    await expect(liftBlacklist(security.actor, entry!.id, "İkinci kaldırma denemesi")).rejects.toMatchObject({ code: "already_lifted" });
    const delErr = await db()
      .delete(blacklistEntries)
      .where(eq(blacklistEntries.id, entry!.id))
      .catch((e: unknown) => e);
    expect(isImmutableViolation(delErr)).toBe(true);
  });
});

describe("Taşeron firmalar (FG-8.3)", () => {
  it("İSG ve güvenlik yönetir; vergi no tekrarlanamaz", async () => {
    const { security, ohs, host } = await roles();
    await expect(createCompany(host.actor, { name: "Firma" })).rejects.toBeInstanceOf(ForbiddenError);
    await createCompany(ohs.actor, { name: "Temizlik Ltd.", taxNo: "9876543210", contractEnd: "2027-12-31" });
    await expect(createCompany(security.actor, { name: "Başka", taxNo: "9876543210" })).rejects.toMatchObject({ code: "tax_no_taken" });
    await expect(createCompany(security.actor, { name: "Kötü", taxNo: "12" })).rejects.toMatchObject({ code: "tax_no_invalid" });
    expect((await listCompanies(security.actor)).map((c) => c.name)).toEqual(["Temizlik Ltd."]);
  });
});

const fullCard = { titleTr: "Acil durum", bodyTr: "Alarmda toplanma alanına gidin.", titleEn: "Emergency", bodyEn: "Go to the assembly point.", mediaAssetId: null };
const fullQuestion = { stemTr: "Toplanma alanı nerede?", stemEn: "Where is the assembly point?", optionsTr: ["Otopark", "Çatı"], optionsEn: ["Car park", "Roof"], correctIndex: 0 };

describe("Bilgilendirme paketleri (FG-8.2, karar #127)", () => {
  it("TR ve EN eksiksiz olmadan yayınlanmaz; yayınlanan sürüm değiştirilemez; yeni taslak kopyadır", async () => {
    const { ohs, security } = await roles();
    await expect(createBriefingDraft(security.actor, "office")).rejects.toBeInstanceOf(ForbiddenError);
    const { id } = await createBriefingDraft(ohs.actor, "site");
    await expect(createBriefingDraft(ohs.actor, "site")).rejects.toMatchObject({ code: "draft_exists" });
    await saveBriefingDraft(ohs.actor, id, { cards: [{ ...fullCard, bodyEn: "" }], questions: [fullQuestion] });
    await expect(publishBriefing(ohs.actor, id)).rejects.toMatchObject({ code: "briefing_card_incomplete" });
    await saveBriefingDraft(ohs.actor, id, { cards: [fullCard], questions: [fullQuestion] });
    // Saha tipi varsayılanı 3 soru
    await expect(publishBriefing(ohs.actor, id)).rejects.toMatchObject({ code: "briefing_not_enough_questions" });
    await saveBriefingDraft(ohs.actor, id, { cards: [fullCard], questions: [fullQuestion, fullQuestion, fullQuestion] });
    await publishBriefing(ohs.actor, id);

    const [card] = await db().select().from(visitorBriefingCards).where(eq(visitorBriefingCards.briefingId, id));
    const err = await db()
      .update(visitorBriefingCards)
      .set({ titleTr: "değişti" })
      .where(eq(visitorBriefingCards.id, card!.id))
      .catch((e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);
    await expect(saveBriefingDraft(ohs.actor, id, { cards: [fullCard], questions: [] })).rejects.toMatchObject({ code: "already_published" });

    const list = await listBriefings(ohs.actor);
    expect(list.find((b) => b.type === "site")).toMatchObject({ current: { id, version: 1 }, draft: null });
    const next = await createBriefingDraft(ohs.actor, "site");
    const copy = await getBriefing(ohs.actor, next.id);
    expect(copy.briefing.version).toBe(2);
    expect(copy.cards).toHaveLength(1);
    expect(copy.questions).toHaveLength(3);
    const [b] = await db().select().from(visitorBriefings).where(and(eq(visitorBriefings.visitorType, "site"), eq(visitorBriefings.version, 1)));
    expect(b?.publishedBy).toBe(ohs.userId);
  });

  it("şık sayıları dillere göre farklıysa taslak kaydedilmez", async () => {
    const { ohs } = await roles();
    const { id } = await createBriefingDraft(ohs.actor, "office");
    await expect(saveBriefingDraft(ohs.actor, id, { cards: [], questions: [{ ...fullQuestion, optionsEn: ["Car park", "Roof", "Gate"] }] })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("Ziyaretçi metinleri (karar #128)", () => {
  it("ziyaretçi KVKK metnini İK, kuralları İSG yönetir; iki dil birlikte yayınlanır", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const ohs = await createTestUser({ roles: ["ohs_specialist"] });
    const text = { title: "Ziyaretçi aydınlatma metni", body: "Kişisel verileriniz ziyaret kaydı için işlenir. ".repeat(3) };
    await expect(createDraft(ohs.actor, text, "kvkk_visitor", "tr")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createDraft(hr.actor, text, "visitor_rules", "tr")).rejects.toBeInstanceOf(ForbiddenError);
    const tr = await createDraft(hr.actor, text, "kvkk_visitor", "tr");
    await expect(publishText(hr.actor, tr.id)).rejects.toMatchObject({ code: "legal_locale_missing" });
    const en = await createDraft(hr.actor, { title: "Visitor privacy notice", body: "Your personal data is processed for the visit record. ".repeat(2) }, "kvkk_visitor", "en");
    await publishText(hr.actor, en.id);
    const rows = await owner()<{ locale: string; version: number; published: boolean }[]>`
      select locale, version, published_at is not null as published from legal_texts where kind = 'kvkk_visitor' order by locale`;
    expect(rows).toEqual([
      { locale: "en", version: 1, published: true },
      { locale: "tr", version: 1, published: true },
    ]);
    const rules = await createDraft(ohs.actor, { title: "Tesis kuralları", body: "Refakatsiz dolaşmayın, fotoğraf çekmeyin." }, "visitor_rules", "tr");
    expect(rules.id).toBeTruthy();
  });
});

describe("Ziyaretçi saklama süresi (karar #134)", () => {
  it("FG-8.5 son ziyaretten itibaren süre dolan ziyaretçi anonimleştirilir; taşeronda taşeron süresi", async () => {
    const { security, host } = await roles();
    const { id: companyId } = await createCompany(security.actor, { name: "Eski Taşeron" });
    const office = await createVisit(security.actor, visit({ hostSicilNo: host.sicilNo, fullName: "Eski Ofis Ziyaretçisi", phone: "0555 111 2233", id: { idKind: "tc", idNumber: testNationalId(55) } }));
    const contractor = await createVisit(security.actor, visit({ visitorType: "contractor", contractorCompanyId: companyId, fullName: "Eski Taşeron Çalışanı" }));
    const recent = await createVisit(security.actor, visit({ fullName: "Yeni Ziyaretçi" }));
    await owner()`update visits set planned_date = ${subtractYears(today(), 3)} where id in (${office.id}, ${contractor.id})`;
    // Taşeron süresi daha uzunsa taşeron beklenir
    await setSetting(systemActor("test"), "retention.contractor_years", 5);

    expect(await anonymizeDueVisitors(systemActor("test:retention"))).toBe(1);
    const all = await db().select({ id: visits.id, name: visitors.fullName, phone: visitors.phone, hmac: visitors.nationalIdHmac }).from(visits).innerJoin(visitors, eq(visitors.id, visits.visitorId));
    const byId = new Map(all.map((r) => [r.id, r]));
    expect(byId.get(office.id)).toMatchObject({ phone: null, hmac: null });
    expect(byId.get(office.id)!.name).toMatch(/^Anonim #/);
    expect(byId.get(contractor.id)!.name).toBe("Eski Taşeron Çalışanı");
    expect(byId.get(recent.id)!.name).toBe("Yeni Ziyaretçi");
    const leaks = await db()
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(sql`${auditLog.tableName} = 'visitors' and (${auditLog.oldData}::text || coalesce(${auditLog.newData}::text, '')) like '%Eski Ofis Ziyaretçisi%'`);
    expect(leaks).toHaveLength(0);
  });

  it("kaldırılmış kara liste kaydı süre dolunca anonimleştirilir; geçerli kayıt kalır", async () => {
    const { security } = await roles();
    await addToBlacklist(security.actor, { fullName: "Eski Yasaklı", idKind: "tc", idNumber: testNationalId(66), reason: "Eski bir ihlal nedeniyle eklendi" });
    await addToBlacklist(security.actor, { fullName: "Güncel Yasaklı", idKind: "tc", idNumber: testNationalId(77), reason: "Güncel ihlal nedeniyle eklendi" });
    const [old] = await db().select().from(blacklistEntries).where(eq(blacklistEntries.fullNameSnapshot, "Eski Yasaklı"));
    await liftBlacklist(security.actor, old!.id, "Süre doldu, kaldırıldı");
    // Kaldırma tarihini geçmişe çekmek için değiştirilemezlik trigger'ı tablo sahibi olarak geçici kapatılır
    await owner()`alter table blacklist_entries disable trigger immutable`;
    await owner()`update blacklist_entries set lifted_at = now() - interval '3 years' where id = ${old!.id}`;
    await owner()`alter table blacklist_entries enable trigger immutable`;
    expect(await anonymizeLiftedBlacklist(systemActor("test:retention"))).toBe(1);
    const rows = await db().select().from(blacklistEntries);
    const o = rows.find((r) => r.id === old!.id)!;
    expect(o).toMatchObject({ nationalIdHmac: null, nationalIdMasked: null });
    expect(o.fullNameSnapshot).toMatch(/^Anonim #/);
    expect(rows.find((r) => r.id !== old!.id)!.fullNameSnapshot).toBe("Güncel Yasaklı");
  });
});
