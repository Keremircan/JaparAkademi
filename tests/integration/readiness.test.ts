import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { certificates, readinessDecisions } from "@/server/db/schema";
import { isImmutableViolation } from "@/server/errors";
import { myLearning } from "@/server/services/assignments";
import { acknowledgeItem, learnModule, reportReachedEnd } from "@/server/services/assignments/learner";
import { certificateFile, certificatesForUser, issueAttendanceFor, myCertificates, revokeCertificate, verifyCertificate } from "@/server/services/certificates";
import { renderCertificate } from "@/server/services/certificates/render";
import { answerExam, getAttempt, startExam, submitExam } from "@/server/services/exams";
import { getAssetForViewer } from "@/server/services/media";
import { createModule, setModuleContents } from "@/server/services/modules";
import { createQuestion } from "@/server/services/questions";
import { approveReadiness, decideProcess, decisionQueue, readinessQueue, readinessReview, rejectReadiness } from "@/server/services/readiness";
import { setSectionManagerScopes } from "@/server/services/roles";
import { systemActor } from "@/server/authz/actor";
import { seedContentPeople } from "../support/content";
import { createTestUser } from "../support/factories";
import { moduleInput, publishCard, publishedText } from "../support/training";
import { choice, opts } from "../support/exam";

type People = Awaited<ReturnType<typeof seedContentPeople>>;
type Trainee = Awaited<ReturnType<typeof createTestUser>>;

/** Pres: teorik modül (12 ay geçerli) + teorik sınav (4 soru, gözetmensiz, 1 hak). */
async function setup(p: People) {
  const sm = p.smUretim.actor;
  const c = await publishedText(sm, p.org.units.pres, "Pres temelleri", "metin");
  const theory = (await createModule(sm, moduleInput(p.org.units.pres, "theory", "Pres teorisi", { validityMonths: 12 }))).id;
  await setModuleContents(sm, theory, [c]);
  const exam = (await createModule(sm, moduleInput(p.org.units.pres, "theory_exam", "Pres sınavı"))).id;
  for (let i = 0; i < 4; i++) {
    await createQuestion(sm, {
      type: "single_choice", stem: `Sınav sorusu ${i}`, options: ["Doğru şık", "Yanlış bir", "Yanlış iki"], correctIndex: 0, explanation: null,
      topic: "Pres", difficulty: 1, isOhsCritical: false, mediaAssetId: null, moduleIds: [theory], ownerOrgUnitId: p.org.units.pres, isOhs: false,
    });
  }
  const { cardModuleId } = await publishCard(p, p.org.positions.presOp, [theory, exam], sm, {
    [exam]: { questionCount: 4, passScore: 75, maxAttempts: 1, cooldownHours: 0, durationMin: 10, proctorRequired: false },
  });
  return { theory, exam, cardModuleId };
}

async function finish(u: Trainee, moduleId: string) {
  const am = (await myLearning(u.actor)).current!.modules.find((m) => m.moduleId === moduleId)!;
  const view = await learnModule(u.actor, am.id);
  for (const item of view.items) {
    await reportReachedEnd(u.actor, item.id);
    await acknowledgeItem(u.actor, item.id);
  }
}

async function takeExam(u: Trainee, examModuleId: string, pass: boolean) {
  const am = (await myLearning(u.actor)).current!.modules.find((m) => m.moduleId === examModuleId)!;
  const { attemptId } = await startExam(u.actor, am.id, { code: null, ip: null, userAgent: null });
  const view = await getAttempt(u.actor, attemptId);
  if (view.state !== "open") throw new Error("açık değil");
  for (const item of view.questions) {
    const right = opts(item).indexOf("Doğru şık");
    await answerExam(u.actor, attemptId, item.itemId, choice(pass ? right : (right + 1) % opts(item).length));
  }
  await submitExam(u.actor, attemptId);
}

async function trainee(p: People, s: Awaited<ReturnType<typeof setup>>) {
  const u = await createTestUser({ positionId: p.org.positions.presOp, trainingRequired: true });
  await finish(u, s.cardModuleId);
  await finish(u, s.theory);
  return u;
}

const current = async (u: Trainee) => (await myLearning(u.actor)).current!;
const amOf = async (u: Trainee, moduleId: string) => (await current(u)).modules.find((m) => m.moduleId === moduleId)!;

describe("FG-7.1 işe başlama onayı", () => {
  it("kapsamdaki bölüm sorumlusu onaylar; atama tamamlanır, sertifika düzenlenir ve PDF'i üretilir; karar değiştirilemez", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const u = await trainee(p, s);
    await takeExam(u, s.exam, true);
    const a = await current(u);
    expect(a.status).toBe("awaiting_readiness");

    expect((await readinessQueue(p.smUretim.actor)).map((x) => x.assignmentId)).toEqual([a.id]);
    expect(await readinessQueue(p.smKalite.actor)).toEqual([]);
    expect(await readinessQueue(p.hr.actor)).toEqual([]);
    await expect(readinessReview(p.trainerPres.actor, a.id)).rejects.toMatchObject({ code: "not_found" });
    const review = await readinessReview(p.smUretim.actor, a.id);
    expect(review.can).toEqual({ readiness: true, process: false });
    expect(review.modules.find((m) => m.kind === "theory_exam")).toMatchObject({ status: "completed", attemptsLeft: 0 });

    await expect(approveReadiness(p.smKalite.actor, a.id, null)).rejects.toMatchObject({ code: "forbidden" });
    await expect(approveReadiness(p.hr.actor, a.id, null)).rejects.toMatchObject({ code: "forbidden" });
    const { certificateId } = await approveReadiness(p.smUretim.actor, a.id, "Hazır");
    expect((await myLearning(u.actor)).current).toBeNull();
    await expect(approveReadiness(p.smUretim.actor, a.id, null)).rejects.toMatchObject({ code: "readiness_not_pending" });

    const [cert] = await db().select().from(certificates).where(eq(certificates.id, certificateId));
    expect(cert).toMatchObject({ kind: "position_competency", userId: u.userId, approvedBy: p.smUretim.userId, status: "valid" });
    expect(cert!.snapshot).toMatchObject({ theoryScore: 100, approverName: expect.any(String) });
    expect(cert!.snapshot.modules.map((m) => m.title)).toContain("Pres teorisi");
    // 12 ay geçerli modül → sertifika o tarihe kadar (karar #78)
    expect(cert!.expiresAt).not.toBeNull();
    expect(cert!.verifyToken).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const err = await db().update(readinessDecisions).set({ comment: "x" }).where(eq(readinessDecisions.assignmentId, a.id)).then(() => null, (e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);

    // PDF (worker işi): bir kez üretilir; kursiyer ve İK indirir, ilgisiz kişi göremez
    await renderCertificate(certificateId);
    const file = await certificateFile(u.actor, certificateId);
    expect(file?.fileName).toMatch(/^JA-\d{4}-\d{6}\.pdf$/);
    expect(await getAssetForViewer(p.hr.actor, file!.assetId)).not.toBeNull();
    expect(await getAssetForViewer((await createTestUser({})).actor, file!.assetId)).toBeNull();
    const overwrite = await db().update(certificates).set({ pdfAssetId: null }).where(eq(certificates.id, certificateId)).then(() => null, (e: unknown) => e);
    expect(isImmutableViolation(overwrite)).toBe(true);
    expect((await myCertificates(u.actor))[0]).toMatchObject({ id: certificateId, state: "valid", ready: true });
  });

  it("FG-7.2 doğrulama maskeli ad ve durumu gösterir; İK gerekçeyle iptal eder, iptal değiştirilemez", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const u = await trainee(p, s);
    await takeExam(u, s.exam, true);
    const { certificateId } = await approveReadiness(p.smUretim.actor, (await current(u)).id, null);
    const [cert] = await db().select().from(certificates).where(eq(certificates.id, certificateId));

    const v = await verifyCertificate(cert!.verifyToken);
    expect(v).toMatchObject({ kind: "position_competency", state: "valid", maskedName: expect.stringMatching(/^\S+( \S\*\*\*)+$/) });
    expect(JSON.stringify(v)).not.toContain(u.sicilNo);
    expect(await verifyCertificate("kısa")).toBeNull();
    expect(await verifyCertificate("A".repeat(22))).toBeNull();

    await expect(revokeCertificate(p.smUretim.actor, certificateId, "Hatalı")).rejects.toMatchObject({ code: "forbidden" });
    await expect(revokeCertificate(p.hr.actor, certificateId, "")).rejects.toMatchObject({ code: "reject_comment_required" });
    await revokeCertificate(p.hr.actor, certificateId, "Yanlış kişiye düzenlendi");
    expect((await verifyCertificate(cert!.verifyToken))?.state).toBe("revoked");
    await expect(revokeCertificate(p.hr.actor, certificateId, "Tekrar")).rejects.toMatchObject({ code: "certificate_revoked" });
    const err = await db().update(certificates).set({ revokedReason: "değişti" }).where(eq(certificates.id, certificateId)).then(() => null, (e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);
    expect((await certificatesForUser(p.hr.actor, u.userId))[0]).toMatchObject({ state: "revoked", revokedReason: "Yanlış kişiye düzenlendi" });
  });

  it("karar #75: ret gerekçeli; seçilen modüller tekrar açılır, hakkı biten sınava +1 hak yazılır; tekrar tamamlanınca yeniden onaya gelir", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const u = await trainee(p, s);
    await takeExam(u, s.exam, true);
    const a = await current(u);
    const theoryAm = await amOf(u, s.theory);
    const examAm = await amOf(u, s.exam);
    await expect(rejectReadiness(p.smUretim.actor, a.id, { comment: "", reopenModuleIds: [theoryAm.id] })).rejects.toMatchObject({ code: "reject_comment_required" });
    await expect(rejectReadiness(p.smUretim.actor, a.id, { comment: "Eksik", reopenModuleIds: [] })).rejects.toMatchObject({ code: "reopen_modules_invalid" });
    await rejectReadiness(p.smUretim.actor, a.id, { comment: "Kalıp güvenliği tekrar edilmeli", reopenModuleIds: [theoryAm.id, examAm.id] });

    const after = await current(u);
    expect(after.status).toBe("active");
    expect(after.modules.find((m) => m.id === theoryAm.id)!.status).toBe("review_required");
    expect(after.modules.find((m) => m.id === examAm.id)!.status).toBe("locked");

    await finish(u, s.theory);
    expect((await amOf(u, s.exam)).status).toBe("available");
    await takeExam(u, s.exam, true);
    expect((await current(u)).status).toBe("awaiting_readiness");
    const review = await readinessReview(p.smUretim.actor, a.id);
    expect(review.history[0]).toMatchObject({ type: "readiness", decision: "rejected", moduleTitles: ["Pres teorisi", "Pres sınavı"] });
  });

  it("kimse kendi atamasını onaylayamaz", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const self = await createTestUser({ roles: ["section_manager"], positionId: p.org.positions.presOp, trainingRequired: true });
    await setSectionManagerScopes(systemActor("test"), self.userId, [p.org.units.uretim]);
    await finish(self, s.cardModuleId);
    await finish(self, s.theory);
    await takeExam(self, s.exam, true);
    const a = await current(self);
    expect(await readinessQueue({ ...self.actor, roles: ["personnel", "section_manager"] })).toEqual([]);
    await expect(approveReadiness({ ...self.actor, roles: ["personnel", "section_manager"] }, a.id, null)).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("SPEC 3.1 tüm haklarda başarısızlık kararı", () => {
  it("İK ve kapsamdaki sorumlu görür; ek hak verilince süreç devam eder", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const u = await trainee(p, s);
    await takeExam(u, s.exam, false);
    const a = await current(u);
    expect(a.status).toBe("awaiting_decision");
    expect((await decisionQueue(p.hr.actor)).map((x) => x.assignmentId)).toEqual([a.id]);
    expect((await decisionQueue(p.smUretim.actor)).map((x) => x.assignmentId)).toEqual([a.id]);
    expect(await decisionQueue(p.smKalite.actor)).toEqual([]);
    expect(await decisionQueue(p.trainerPres.actor)).toEqual([]);

    const examAm = await amOf(u, s.exam);
    await expect(decideProcess(p.trainerPres.actor, a.id, { decision: "end_process", reason: "Uygun değil" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(decideProcess(p.hr.actor, a.id, { decision: "extra_attempt", reason: "", examModuleId: examAm.id, extraAttempts: null })).rejects.toMatchObject({
      code: "reject_comment_required",
    });
    await decideProcess(p.hr.actor, a.id, { decision: "extra_attempt", reason: "Sınav günü rahatsızdı", examModuleId: examAm.id, extraAttempts: null });
    expect((await current(u)).status).toBe("active");
    // Kalınca açılan teorik modül yeniden tamamlanınca sınav açılır (1 ek hak)
    await finish(u, s.theory);
    await takeExam(u, s.exam, true);
    expect((await current(u)).status).toBe("awaiting_readiness");
    expect((await readinessReview(p.smUretim.actor, a.id)).history[0]).toMatchObject({ type: "process", decision: "extra_attempt" });
  });

  it("ek eğitim modülleri tekrar açar ve sınava hak verir; süreci sonlandırma atamayı kapatır", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const u = await trainee(p, s);
    await takeExam(u, s.exam, false);
    const a = await current(u);
    // Kalınca teorik modül zaten "tekrar gerekli"; ek eğitim yalnızca tamamlanmış modülleri açar
    const cardAm = await amOf(u, s.cardModuleId);
    await decideProcess(p.smUretim.actor, a.id, { decision: "extra_training", reason: "Kart yeniden okunmalı", reopenModuleIds: [cardAm.id] });
    expect((await amOf(u, s.cardModuleId)).status).toBe("review_required");
    expect((await current(u)).status).toBe("active");
    await finish(u, s.cardModuleId);
    await finish(u, s.theory);
    await takeExam(u, s.exam, false);
    expect((await current(u)).status).toBe("awaiting_decision");

    await decideProcess(p.hr.actor, a.id, { decision: "end_process", reason: "Pozisyon için uygun bulunmadı" });
    expect((await myLearning(u.actor)).current).toBeNull();
    const review = await readinessReview(p.hr.actor, a.id);
    expect(review.status).toBe("cancelled");
    expect(review.history.map((h) => h.decision)).toEqual(["end_process", "extra_training"]);
  });
});

describe("FG-7.2 katılım belgesi", () => {
  it("İSG modülü tamamlanınca otomatik; diğer modüllere İK düzenler, kursiyer kendine düzenleyemez", async () => {
    const p = await seedContentPeople();
    const ohs = p.ohs.actor;
    const c = await publishedText(ohs, null, "Genel İSG", "metin", true);
    const isg = (await createModule(ohs, moduleInput(null, "theory", "Genel İSG eğitimi", { isOhs: true, validityMonths: 12 }))).id;
    await setModuleContents(ohs, isg, [c]);
    const s = await setup(p);
    // Ortak İSG modülü planın başına eklenir; önce o tamamlanır
    const u = await createTestUser({ positionId: p.org.positions.presOp, trainingRequired: true });
    await finish(u, isg);
    await finish(u, s.cardModuleId);
    await finish(u, s.theory);
    const certs = await myCertificates(u.actor);
    expect(certs).toEqual([expect.objectContaining({ kind: "attendance", title: "Genel İSG eğitimi", state: "valid" })]);
    expect(certs[0]!.expiresAt).not.toBeNull();

    const theoryAm = await amOf(u, s.theory);
    await expect(issueAttendanceFor(u.actor, theoryAm.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(issueAttendanceFor(p.smKalite.actor, theoryAm.id)).rejects.toMatchObject({ code: "forbidden" });
    const { id } = await issueAttendanceFor(p.hr.actor, theoryAm.id);
    expect((await issueAttendanceFor(p.smUretim.actor, theoryAm.id)).id).toBe(id);
    expect(await myCertificates(u.actor)).toHaveLength(2);
  });
});
