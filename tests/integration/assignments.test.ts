import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { assignmentItems, assignments, notifications, quizResponses } from "@/server/db/schema";
import { isImmutableViolation } from "@/server/errors";
import { createContent, saveDraft, startNewVersion, submitForApproval } from "@/server/services/content";
import { createModule, setModuleContents } from "@/server/services/modules";
import { updatePerson } from "@/server/services/people";
import { listQuizQuestions, saveQuizQuestions } from "@/server/services/quiz";
import {
  assignmentsForPerson,
  myLearning,
  myTrainees,
  startAssignment,
  teamProgress,
  updateAssignment,
  waitingForTraining,
} from "@/server/services/assignments";
import {
  acknowledgeItem,
  acknowledgeReread,
  answerQuiz,
  learnModule,
  reportReachedEnd,
  reportVideoProgress,
} from "@/server/services/assignments/learner";
import {
  approveClassroomSession,
  createClassroomSession,
  rejectClassroomSession,
  submitClassroomSession,
  updateClassroomSession,
} from "@/server/services/classroom";
import { recognizeDevice, registerDevice, revokeDevice } from "@/server/services/devices";
import { getAssetForViewer } from "@/server/services/media";
import { owner } from "../support/db";
import { seedContentPeople, textBody } from "../support/content";
import { createTestUser } from "../support/factories";
import { moduleInput, presTraining, publishCard, publishedText } from "../support/training";

type People = Awaited<ReturnType<typeof seedContentPeople>>;

async function newHire(p: People, positionId = p.org.positions.presOp) {
  return createTestUser({ positionId, trainingRequired: true, hireDate: "2026-01-05" });
}

/** Modülün tüm adımlarını sona ulaştırıp onaylar. */
async function finishTheory(actor: Awaited<ReturnType<typeof newHire>>["actor"], assignmentModuleId: string) {
  const view = await learnModule(actor, assignmentModuleId);
  let completed = false;
  for (const item of view.items) {
    await reportReachedEnd(actor, item.id);
    completed = (await acknowledgeItem(actor, item.id)).moduleCompleted;
  }
  return completed;
}

const moduleOf = (s: Awaited<ReturnType<typeof myLearning>>["current"], moduleId: string) => s!.modules.find((m) => m.moduleId === moduleId)!;

describe("FG-3.2 otomatik atama", () => {
  it("yeni girişe pozisyonun planı atanır: kart modülü açık, sonrakiler kilitli; içerik ve kart sürümü sabitlenir", async () => {
    const p = await seedContentPeople();
    const t = await presTraining(p);
    const u = await newHire(p);
    const { current } = await myLearning(u.actor);
    expect(current).toMatchObject({ reason: "new_hire", status: "active", positionName: "Pres Operatörü", trainerUserId: null });
    expect(current!.modules.map((m) => [m.title, m.status])).toEqual([
      ["Pozisyon kartı: Pres Operatörü", "available"],
      ["Pres teorisi", "locked"],
      ["Pres pratiği", "locked"],
    ]);
    expect(moduleOf(current, t.theory).lock).toEqual({ kind: "prerequisites", titles: ["Pozisyon kartı: Pres Operatörü"] });
    // Kart modülü: künye + dolu bölümler (12 adım; 10 ve 11 de dolu sayılmaz → boş listeler)
    expect(moduleOf(current, t.cardModuleId).itemsTotal).toBeGreaterThanOrEqual(10);
    // Hedef tarih: işe giriş (gelecekte değilse bugün) + süre / günlük süre
    expect(current!.targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("kartı yayında olmayan pozisyondaki kişi bekler; kart yayınlanınca otomatik atanır", async () => {
    const p = await seedContentPeople();
    const u = await newHire(p);
    expect((await myLearning(u.actor)).current).toBeNull();
    expect((await waitingForTraining(p.hr.actor)).map((w) => [w.userId, w.reason])).toEqual([[u.userId, "no_published_card"]]);
    await presTraining(p);
    expect((await myLearning(u.actor)).current?.status).toBe("active");
    expect(await waitingForTraining(p.hr.actor)).toEqual([]);
  });

  it("eğitimi gerekmeyen kişiye otomatik atanmaz; İK elle başlatır (extra_training)", async () => {
    const p = await seedContentPeople();
    await presTraining(p);
    const u = await createTestUser({ positionId: p.org.positions.presOp });
    expect((await myLearning(u.actor)).current).toBeNull();
    await expect(startAssignment(p.smUretim.actor, u.userId, { trainerUserId: null, targetDate: null })).rejects.toMatchObject({ code: "forbidden" });
    await startAssignment(p.hr.actor, u.userId, { trainerUserId: p.trainerPres.userId, targetDate: "2026-12-31" });
    expect((await myLearning(u.actor)).current).toMatchObject({ reason: "extra_training", targetDate: "2026-12-31", trainerName: expect.any(String) });
    await expect(startAssignment(p.hr.actor, u.userId, { trainerUserId: null, targetDate: null })).rejects.toMatchObject({ code: "assignment_exists" });
  });

  it("ortak modüller yaka tipine göre başa eklenir ve sırayla açılır; kart modülü ortaklar bitince açılır", async () => {
    const p = await seedContentPeople();
    const genel = await publishedText(p.hr.actor, null, "Şirket tanıtımı", "JAPAR");
    const common1 = (await createModule(p.hr.actor, moduleInput(null, "theory", "Şirket tanıtımı", { commonSortOrder: 1 }))).id;
    await setModuleContents(p.hr.actor, common1, [genel]);
    const isg = await publishedText(p.ohs.actor, null, "Genel İSG", "KKD", true);
    const common2 = (await createModule(p.ohs.actor, moduleInput(null, "theory", "Genel İSG", { isOhs: true, commonSortOrder: 2 }))).id;
    await setModuleContents(p.ohs.actor, common2, [isg]);
    await createModule(p.hr.actor, moduleInput(null, "theory", "Beyaz yaka oryantasyonu", { commonTarget: "white", commonSortOrder: 3 }));
    const t = await presTraining(p);

    const u = await newHire(p);
    const { current } = await myLearning(u.actor);
    expect(current!.modules.map((m) => [m.title, m.isCommon, m.status])).toEqual([
      ["Şirket tanıtımı", true, "available"],
      ["Genel İSG", true, "locked"],
      ["Pozisyon kartı: Pres Operatörü", false, "locked"],
      ["Pres teorisi", false, "locked"],
      ["Pres pratiği", false, "locked"],
    ]);
    await finishTheory(u.actor, moduleOf(current, common1).id);
    const after = (await myLearning(u.actor)).current!;
    expect(moduleOf(after, common2).status).toBe("available");
    expect(moduleOf(after, t.cardModuleId).status).toBe("locked");
  });
});

describe("FG-3.4 ön koşul kilidi ve FG-4.2 tamamlama", () => {
  it("adım sona ulaşmadan onaylanamaz; tüm adımlar onaylanınca modül tamamlanır ve sonraki açılır; pratik eğitmen seçilene kadar kilitli", async () => {
    const p = await seedContentPeople();
    const t = await presTraining(p);
    const u = await newHire(p);
    let s = (await myLearning(u.actor)).current!;
    const cardAm = moduleOf(s, t.cardModuleId).id;

    await expect(learnModule(u.actor, moduleOf(s, t.theory).id)).rejects.toMatchObject({ code: "module_locked" });
    const view = await learnModule(u.actor, cardAm);
    expect(view.card?.identity.positionName).toBe("Pres Operatörü");
    await expect(acknowledgeItem(u.actor, view.items[0]!.id)).rejects.toMatchObject({ code: "not_reached_end" });
    expect(await finishTheory(u.actor, cardAm)).toBe(true);

    s = (await myLearning(u.actor)).current!;
    expect(moduleOf(s, t.cardModuleId)).toMatchObject({ status: "completed", completedVia: "online" });
    expect(moduleOf(s, t.theory).status).toBe("available");
    await finishTheory(u.actor, moduleOf(s, t.theory).id);
    s = (await myLearning(u.actor)).current!;
    expect(moduleOf(s, t.practice)).toMatchObject({ status: "locked", lock: { kind: "trainer" } });

    await updateAssignment(p.hr.actor, s.id, { trainerUserId: p.trainerPres.userId, targetDate: null });
    expect(moduleOf((await myLearning(u.actor)).current, t.practice).status).toBe("available");
    expect((await myTrainees(p.trainerPres.actor)).map((a) => a.userId)).toEqual([u.userId]);
    await expect(updateAssignment(p.hr.actor, s.id, { trainerUserId: u.userId, targetDate: null })).rejects.toMatchObject({ code: "trainer_is_trainee" });
  });

  it("video: izlenen benzersiz saniyeler sayılır, süre dışı aralık kırpılır; eşik (plan parametresi) aşılınca sona ulaşılır", async () => {
    const p = await seedContentPeople();
    const [asset] = await owner()`
      insert into media_assets (id, kind, status, object_key, mime, size, original_name, duration_sec, created_by)
      values (gen_random_uuid(), 'video', 'ready', 'media/x/original.mp4', 'video/mp4', 1000, 'v.mp4', 100, ${p.smUretim.userId})
      returning id`;
    const { id: video } = await createContent(p.smUretim.actor, { type: "video", title: "Pres videosu", ownerOrgUnitId: p.org.units.pres, commonTarget: null, isOhs: false });
    await saveDraft(p.smUretim.actor, video, { title: "Pres videosu", body: { assetId: asset!.id }, tagIds: [] });
    await submitForApproval(p.smUretim.actor, video, { changeNote: null, requireReread: false });
    const theory = (await createModule(p.smUretim.actor, moduleInput(p.org.units.pres, "theory", "Video modülü"))).id;
    await setModuleContents(p.smUretim.actor, theory, [video]);
    const { cardModuleId } = await publishCard(p, p.org.positions.presOp, [theory]);
    const u = await newHire(p);
    let s = (await myLearning(u.actor)).current!;
    await finishTheory(u.actor, moduleOf(s, cardModuleId).id);
    s = (await myLearning(u.actor)).current!;
    const view = await learnModule(u.actor, moduleOf(s, theory).id);
    const item = view.items[0]!;
    expect(item).toMatchObject({ contentType: "video", videoDurationSec: 100 });
    expect(await getAssetForViewer(u.actor, asset!.id)).not.toBeNull();

    await expect(reportReachedEnd(u.actor, item.id)).rejects.toMatchObject({ code: "invalid_input" });
    expect(await reportVideoProgress(u.actor, item.id, [[0, 40], [20, 50]])).toEqual({ ratio: 0.5, reachedEnd: false });
    // Aynı kısmı tekrar izlemek sayılmaz
    expect((await reportVideoProgress(u.actor, item.id, [[0, 50]])).ratio).toBe(0.5);
    expect(await reportVideoProgress(u.actor, item.id, [[60, 5000]])).toEqual({ ratio: 0.9, reachedEnd: true });
    expect((await acknowledgeItem(u.actor, item.id)).moduleCompleted).toBe(true);
    // "Okudum, anladım" sonrası adım değiştirilemez
    const err = await db().update(assignmentItems).set({ progressRatio: 0 }).where(eq(assignmentItems.id, item.id)).then(() => null, (e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);
  });
});

describe("FG-4.3 ara değerlendirme", () => {
  it("0 ya da 3–5 soru; adımlar bitmeden cevaplanamaz; yanlışta doğru şık ve açıklama döner; cevap değiştirilemez", async () => {
    const p = await seedContentPeople();
    const t = await presTraining(p);
    const q = (stem: string, correctIndex = 0) => ({ type: "single_choice" as const, stem, options: ["A şıkkı", "B şıkkı", "C şıkkı"], correctIndex, explanation: `${stem} açıklama` });
    await expect(saveQuizQuestions(p.smUretim.actor, t.theory, [q("Soru bir"), q("Soru iki")])).rejects.toMatchObject({ code: "quiz_count_invalid" });
    await expect(saveQuizQuestions(p.trainerKalite.actor, t.theory, [q("Soru bir"), q("Soru iki"), q("Soru üç")])).rejects.toMatchObject({ code: "not_found" });
    await saveQuizQuestions(p.smUretim.actor, t.theory, [
      q("Soru bir"),
      q("Soru iki", 1),
      { type: "true_false", stem: "Işık perdesi köprülenebilir", options: ["Doğru", "Yanlış"], correctIndex: 1, explanation: null },
    ]);

    const u = await newHire(p);
    let s = (await myLearning(u.actor)).current!;
    await finishTheory(u.actor, moduleOf(s, t.cardModuleId).id);
    s = (await myLearning(u.actor)).current!;
    const am = moduleOf(s, t.theory).id;
    let view = await learnModule(u.actor, am);
    expect(view.quizUnlocked).toBe(false);

    expect(await finishTheory(u.actor, am)).toBe(false); // sorular cevaplanmadan tamamlanmaz
    view = await learnModule(u.actor, am);
    expect(view.quiz).toHaveLength(3);
    const wrong = await answerQuiz(u.actor, am, view.quiz[1]!.id, 0);
    expect(wrong).toMatchObject({ isCorrect: false, correctIndex: 1, explanation: "Soru iki açıklama", moduleCompleted: false });
    await expect(answerQuiz(u.actor, am, view.quiz[1]!.id, 1)).rejects.toMatchObject({ code: "quiz_already_answered" });
    await answerQuiz(u.actor, am, view.quiz[0]!.id, 0);
    expect((await answerQuiz(u.actor, am, view.quiz[2]!.id, 1)).moduleCompleted).toBe(true);

    // Soru sonradan düzenlense de kayıttaki metin korunur
    const current = await listQuizQuestions(p.smUretim.actor, t.theory);
    await saveQuizQuestions(p.smUretim.actor, t.theory, current.map((x, i) => ({ ...x, stem: i === 0 ? "Değişmiş soru" : x.stem })));
    const after = await learnModule(u.actor, am);
    expect(after.quiz[0]!.stem).toBe("Soru bir");
    const err = await db().update(quizResponses).set({ answerIndex: 2 }).then(() => null, (e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);
  });
});

describe("FG-4.4 sınıf eğitimi", () => {
  it("uzaktan verilemez İSG modülü çevrim içi tamamlanmaz; onaylanan sınıf kaydıyla tamamlanır; kimse kendi kaydını onaylayamaz", async () => {
    const p = await seedContentPeople();
    const c = await publishedText(p.ohs.actor, p.org.units.pres, "Pres İSG", "LOTO", true);
    const ohsModule = (await createModule(p.ohs.actor, moduleInput(p.org.units.pres, "theory", "Pres İSG eğitimi", { isOhs: true, remoteAllowed: false }))).id;
    await setModuleContents(p.ohs.actor, ohsModule, [c]);
    const { cardModuleId } = await publishCard(p, p.org.positions.presOp, [ohsModule]);
    const u = await newHire(p);
    let s = (await myLearning(u.actor)).current!;
    await finishTheory(u.actor, moduleOf(s, cardModuleId).id);
    s = (await myLearning(u.actor)).current!;
    expect(await finishTheory(u.actor, moduleOf(s, ohsModule).id)).toBe(false);
    expect(moduleOf((await myLearning(u.actor)).current, ohsModule).status).toBe("in_progress");

    const form = await owner()`
      insert into media_assets (id, kind, status, object_key, mime, size, original_name, created_by)
      values (gen_random_uuid(), 'pdf', 'ready', 'media/f/original.pdf', 'application/pdf', 10, 'form.pdf', ${p.trainerPres.userId}) returning id`;
    const input = { moduleId: ohsModule, trainerUserId: p.trainerPres.userId, sessionDate: "2026-02-01", durationMin: 120, location: "Eğitim salonu", notes: null, scannedFormAssetId: null, attendeeIds: [u.userId] };
    await expect(createClassroomSession(p.personnel.actor, input)).rejects.toMatchObject({ code: "forbidden" });
    const { id } = await createClassroomSession(p.trainerPres.actor, input);
    await expect(submitClassroomSession(p.trainerPres.actor, id)).rejects.toMatchObject({ code: "scanned_form_required" });
    await updateClassroomSession(p.trainerPres.actor, id, { ...input, scannedFormAssetId: form[0]!.id });
    await submitClassroomSession(p.trainerPres.actor, id);

    // İSG modülünü yalnızca İSG uzmanı onaylar (bölüm sorumlusu bu kaydı görmez)
    await expect(approveClassroomSession(p.smUretim.actor, id)).rejects.toMatchObject({ code: "not_found" });
    await rejectClassroomSession(p.ohs.actor, id, "Form okunmuyor");
    await updateClassroomSession(p.trainerPres.actor, id, { ...input, scannedFormAssetId: form[0]!.id });
    await submitClassroomSession(p.trainerPres.actor, id);
    expect(await approveClassroomSession(p.ohs.actor, id)).toEqual({ completed: 1 });
    expect(moduleOf((await myLearning(u.actor)).current, ohsModule)).toMatchObject({ status: "completed", completedVia: "classroom" });

    const err = await owner()`update classroom_sessions set location = 'x' where id = ${id}`.then(() => null, (e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);
  });

  it("kaydı tutan veya eğitimi veren onaylayamaz", async () => {
    const p = await seedContentPeople();
    const c = await publishedText(p.smUretim.actor, p.org.units.pres, "Pres kuralları", "metin");
    const m = (await createModule(p.smUretim.actor, moduleInput(p.org.units.pres, "theory", "Pres sınıf eğitimi"))).id;
    await setModuleContents(p.smUretim.actor, m, [c]);
    const form = await owner()`
      insert into media_assets (id, kind, status, object_key, mime, size, original_name, created_by)
      values (gen_random_uuid(), 'image', 'ready', 'media/g/original.jpg', 'image/jpeg', 10, 'form.jpg', ${p.smUretim.userId}) returning id`;
    const { id } = await createClassroomSession(p.hr.actor, {
      moduleId: m, trainerUserId: p.smUretim.userId, sessionDate: "2026-02-01", durationMin: 60, location: "Salon", notes: null, scannedFormAssetId: form[0]!.id, attendeeIds: [p.personnel.userId],
    });
    await submitClassroomSession(p.hr.actor, id);
    await expect(approveClassroomSession(p.smUretim.actor, id)).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("FG-3.3 pozisyon değişikliği ve FG-2.2 okuma görevi", () => {
  it("pozisyon değişince eski atama iptal, geçerli aynı modüller devreder", async () => {
    const p = await seedContentPeople();
    const shared = await publishedText(p.smUretim.actor, p.org.units.uretim, "Üretim kuralları", "ortak");
    const deptModule = (await createModule(p.smUretim.actor, moduleInput(p.org.units.uretim, "theory", "Üretim temel eğitimi"))).id;
    await setModuleContents(p.smUretim.actor, deptModule, [shared]);
    const pres = await publishCard(p, p.org.positions.presOp, [deptModule]);
    await publishCard(p, p.org.positions.montajOp, [deptModule]);

    const u = await newHire(p);
    let s = (await myLearning(u.actor)).current!;
    await finishTheory(u.actor, moduleOf(s, pres.cardModuleId).id);
    s = (await myLearning(u.actor)).current!;
    await finishTheory(u.actor, moduleOf(s, deptModule).id);

    await updatePerson(p.hr.actor, u.userId, { fullName: "Taşınan Kişi", positionId: p.org.positions.montajOp, employmentType: "employee", hireDate: "2026-01-05", trainingRequired: true, phone: null, email: null, nationalId: null });
    const { current, history } = await myLearning(u.actor);
    expect(current).toMatchObject({ reason: "position_change", positionName: "Montaj Operatörü" });
    expect(moduleOf(current, deptModule)).toMatchObject({ status: "completed", completedVia: "carried_over" });
    expect(current!.modules[0]).toMatchObject({ title: "Pozisyon kartı: Montaj Operatörü", status: "available" });
    expect(history[0]).toMatchObject({ status: "cancelled", cancelReason: "position_change" });
  });

  it("'tekrar oku' işaretli yeni sürüm, önceki sürümü onaylayanlara okuma görevi açar", async () => {
    const p = await seedContentPeople();
    const t = await presTraining(p);
    const u = await newHire(p);
    let s = (await myLearning(u.actor)).current!;
    await finishTheory(u.actor, moduleOf(s, t.cardModuleId).id);
    s = (await myLearning(u.actor)).current!;
    await finishTheory(u.actor, moduleOf(s, t.theory).id);
    const other = await newHire(p); // henüz okumadı

    await startNewVersion(p.smUretim.actor, t.c1);
    await saveDraft(p.smUretim.actor, t.c1, { title: "Pres temelleri", body: textBody("Yeni kural eklendi"), tagIds: [] });
    await submitForApproval(p.smUretim.actor, t.c1, { changeNote: "Yeni kural", requireReread: true });

    const tasks = (await myLearning(u.actor)).rereads;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ contentTitle: "Pres temelleri", overdue: false });
    // SPEC 10.2 (Faz 2): kursiyere okuma görevi bildirimi
    const notes = await db().select().from(notifications).where(and(eq(notifications.userId, u.userId), eq(notifications.kind, "reread_assigned")));
    expect(notes.map((x) => x.params)).toEqual([{ title: "Pres temelleri" }]);
    expect((await myLearning(other.actor)).rereads).toEqual([]);
    await acknowledgeReread(u.actor, tasks[0]!.id);
    expect((await myLearning(u.actor)).rereads).toEqual([]);
  });
});

describe("Atama görünürlüğü ve ortak cihaz", () => {
  it("kişi, İK, kapsamdaki bölüm sorumlusu ve eğitmen görür; diğerleri göremez", async () => {
    const p = await seedContentPeople();
    await presTraining(p);
    const u = await newHire(p);
    expect(await assignmentsForPerson(p.hr.actor, u.userId)).toHaveLength(1);
    expect(await assignmentsForPerson(p.smUretim.actor, u.userId)).toHaveLength(1);
    await expect(assignmentsForPerson(p.smKalite.actor, u.userId)).rejects.toMatchObject({ code: "not_found" });
    await expect(assignmentsForPerson(p.trainerPres.actor, u.userId)).rejects.toMatchObject({ code: "not_found" });
    await expect(assignmentsForPerson(p.personnel.actor, u.userId)).rejects.toMatchObject({ code: "not_found" });
    expect((await teamProgress(p.smUretim.actor)).map((a) => a.userId)).toEqual([u.userId]);
    expect(await teamProgress(p.smKalite.actor)).toEqual([]);
    const [a] = await db().select().from(assignments).where(eq(assignments.userId, u.userId));
    await updateAssignment(p.hr.actor, a!.id, { trainerUserId: p.trainerPres.userId, targetDate: null });
    expect(await assignmentsForPerson(p.trainerPres.actor, u.userId)).toHaveLength(1);
  });

  it("FG-4.1 kayıtlı ortak cihaz tanınır; iptal edilince tanınmaz", async () => {
    const p = await seedContentPeople();
    await expect(registerDevice(p.hr.actor, { name: "Eğitim odası 1" })).rejects.toMatchObject({ code: "forbidden" });
    const { id, token } = await registerDevice(p.sysadmin.actor, { name: "Eğitim odası 1" });
    expect(await recognizeDevice(token)).toMatchObject({ id, name: "Eğitim odası 1" });
    expect(await recognizeDevice("yanlis")).toBeNull();
    await revokeDevice(p.sysadmin.actor, id);
    expect(await recognizeDevice(token)).toBeNull();
  });
});
