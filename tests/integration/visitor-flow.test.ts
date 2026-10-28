import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { emailOutbox, notifications, visitorConsents, visitorSignatures, visitQuizAttempts, visits, visitSessions } from "@/server/db/schema";
import { isImmutableViolation } from "@/server/errors";
import { todayIn } from "@/lib/dates";
import { registerDevice } from "@/server/services/devices";
import { anonymizeDueVisitors } from "@/server/services/retention";
import { setSetting } from "@/server/services/settings";
import {
  completeBriefing,
  createVisit,
  drawQuiz,
  enterVisitCode,
  listVisits,
  selfRegister,
  startBriefing,
  submitQuiz,
  visitForToken,
  visitorAssetAllowed,
  visitorView,
} from "@/server/services/visitors";
import { subtractYears } from "@/server/state/retention";
import { headObject } from "@/server/storage/client";
import { owner } from "../support/db";
import { createTestUser } from "../support/factories";
import { testSignaturePng } from "../support/signature";
import { visitorBriefingSetup } from "../support/visitors";

const sys = systemActor("test:visitor-flow");
const today = () => todayIn("Europe/Istanbul");
const meta = { ip: "10.1.2.3", userAgent: "vitest-kiosk" };

/** Ön kayıt + e-postadaki bağlantının belirteci. */
async function visitWithLink(extra: object = {}) {
  const host = await createTestUser();
  const { id } = await createVisit(host.actor, { visitorType: "site", plannedDate: today(), fullName: "Ayşe Ziyaretçi", email: "ayse@firma.com", ...extra });
  const [mail] = await db().select().from(emailOutbox).where(eq(emailOutbox.kind, "visitor_link"));
  const token = /\/v\/([A-Za-z0-9_-]{43})/.exec(mail!.bodyText)![1]!;
  return { host, visitId: id, token, mail: mail! };
}

/** Teslim edilmemiş denemenin doğru cevapları (gösterilen sıradaki şık numarası). */
async function rightAnswers(attemptId: string) {
  const [a] = await db().select().from(visitQuizAttempts).where(eq(visitQuizAttempts.id, attemptId));
  return a!.items.map((it) => it.optionOrder.indexOf(0));
}

describe("Ziyaretçi bilgilendirmesi (SPEC 8.2, iş paketi 2.3a)", () => {
  it("FG-8 ön kayıtta e-posta varsa iki dilli bağlantı ve ziyaret kodu gönderilir", async () => {
    await visitorBriefingSetup();
    const { visitId, token, mail } = await visitWithLink();
    const [v] = await db().select().from(visits).where(eq(visits.id, visitId));
    expect(v!.code).toMatch(/^\d{6}$/);
    expect(mail.toAddress).toBe("ayse@firma.com");
    expect(mail.bodyText).toContain(v!.code);
    expect(mail.bodyText).toContain(`/en/v/${token}`);
    expect((await visitForToken(token))?.visit.id).toBe(visitId);
    // Belirteç yalnızca özetiyle saklanır
    const [s] = await db().select().from(visitSessions).where(eq(visitSessions.visitId, visitId));
    expect(s!.tokenHash).not.toContain(token);
  });

  it("FG-8 kartlar → sorular (doğru cevap dönmez, sınırsız tekrar) → onay + imza → bilgilendirildi", async () => {
    const { legal } = await visitorBriefingSetup();
    const { host, visitId, token } = await visitWithLink();
    const view = await visitorView(token, "tr");
    expect(view.state).toBe("ready");
    if (view.state !== "ready") return;
    expect(view.cards).toHaveLength(2);
    expect(JSON.stringify(view)).not.toContain("correct");

    await startBriefing(token, "tr");
    const first = await drawQuiz(token, "tr");
    expect(first.questions).toHaveLength(3);
    expect(JSON.stringify(first)).not.toMatch(/correct/i);
    // Yeniden çağrı aynı denemeyi döner
    expect((await drawQuiz(token, "tr")).attemptId).toBe(first.attemptId);
    const wrong = (await rightAnswers(first.attemptId!)).map((i) => (i + 1) % 3);
    expect(await submitQuiz(token, first.attemptId!, wrong)).toEqual({ passed: false, score: 0 });
    await expect(completeBriefing(token, { locale: "tr", rulesId: legal["visitor_rules:tr"]!, kvkkId: legal["kvkk_visitor:tr"]!, signature: testSignaturePng(3) }, meta)).rejects.toMatchObject({
      code: "quiz_not_passed",
    });

    const second = await drawQuiz(token, "tr");
    expect(second.attemptId).not.toBe(first.attemptId);
    expect(await submitQuiz(token, second.attemptId!, await rightAnswers(second.attemptId!))).toEqual({ passed: true, score: 100 });

    await expect(completeBriefing(token, { locale: "tr", rulesId: legal["visitor_rules:en"]!, kvkkId: legal["kvkk_visitor:tr"]!, signature: testSignaturePng(3) }, meta)).rejects.toMatchObject({
      code: "legal_text_outdated",
    });
    await completeBriefing(token, { locale: "tr", rulesId: legal["visitor_rules:tr"]!, kvkkId: legal["kvkk_visitor:tr"]!, signature: testSignaturePng(3) }, meta);

    const [v] = await db().select().from(visits).where(eq(visits.id, visitId));
    expect(v).toMatchObject({ status: "briefed", quizScore: 100, briefingLocale: "tr" });
    expect(v!.briefingCompletedAt).toBeInstanceOf(Date);
    expect(await db().select().from(visitorConsents).where(eq(visitorConsents.visitId, visitId))).toHaveLength(2);
    const [sig] = await db().select().from(visitorSignatures).where(eq(visitorSignatures.visitId, visitId));
    expect(sig).toMatchObject({ ip: "10.1.2.3" });
    expect(sig!.imageKey).toMatch(/^visitor-signatures\//);
    const notes = await db().select().from(notifications).where(eq(notifications.userId, host.userId));
    expect(notes.map((n) => n.kind)).toContain("visitor_briefed");
    expect((await visitorView(token, "tr")).state).toBe("done");

    // Kayıtlar değiştirilemez
    const err = await db()
      .update(visitQuizAttempts)
      .set({ score: 100 })
      .where(eq(visitQuizAttempts.id, first.attemptId!))
      .catch((e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);
    const err2 = await db()
      .delete(visitorSignatures)
      .where(eq(visitorSignatures.visitId, visitId))
      .catch((e: unknown) => e);
    expect(isImmutableViolation(err2)).toBe(true);
    await expect(startBriefing(token, "tr")).rejects.toMatchObject({ code: "visit_locked" });
  });

  it("kartlar için gereken en az süre geçmeden sorular açılmaz (sunucu doğrular)", async () => {
    await visitorBriefingSetup({ cardMinSeconds: 60 });
    const { token } = await visitWithLink();
    await expect(drawQuiz(token, "tr")).rejects.toMatchObject({ code: "briefing_not_started" });
    await startBriefing(token, "en");
    await expect(drawQuiz(token, "en")).rejects.toMatchObject({ code: "briefing_too_fast" });
  });

  it("iptal edilen ziyaretin ve süresi dolan belirtecin bağlantısı geçersizdir", async () => {
    await visitorBriefingSetup();
    const a = await visitWithLink();
    await owner()`update visit_sessions set expires_at = now() - interval '1 minute' where visit_id = ${a.visitId}`;
    expect(await visitForToken(a.token)).toBeNull();
    expect((await visitorView(a.token, "tr")).state).toBe("invalid");
    expect(await visitForToken("x".repeat(43))).toBeNull();
  });

  it("paket ya da metin yoksa ziyaretçiye 'hazır değil' gösterilir", async () => {
    const host = await createTestUser();
    await createVisit(host.actor, { visitorType: "office", plannedDate: today(), fullName: "Ofis Misafiri", email: "m@firma.com" });
    const [mail] = await db().select().from(emailOutbox).where(eq(emailOutbox.kind, "visitor_link"));
    const token = /\/v\/([A-Za-z0-9_-]{43})/.exec(mail!.bodyText)![1]!;
    expect((await visitorView(token, "tr")).state).toBe("not_ready");
  });
});

describe("Kiosk ve kendi kaydı (kararlar #138–140)", () => {
  it("kiosk kodu bugünkü planlı ziyareti açar; hatalı kod sınırı cihaz başınadır", async () => {
    await visitorBriefingSetup();
    const admin = await createTestUser({ roles: ["sysadmin"] });
    const device = await registerDevice(admin.actor, { name: "Kapı tableti", kind: "kiosk" });
    const host = await createTestUser();
    const { id } = await createVisit(host.actor, { visitorType: "office", plannedDate: today(), fullName: "Kodlu Misafir" });
    const [v] = await db().select().from(visits).where(eq(visits.id, id));
    const r = await enterVisitCode(device.id, v!.code);
    expect(r && r !== "rate_limited" && (await visitForToken(r.token))?.channel).toBe("kiosk");
    expect(await enterVisitCode(device.id, "abc")).toBeNull();

    await setSetting(sys, "visitor.code_max_attempts", 2);
    const other = await registerDevice(admin.actor, { name: "İkinci tablet", kind: "kiosk" });
    expect(await enterVisitCode(other.id, "000000")).toBeNull();
    expect(await enterVisitCode(other.id, "000001")).toBeNull();
    expect(await enterVisitCode(other.id, v!.code)).toBe("rate_limited");
  });

  it("ön kaydı olmayan ziyaretçi kendini kaydeder; ev sahibi boş, güvenlik listesinde görünür", async () => {
    await visitorBriefingSetup();
    const security = await createTestUser({ roles: ["security"] });
    await expect(selfRegister({ visitorType: "office", fullName: "Kapı Misafiri", hostName: "Ali Bey" }, "ip:test-a", "self")).rejects.toMatchObject({ code: "contact_required" });
    await expect(selfRegister({ visitorType: "office", fullName: "Kapı Misafiri", hostName: "", phone: "05551112233" }, "ip:test-a", "self")).rejects.toMatchObject({
      code: "host_name_required",
    });
    const r = await selfRegister({ visitorType: "office", fullName: "Kapı Misafiri", hostName: "Ali Bey (Satın alma)", phone: "05551112233" }, "ip:test-a", "self");
    expect(r).not.toBe("rate_limited");
    const found = await visitForToken((r as { token: string }).token);
    expect(found?.visit).toMatchObject({ hostUserId: null, hostNameText: "Ali Bey (Satın alma)", selfRegistered: true, plannedDate: today() });
    const rows = await listVisits(security.actor, { scope: "all" });
    expect(rows.find((x) => x.id === found!.visit.id)).toMatchObject({ hostName: "Ali Bey (Satın alma)", selfRegistered: true });

    await setSetting(sys, "visitor.selfreg_max", 1);
    expect(await selfRegister({ visitorType: "office", fullName: "İkinci", hostName: "Ali Bey", phone: "05551112233" }, "ip:test-b", "self")).not.toBe("rate_limited");
    expect(await selfRegister({ visitorType: "office", fullName: "Üçüncü", hostName: "Ali Bey", phone: "05551112233" }, "ip:test-b", "self")).toBe("rate_limited");
  });

  it("ziyaretçi yalnızca kendi paketinin kart görsellerine erişebilir", async () => {
    await visitorBriefingSetup();
    const { token } = await visitWithLink();
    expect(await visitorAssetAllowed(token, "00000000-0000-7000-8000-000000000000")).toBe(false);
  });
});

describe("Ziyaretçi bilgilendirme kayıtlarının saklaması (karar #134)", () => {
  it("anonimleştirmede onay/imza IP'si ve imza görseli silinir, kayıtlar kalır", async () => {
    const { legal } = await visitorBriefingSetup();
    const { visitId, token } = await visitWithLink({ visitorType: "office" });
    await startBriefing(token, "tr");
    await completeBriefing(token, { locale: "tr", rulesId: legal["visitor_rules:tr"]!, kvkkId: legal["kvkk_visitor:tr"]!, signature: testSignaturePng(9) }, meta);
    const [sig] = await db().select().from(visitorSignatures).where(eq(visitorSignatures.visitId, visitId));
    expect(await headObject(sig!.imageKey!)).not.toBeNull();
    // Ziyaret çıkışı yapılmış ve süresi dolmuş gibi
    await owner()`update visits set status = 'checked_out', planned_date = ${subtractYears(today(), 3)} where id = ${visitId}`;
    expect(await anonymizeDueVisitors(sys)).toBe(1);
    const [after] = await db().select().from(visitorSignatures).where(eq(visitorSignatures.visitId, visitId));
    expect(after).toMatchObject({ ip: null, userAgent: null, imageKey: null, subjectHash: sig!.subjectHash });
    expect(await headObject(sig!.imageKey!)).toBeNull();
    const consents = await db().select().from(visitorConsents).where(and(eq(visitorConsents.visitId, visitId)));
    expect(consents.every((c) => c.ip === null)).toBe(true);
    expect(await db().select().from(visitSessions).where(eq(visitSessions.visitId, visitId))).toHaveLength(0);
  });
});
