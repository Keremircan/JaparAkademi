import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { examAttempts, questionVersions } from "@/server/db/schema";
import { isImmutableViolation } from "@/server/errors";
import { myLearning } from "@/server/services/assignments";
import { acknowledgeItem, learnModule, reportReachedEnd } from "@/server/services/assignments/learner";
import { answerExam, attemptsForAssignment, examInfo, getAttempt, recordExamEvent, startExam, submitExam } from "@/server/services/exams";
import { issueProctorCode } from "@/server/services/exams/proctor";
import { createModule, setModuleContents } from "@/server/services/modules";
import {
  approveQuestionVersion,
  createQuestion,
  getQuestion,
  listQuestions,
  questionApprovalQueue,
  rejectQuestionVersion,
  updateQuestion,
  type QuestionInput,
} from "@/server/services/questions";
import { commitQuestionImport, previewQuestionImport } from "@/server/services/questions/import";
import { owner } from "../support/db";
import { seedContentPeople } from "../support/content";
import { createTestUser } from "../support/factories";
import { moduleInput, publishCard, publishedText } from "../support/training";

type People = Awaited<ReturnType<typeof seedContentPeople>>;
type Trainee = Awaited<ReturnType<typeof createTestUser>>;

const q = (moduleId: string, stem: string, topic = "Pres", extra: Partial<QuestionInput> = {}): QuestionInput => ({
  type: "single_choice",
  stem,
  options: ["Doğru şık", "Yanlış şık bir", "Yanlış şık iki"],
  correctIndex: 0,
  explanation: null,
  topic,
  difficulty: 1,
  isOhsCritical: false,
  mediaAssetId: null,
  moduleIds: [moduleId],
  ...extra,
});

/** Pres: teorik modül (1 içerik) + teorik sınav (4 soru, gözetmenli). Havuz: 8 soru, 2 konu. */
async function examSetup(p: People, examSettings: object = {}) {
  const sm = p.smUretim.actor;
  const c = await publishedText(sm, p.org.units.pres, "Pres temelleri", "metin");
  const theory = (await createModule(sm, moduleInput(p.org.units.pres, "theory", "Pres teorisi"))).id;
  await setModuleContents(sm, theory, [c]);
  const exam = (await createModule(sm, moduleInput(p.org.units.pres, "theory_exam", "Pres sınavı"))).id;
  for (let i = 0; i < 8; i++) {
    await createQuestion(sm, { ...q(theory, `Soru numarası ${i}`, i % 2 ? "Güvenlik" : "Kalıp", { difficulty: (i % 3) + 1 }), ownerOrgUnitId: p.org.units.pres, isOhs: false });
  }
  const { cardModuleId } = await publishCard(p, p.org.positions.presOp, [theory, exam], sm, {
    [exam]: { questionCount: 4, passScore: 75, maxAttempts: 2, cooldownHours: 0, durationMin: 10, proctorRequired: true, ...examSettings },
  });
  return { theory, exam, cardModuleId };
}

async function finishTheory(u: Trainee, assignmentModuleId: string) {
  const view = await learnModule(u.actor, assignmentModuleId);
  for (const item of view.items) {
    await reportReachedEnd(u.actor, item.id);
    await acknowledgeItem(u.actor, item.id);
  }
}

async function traineeReady(p: People, s: Awaited<ReturnType<typeof examSetup>>) {
  const u = await createTestUser({ positionId: p.org.positions.presOp, trainingRequired: true });
  let cur = (await myLearning(u.actor)).current!;
  await finishTheory(u, cur.modules.find((m) => m.moduleId === s.cardModuleId)!.id);
  cur = (await myLearning(u.actor)).current!;
  await finishTheory(u, cur.modules.find((m) => m.moduleId === s.theory)!.id);
  cur = (await myLearning(u.actor)).current!;
  return { u, examAm: cur.modules.find((m) => m.moduleId === s.exam)!.id, assignmentId: cur.id };
}

/** Denemedeki her soruyu doğru (ya da yanlış) cevaplar. */
async function answerAll(u: Trainee, attemptId: string, correct: boolean | ((i: number) => boolean)) {
  const view = await getAttempt(u.actor, attemptId);
  if (view.state !== "open") throw new Error("açık değil");
  for (const [i, item] of view.questions.entries()) {
    const want = typeof correct === "function" ? correct(i) : correct;
    const shownCorrect = item.options.indexOf("Doğru şık");
    await answerExam(u.actor, attemptId, item.itemId, want ? shownCorrect : (shownCorrect + 1) % item.options.length);
  }
}

describe("Bölüm 6 soru bankası", () => {
  it("bölüm sorumlusunun sorusu aktif; İSG kritik soru İSG uzmanı onayıyla aktifleşir; kendi sorusunu onaylayamaz", async () => {
    const p = await seedContentPeople();
    const m = (await createModule(p.smUretim.actor, moduleInput(p.org.units.pres, "theory", "Modül"))).id;
    const normal = await createQuestion(p.smUretim.actor, { ...q(m, "Normal soru metni"), ownerOrgUnitId: p.org.units.pres, isOhs: false });
    expect(normal.status).toBe("active");
    const critical = await createQuestion(p.smUretim.actor, { ...q(m, "Kritik soru metni", "İSG", { isOhsCritical: true }), ownerOrgUnitId: p.org.units.pres, isOhs: false });
    expect(critical.status).toBe("ohs_review");

    const [pending] = await questionApprovalQueue(p.ohs.actor);
    expect(pending?.questionId).toBe(critical.id);
    await expect(approveQuestionVersion(p.smUretim.actor, pending!.versionId)).rejects.toMatchObject({ code: "forbidden" });
    await rejectQuestionVersion(p.ohs.actor, pending!.versionId, "Şıkları netleştirin");
    await updateQuestion(p.smUretim.actor, critical.id, q(m, "Kritik soru metni düzeltildi", "İSG", { isOhsCritical: true }));
    const [again] = await questionApprovalQueue(p.ohs.actor);
    await approveQuestionVersion(p.ohs.actor, again!.versionId);
    expect((await getQuestion(p.smUretim.actor, critical.id)).currentVersionId).toBe(again!.versionId);

    // İSG uzmanının kendi İSG sorusu doğrudan aktif
    expect((await createQuestion(p.ohs.actor, { ...q(m, "Ortak İSG sorusu", "İSG"), ownerOrgUnitId: null, isOhs: true })).status).toBe("active");
  });

  it("görünürlük: İK okur ama değiştiremez; eğitmen göremez; kapsam dışı bölüm sorumlusu göremez; ortak soru yalnızca İSG", async () => {
    const p = await seedContentPeople();
    const m = (await createModule(p.smUretim.actor, moduleInput(p.org.units.pres, "theory", "Modül"))).id;
    const { id } = await createQuestion(p.smUretim.actor, { ...q(m, "Görünürlük sorusu"), ownerOrgUnitId: p.org.units.pres, isOhs: false });
    expect((await listQuestions(p.hr.actor)).items.map((x) => x.id)).toEqual([id]);
    await expect(updateQuestion(p.hr.actor, id, q(m, "İK değiştiremez"))).rejects.toMatchObject({ code: "forbidden" });
    await expect(listQuestions(p.trainerPres.actor)).rejects.toMatchObject({ code: "forbidden" });
    expect((await listQuestions(p.smKalite.actor)).items).toEqual([]);
    await expect(getQuestion(p.smKalite.actor, id)).rejects.toMatchObject({ code: "not_found" });
    await expect(createQuestion(p.smUretim.actor, { ...q(m, "Ortak soru"), ownerOrgUnitId: null, isOhs: false })).rejects.toMatchObject({ code: "question_owner_required" });
  });

  it("karar #61: kullanılmamış soru yerinde düzenlenir; sınavda kullanılmış sürüm değişmez, düzenleme yeni sürüm açar", async () => {
    const p = await seedContentPeople();
    const s = await examSetup(p, { proctorRequired: false });
    const { id } = (await listQuestions(p.smUretim.actor)).items[0]!;
    await updateQuestion(p.smUretim.actor, id, q(s.theory, "Yerinde düzenlendi"));
    expect((await getQuestion(p.smUretim.actor, id)).versions).toHaveLength(1);

    const { u, examAm } = await traineeReady(p, s);
    await startExam(u.actor, examAm, { code: null, ip: null, userAgent: null });
    const used = await db().select().from(questionVersions);
    const err = await db().update(questionVersions).set({ stem: "x" }).where(eq(questionVersions.questionId, id)).then(() => null, (e: unknown) => e);
    // Bu soru denemeye çekildiyse değiştirilemez; çekilmediyse yerinde düzenlenebilir
    const drawn = (await owner()`select 1 from exam_attempt_items i join question_versions v on v.id = i.question_version_id where v.question_id = ${id}`).length > 0;
    expect(isImmutableViolation(err)).toBe(drawn);
    expect(used.length).toBe(8);
    if (drawn) {
      await updateQuestion(p.smUretim.actor, id, q(s.theory, "Yeni sürüm metni"));
      const d = await getQuestion(p.smUretim.actor, id);
      expect(d.versions.map((v) => [v.version, v.status])).toEqual([
        [2, "active"],
        [1, "retired"],
      ]);
    }
  });
});

describe("FG-6.1 teorik sınav", () => {
  it("gözetmen kodu zorunlu; yanlış kodlar sınırlı; dengeli çekim; geçince modül tamamlanır; doğru cevaplar gösterilmez", async () => {
    const p = await seedContentPeople();
    const s = await examSetup(p);
    const { u, examAm, assignmentId } = await traineeReady(p, s);
    const info = await examInfo(u.actor, examAm);
    expect(info).toMatchObject({ block: null, used: 0, left: 2, rules: { questionCount: 4, proctorRequired: true } });

    await expect(startExam(u.actor, examAm, { code: null, ip: null, userAgent: null })).rejects.toMatchObject({ code: "proctor_code_required" });
    await expect(startExam(u.actor, examAm, { code: "000000", ip: null, userAgent: null })).rejects.toMatchObject({ code: "proctor_code_invalid" });
    // Kursiyerin kendi ürettiği kod geçmez
    await expect(issueProctorCode(u.actor, { location: null })).rejects.toMatchObject({ code: "forbidden" });
    const { code } = await issueProctorCode(p.trainerPres.actor, { location: "Eğitim odası" });
    const { attemptId } = await startExam(u.actor, examAm, { code, ip: "10.0.0.5", userAgent: "vitest" });

    const view = await getAttempt(u.actor, attemptId);
    expect(view.state).toBe("open");
    if (view.state !== "open") return;
    expect(view.questions).toHaveLength(4);
    const topics = await owner()`
      select v.topic, count(*)::int as n from exam_attempt_items i join question_versions v on v.id = i.question_version_id
      where i.attempt_id = ${attemptId} group by v.topic order by v.topic`;
    expect(topics.map((t) => t.n)).toEqual([2, 2]);
    expect(JSON.stringify(view)).not.toContain("correctIndex");

    await recordExamEvent(u.actor, attemptId, "tab_hidden");
    await recordExamEvent(u.actor, attemptId, "tts");
    await answerAll(u, attemptId, true);
    await submitExam(u.actor, attemptId);
    const result = await getAttempt(u.actor, attemptId);
    expect(result).toMatchObject({ state: "submitted", score: 100, passed: true, submitReason: "user" });
    expect(JSON.stringify(result)).not.toContain("Doğru şık");

    const cur = (await myLearning(u.actor)).current!;
    expect(cur.modules.find((m) => m.moduleId === s.exam)!.status).toBe("completed");
    const staff = await attemptsForAssignment(p.trainerPres.actor, assignmentId).catch(() => null);
    expect(staff).toBeNull(); // eğitmen atanmadı → göremez
    const hr = await attemptsForAssignment(p.hr.actor, assignmentId);
    expect(hr[0]).toMatchObject({ score: 100, tabLeaveCount: 1, ttsUsed: true, proctorName: expect.any(String) });
    await expect(attemptsForAssignment(u.actor, assignmentId)).rejects.toMatchObject({ code: "not_found" });

    // Teslim edilen deneme değiştirilemez
    const err = await db().update(examAttempts).set({ score: 0 }).where(eq(examAttempts.id, attemptId)).then(() => null, (e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);
    await expect(answerExam(u.actor, attemptId, (view.questions[0]!).itemId, 0)).rejects.toMatchObject({ code: "exam_submitted" });
  });

  it("kalınca ilgili teorik modül tekrar açılır, sınav kilitlenir; tüm haklar bitince atama karar bekler", async () => {
    const p = await seedContentPeople();
    const s = await examSetup(p, { proctorRequired: false });
    const { u, examAm } = await traineeReady(p, s);
    const first = await startExam(u.actor, examAm, { code: null, ip: null, userAgent: null });
    await answerAll(u, first.attemptId, (i) => i === 0); // %25
    await submitExam(u.actor, first.attemptId);
    expect(await getAttempt(u.actor, first.attemptId)).toMatchObject({ passed: false, failReason: "score", left: 1 });

    let cur = (await myLearning(u.actor)).current!;
    const theoryAm = cur.modules.find((m) => m.moduleId === s.theory)!;
    expect(theoryAm).toMatchObject({ status: "review_required", itemsDone: 0, itemsTotal: 1 });
    expect(cur.modules.find((m) => m.moduleId === s.exam)!.status).toBe("locked");
    expect((await examInfo(u.actor, examAm)).block).toBe("locked");

    await finishTheory(u, theoryAm.id);
    cur = (await myLearning(u.actor)).current!;
    expect(cur.modules.find((m) => m.moduleId === s.exam)!.status).toBe("available");

    const second = await startExam(u.actor, examAm, { code: null, ip: null, userAgent: null });
    await answerAll(u, second.attemptId, false);
    await submitExam(u.actor, second.attemptId);
    expect((await myLearning(u.actor)).current!.status).toBe("awaiting_decision");
    expect((await examInfo(u.actor, examAm)).block).toBe("locked");
  });

  it("İSG kritik soru yanlışsa puan yüksek olsa da kalır; bekleme süresi dolmadan yeni deneme başlamaz", async () => {
    const p = await seedContentPeople();
    const sm = p.smUretim.actor;
    const c = await publishedText(sm, p.org.units.pres, "İçerik", "metin");
    const theory = (await createModule(sm, moduleInput(p.org.units.pres, "theory", "Teori"))).id;
    await setModuleContents(sm, theory, [c]);
    const exam = (await createModule(sm, moduleInput(p.org.units.pres, "theory_exam", "Sınav"))).id;
    for (let i = 0; i < 4; i++) {
      const { id } = await createQuestion(sm, { ...q(theory, `Kritik ${i}`, "İSG", { isOhsCritical: i === 0 }), ownerOrgUnitId: p.org.units.pres, isOhs: false });
      if (i === 0) {
        const [pending] = await questionApprovalQueue(p.ohs.actor);
        await approveQuestionVersion(p.ohs.actor, pending!.versionId);
        expect(id).toBe(pending!.questionId);
      }
    }
    const { cardModuleId } = await publishCard(p, p.org.positions.presOp, [theory, exam], sm, {
      [exam]: { questionCount: 4, passScore: 50, maxAttempts: 3, cooldownHours: 24, proctorRequired: false },
    });
    const { u, examAm } = await traineeReady(p, { theory, exam, cardModuleId });
    const { attemptId } = await startExam(u.actor, examAm, { code: null, ip: null, userAgent: null });
    const view = await getAttempt(u.actor, attemptId);
    if (view.state !== "open") throw new Error();
    for (const item of view.questions) {
      const critical = item.stem === "Kritik 0";
      const right = item.options.indexOf("Doğru şık");
      await answerExam(u.actor, attemptId, item.itemId, critical ? (right + 1) % 3 : right);
    }
    await submitExam(u.actor, attemptId);
    expect(await getAttempt(u.actor, attemptId)).toMatchObject({ score: 75, passed: false, failReason: "ohs_critical" });

    const cur = (await myLearning(u.actor)).current!;
    await finishTheory(u, cur.modules.find((m) => m.moduleId === theory)!.id);
    await expect(startExam(u.actor, examAm, { code: null, ip: null, userAgent: null })).rejects.toMatchObject({ code: "exam_cooldown" });
    expect((await examInfo(u.actor, examAm)).block).toBe("cooldown");
  });

  it("süre dolunca verilen cevaplarla teslim edilir", async () => {
    const p = await seedContentPeople();
    const s = await examSetup(p, { proctorRequired: false });
    const { u, examAm } = await traineeReady(p, s);
    const { attemptId } = await startExam(u.actor, examAm, { code: null, ip: null, userAgent: null });
    await answerAll(u, attemptId, true);
    await owner()`alter table exam_attempts disable trigger user`;
    await owner()`update exam_attempts set deadline_at = now() - interval '1 minute' where id = ${attemptId}`;
    await owner()`alter table exam_attempts enable trigger user`;
    expect(await getAttempt(u.actor, attemptId)).toMatchObject({ state: "submitted", submitReason: "timeout", passed: true });
  });

  it("Bölüm 6: havuz soru sayısından azsa sınav başlamaz", async () => {
    // Havuz: 8 soru; sınav 10 soru isterse başlamaz
    const p2 = await seedContentPeople();
    const s2 = await examSetup(p2, { proctorRequired: false, questionCount: 10 });
    const t2 = await traineeReady(p2, s2);
    expect((await examInfo(t2.u.actor, t2.examAm)).block).toBe("pool_insufficient");
    await expect(startExam(t2.u.actor, t2.examAm, { code: null, ip: null, userAgent: null })).rejects.toMatchObject({ code: "exam_pool_insufficient" });
  });

  it("karar #62: kursiyer başına yanlış kod sınırı aşılınca kilitlenir", async () => {
    const p = await seedContentPeople();
    const s = await examSetup(p);
    const { u, examAm } = await traineeReady(p, s);
    for (let i = 0; i < 5; i++) await expect(startExam(u.actor, examAm, { code: "123456", ip: null, userAgent: null })).rejects.toMatchObject({ code: "proctor_code_invalid" });
    const { code } = await issueProctorCode(p.smUretim.actor, { location: null });
    await expect(startExam(u.actor, examAm, { code, ip: null, userAgent: null })).rejects.toMatchObject({ code: "proctor_code_locked" });
  });
});

describe("Excel'den soru aktarma (karar #64)", () => {
  async function workbook(rows: (string | number)[][]) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sorular");
    ws.addRow(["Soru", "Tip", "A", "B", "C", "D", "E", "Doğru", "Konu", "Zorluk", "İSG kritik", "Modül", "Açıklama"]);
    for (const r of rows) ws.addRow(r);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it("önizlemede satır hataları gösterilir; onayda geçerli satırlar oluşturulur, İSG kritik olanlar onaya gider", async () => {
    const p = await seedContentPeople();
    await createModule(p.smUretim.actor, moduleInput(p.org.units.pres, "theory", "Pres Teorisi"));
    const file = await workbook([
      ["Eller nerede olmalı?", "Çoktan seçmeli", "Kumandada", "Kalıpta", "", "", "", "A", "Pres", 1, "Hayır", "pres teorisi", ""],
      ["Işık perdesi köprülenebilir.", "Doğru/Yanlış", "", "", "", "", "", "Yanlış", "Pres", 2, "Evet", "PRES TEORİSİ", "Asla."],
      ["Kısa", "Çoktan seçmeli", "A", "", "", "", "", "C", "", 5, "Belki", "Olmayan modül", ""],
    ]);
    const target = { ownerOrgUnitId: p.org.units.pres, isOhs: false };
    const preview = await previewQuestionImport(p.smUretim.actor, file, target);
    expect(preview.map((r) => r.errors)).toEqual([
      [],
      [],
      ["stem_missing", "options_missing", "correct_invalid", "topic_missing", "difficulty_invalid", "critical_invalid", "module_not_found"],
    ]);
    await expect(previewQuestionImport(p.smKalite.actor, file, target)).rejects.toMatchObject({ code: "forbidden" });
    expect(await commitQuestionImport(p.smUretim.actor, file, target)).toEqual({ created: 1, pending: 1, skipped: 1 });
    expect((await listQuestions(p.smUretim.actor)).items.map((x) => [x.type, x.active, x.pending]).sort()).toEqual([
      ["single_choice", true, false],
      ["true_false", false, true],
    ]);
  });
});
