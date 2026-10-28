import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { contractorClearances, notifications, visitDenials, visitors, visitorSignatures, visitQuizAttempts, visits } from "@/server/db/schema";
import { ForbiddenError, isImmutableViolation } from "@/server/errors";
import { todayIn } from "@/lib/dates";
import {
  addToBlacklist,
  checkIn,
  checkOut,
  completeBriefing,
  createCompany,
  createVisit,
  drawQuiz,
  gateList,
  selfRegister,
  startBriefing,
  submitQuiz,
  visitorView,
} from "@/server/services/visitors";
import { issueVisitSession } from "@/server/services/visitors/session";
import { withActor } from "@/server/db/with-actor";
import { systemActor } from "@/server/authz/actor";
import { owner } from "../support/db";
import { createTestUser } from "../support/factories";
import { testNationalId } from "../support/national-id";
import { testSignaturePng } from "../support/signature";
import { visitorBriefingSetup } from "../support/visitors";

const today = () => todayIn("Europe/Istanbul");
const meta = { ip: "10.9.8.7", userAgent: "vitest-gate" };

async function tokenFor(visitId: string) {
  const [v] = await db().select({ plannedDate: visits.plannedDate }).from(visits).where(eq(visits.id, visitId));
  return withActor(systemActor("test"), (tx) => issueVisitSession(tx, visitId, "kiosk", v!.plannedDate));
}

/** Bilgilendirmeyi tamamlar (taşeronda soruları doğru cevaplar). */
async function brief(visitId: string, legal: Record<string, string>) {
  const token = await tokenFor(visitId);
  await startBriefing(token, "tr");
  const quiz = await drawQuiz(token, "tr");
  if (quiz.attemptId) {
    const [a] = await db().select().from(visitQuizAttempts).where(eq(visitQuizAttempts.id, quiz.attemptId));
    await submitQuiz(token, quiz.attemptId, a!.items.map((it) => it.optionOrder.indexOf(0)));
  }
  await completeBriefing(token, { locale: "tr", rulesId: legal["visitor_rules:tr"]!, kvkkId: legal["kvkk_visitor:tr"]!, signature: testSignaturePng(5) }, meta);
  return token;
}

async function setup() {
  const { legal, ohs } = await visitorBriefingSetup();
  const security = await createTestUser({ roles: ["security"] });
  const host = await createTestUser();
  return { legal, ohs, security, host };
}

describe("Kapı: giriş ve çıkış (SPEC 8.2/6–8, iş paketi 2.3b)", () => {
  it("FG-8 bilgilendirme olmadan giriş yok; girişte kart no zorunlu; ev sahibine bildirim; sonra kayıt kilitli", async () => {
    const { legal, security, host, ohs } = await setup();
    const { id } = await createVisit(security.actor, { visitorType: "office", plannedDate: today(), fullName: "Kapı Misafiri", hostSicilNo: host.sicilNo, id: { idKind: "tc", idNumber: testNationalId(101) } });
    await expect(checkIn(security.actor, id, { badgeNo: "Z-12", ppe: [] })).rejects.toMatchObject({ code: "visit_not_briefed" });
    await brief(id, legal);

    await expect(checkIn(ohs.actor, id, { badgeNo: "Z-12", ppe: [] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(checkIn(security.actor, id, { badgeNo: " ", ppe: [] })).rejects.toMatchObject({ code: "badge_required" });
    await expect(checkIn(security.actor, id, { badgeNo: "Z-12", ppe: ["Uzay kıyafeti"] })).rejects.toMatchObject({ code: "invalid_input" });
    expect(await checkIn(security.actor, id, { badgeNo: "Z-12", ppe: ["Baret", "Reflektörlü yelek"] })).toEqual({ checkedIn: true });

    const [v] = await db().select().from(visits).where(eq(visits.id, id));
    expect(v).toMatchObject({ status: "checked_in", badgeNo: "Z-12", ppeIssued: ["Baret", "Reflektörlü yelek"], checkedInBy: security.userId });
    const notes = await db().select().from(notifications).where(eq(notifications.userId, host.userId));
    expect(notes.map((n) => n.kind)).toContain("visitor_arrived");

    // Girişten sonra yalnızca çıkış alanları değişir
    const err = await db().update(visits).set({ badgeNo: "Başka" }).where(eq(visits.id, id)).catch((e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);
    await expect(checkOut(ohs.actor, id, true)).rejects.toBeInstanceOf(ForbiddenError);
    await checkOut(security.actor, id, false);
    const [out] = await db().select().from(visits).where(eq(visits.id, id));
    expect(out).toMatchObject({ status: "checked_out", badgeReturned: false, checkedOutBy: security.userId });
    const err2 = await db().update(visits).set({ badgeReturned: true }).where(eq(visits.id, id)).catch((e: unknown) => e);
    expect(isImmutableViolation(err2)).toBe(true);
    const err3 = await db().delete(visits).where(eq(visits.id, id)).catch((e: unknown) => e);
    expect(isImmutableViolation(err3)).toBe(true);
    await expect(checkOut(security.actor, id, true)).rejects.toMatchObject({ code: "visit_not_inside" });
  });

  it("kendi kaydında ev sahibi ve kimlik girişte zorunlu; kimlik kayıtlı kişiyle eşleşirse ziyaret o kişiye bağlanır", async () => {
    const { legal, security, host } = await setup();
    const tc = testNationalId(202);
    // Daha önce gelmiş kişi (kimliği kayıtlı)
    const earlier = await createVisit(security.actor, { visitorType: "office", plannedDate: today(), fullName: "Eski Ad", hostSicilNo: host.sicilNo, id: { idKind: "tc", idNumber: tc } });
    const [known] = await db().select({ visitorId: visits.visitorId }).from(visits).where(eq(visits.id, earlier.id));

    const r = await selfRegister({ visitorType: "office", fullName: "Yeni Ad Soyad", hostName: "Ahmet Bey", phone: "05550001122" }, "ip:gate-test", "self");
    const token = (r as { token: string }).token;
    const [walkIn] = await db().select().from(visits).where(eq(visits.selfRegistered, true));
    await startBriefing(token, "tr");
    await completeBriefing(token, { locale: "tr", rulesId: legal["visitor_rules:tr"]!, kvkkId: legal["kvkk_visitor:tr"]!, signature: testSignaturePng(6) }, meta);

    await expect(checkIn(security.actor, walkIn!.id, { badgeNo: "K-1", ppe: [] })).rejects.toMatchObject({ code: "host_required" });
    await expect(checkIn(security.actor, walkIn!.id, { badgeNo: "K-1", ppe: [], hostSicilNo: host.sicilNo })).rejects.toMatchObject({ code: "visitor_id_required" });
    await checkIn(security.actor, walkIn!.id, { badgeNo: "K-1", ppe: [], hostSicilNo: host.sicilNo, id: { idKind: "tc", idNumber: tc } });

    const [after] = await db().select().from(visits).where(eq(visits.id, walkIn!.id));
    expect(after).toMatchObject({ visitorId: known!.visitorId, hostUserId: host.userId, status: "checked_in" });
    const [person] = await db().select().from(visitors).where(eq(visitors.id, known!.visitorId));
    expect(person).toMatchObject({ fullName: "Yeni Ad Soyad", phone: "05550001122" });
    expect(await db().select().from(visitors).where(eq(visitors.id, walkIn!.visitorId))).toHaveLength(0);
    const [sig] = await db().select().from(visitorSignatures).where(eq(visitorSignatures.visitId, walkIn!.id));
    expect(sig!.visitorId).toBe(known!.visitorId);
  });

  it("FG-8.4 kara listedeki kişinin girişi reddedilir, kaydedilir ve İSG uzmanına bildirilir", async () => {
    const { legal, security, host, ohs } = await setup();
    const tc = testNationalId(303);
    await addToBlacklist(ohs.actor, { fullName: "Yasaklı Ziyaretçi", idKind: "tc", idNumber: tc, reason: "Önceki ziyarette kural ihlali" });
    const { id } = await createVisit(security.actor, { visitorType: "office", plannedDate: today(), fullName: "Yasaklı Ziyaretçi", hostSicilNo: host.sicilNo, id: { idKind: "tc", idNumber: tc } });
    await brief(id, legal);
    expect(await checkIn(security.actor, id, { badgeNo: "X-9", ppe: [] })).toEqual({ denied: true });
    const [v] = await db().select().from(visits).where(eq(visits.id, id));
    expect(v!.status).toBe("briefed");
    expect(await db().select().from(visitDenials).where(eq(visitDenials.visitId, id))).toHaveLength(1);
    const notes = await db().select().from(notifications).where(eq(notifications.userId, ohs.userId));
    expect(notes.map((n) => n.kind)).toContain("blacklist_denied");
    expect((await gateList(security.actor)).find((r) => r.id === id)?.blacklisted).toBe(true);
  });

  it("FG-8 taşeron bilgilendirmeyi geçince geçerlilik alır; geçerliyken kartlar ve sorular atlanır", async () => {
    const { legal, security, host } = await setup();
    const { id: companyId } = await createCompany(security.actor, { name: "Bakım Ltd." });
    const tc = testNationalId(404);
    const first = await createVisit(security.actor, { visitorType: "contractor", contractorCompanyId: companyId, plannedDate: today(), fullName: "Taşeron Usta", hostSicilNo: host.sicilNo, id: { idKind: "tc", idNumber: tc } });
    await brief(first.id, legal);
    const [c] = await db().select().from(contractorClearances).where(eq(contractorClearances.visitId, first.id));
    const year = Number(today().slice(0, 4)) + 1;
    expect(c!.validUntil.startsWith(String(year))).toBe(true);

    const second = await createVisit(security.actor, { visitorType: "contractor", contractorCompanyId: companyId, plannedDate: today(), fullName: "Taşeron Usta", hostSicilNo: host.sicilNo, id: { idKind: "tc", idNumber: tc } });
    const token = await tokenFor(second.id);
    const view = await visitorView(token, "tr");
    expect(view).toMatchObject({ state: "ready", clearanceUntil: c!.validUntil, cards: [], questionCount: 0, quizPassed: true });
    await startBriefing(token, "tr");
    await completeBriefing(token, { locale: "tr", rulesId: legal["visitor_rules:tr"]!, kvkkId: legal["kvkk_visitor:tr"]!, signature: testSignaturePng(7) }, meta);
    // Kısa yol süreyi uzatmaz
    expect(await db().select().from(contractorClearances)).toHaveLength(1);
    expect((await gateList(security.actor)).find((r) => r.id === second.id)?.clearanceUntil).toBe(c!.validUntil);
  });

  it("kapı listesi: bugünkü ziyaretler ve tarihten bağımsız içeridekiler; kodla arama; ev sahibi göremez", async () => {
    const { legal, security, host } = await setup();
    const a = await createVisit(security.actor, { visitorType: "office", plannedDate: today(), fullName: "İçerideki Misafir", hostSicilNo: host.sicilNo, id: { idKind: "tc", idNumber: testNationalId(505) } });
    await brief(a.id, legal);
    await checkIn(security.actor, a.id, { badgeNo: "A-1", ppe: [] });
    // Dün girip çıkışı yapılmamış gibi
    await owner()`alter table visits disable trigger gate_guard`;
    await owner()`update visits set planned_date = planned_date - 1 where id = ${a.id}`;
    await owner()`alter table visits enable trigger gate_guard`;
    const b = await createVisit(security.actor, { visitorType: "office", plannedDate: today(), fullName: "Bekleyen Misafir", hostSicilNo: host.sicilNo });

    const list = await gateList(security.actor);
    expect(list.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
    const [bRow] = await db().select({ code: visits.code }).from(visits).where(eq(visits.id, b.id));
    expect((await gateList(security.actor, bRow!.code)).map((r) => r.id)).toEqual([b.id]);
    expect((await gateList(security.actor, "içerideki")).map((r) => r.id)).toEqual([a.id]);
    await expect(gateList(host.actor)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
