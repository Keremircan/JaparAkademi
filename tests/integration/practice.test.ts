import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { practicalExamResults, practiceMarks, signatures } from "@/server/db/schema";
import { isImmutableViolation } from "@/server/errors";
import { myLearning, updateAssignment } from "@/server/services/assignments";
import { acknowledgeItem, learnModule, reportReachedEnd } from "@/server/services/assignments/learner";
import { getAssetForViewer } from "@/server/services/media";
import { createModule, saveTasks } from "@/server/services/modules";
import {
  evaluatorOverview,
  getPracticalExam,
  markTask,
  myPractice,
  practicalExamInfo,
  practiceModule,
  returnPracticalExam,
  savePracticalDraft,
  secondSignatureQueue,
  secondSignPracticalExam,
  signPracticalExam,
  startPracticalExam,
} from "@/server/services/practice";
import type { PracticeLevel } from "@/server/state/practice";
import { owner } from "../support/db";
import { seedContentPeople } from "../support/content";
import { createTestUser } from "../support/factories";
import { testSignaturePng } from "../support/signature";
import { moduleInput, publishCard } from "../support/training";

type People = Awaited<ReturnType<typeof seedContentPeople>>;
type Actor = Parameters<typeof markTask>[0];

const META = { ip: "10.0.0.9", userAgent: "vitest" };

/** Pres: kart + pratik modül (3 görev, biri kritik) + pratik sınav (geçme 80, 2 hak). Kursiyerin kartı tamam, eğitmeni atanmış. */
async function setup(p: People) {
  const sm = p.smUretim.actor;
  const practice = (await createModule(sm, moduleInput(p.org.units.pres, "practice", "Pres pratiği"))).id;
  await saveTasks(sm, practice, [
    { title: "Kalıp bağlama", description: null, isCritical: true },
    { title: "İlk parça onayı", description: null, isCritical: false },
    { title: "Hurda kaydı", description: null, isCritical: false },
  ]);
  const exam = (await createModule(sm, moduleInput(p.org.units.pres, "practice_exam", "Pres pratik sınavı"))).id;
  const { cardModuleId } = await publishCard(p, p.org.positions.presOp, [practice, exam], sm, { [exam]: { passScore: 80, maxAttempts: 2 } });
  const u = await createTestUser({ positionId: p.org.positions.presOp, trainingRequired: true });
  let cur = (await myLearning(u.actor)).current!;
  const card = await learnModule(u.actor, cur.modules.find((m) => m.moduleId === cardModuleId)!.id);
  for (const item of card.items) {
    await reportReachedEnd(u.actor, item.id);
    await acknowledgeItem(u.actor, item.id);
  }
  await updateAssignment(p.hr.actor, cur.id, { trainerUserId: p.trainerPres.userId, targetDate: null });
  cur = (await myLearning(u.actor)).current!;
  const practiceAm = cur.modules.find((m) => m.moduleId === practice)!.id;
  const examAm = cur.modules.find((m) => m.moduleId === exam)!.id;
  const view = await practiceModule(p.trainerPres.actor, practiceAm);
  return { u, assignmentId: cur.id, practiceAm, examAm, tasks: view.tasks.map((t) => t.taskId) };
}

async function markAll(actor: Actor, practiceAm: string, tasks: string[], to: PracticeLevel = "independent") {
  for (const t of tasks) {
    for (;;) {
      const view = await practiceModule(actor, practiceAm);
      const task = view.tasks.find((x) => x.taskId === t)!;
      if (task.level === to || !task.next) break;
      await markTask(actor, practiceAm, t, { level: task.next, note: null, photoAssetIds: [] });
    }
  }
}

async function statusOf(u: { actor: Actor }, amId: string) {
  return (await myLearning(u.actor)).current!.modules.find((m) => m.id === amId)!.status;
}

describe("FG-5 pratik eğitim", () => {
  it("FG-5.2 seviyeler sırayla çıkar; atlama ve gerekçesiz düşürme reddedilir; işaretleme değiştirilemez", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const tr = p.trainerPres.actor;
    const [t1] = s.tasks;
    await expect(markTask(tr, s.practiceAm, t1!, { level: "supervised", note: null, photoAssetIds: [] })).rejects.toMatchObject({ code: "practice_level_skip" });
    await markTask(tr, s.practiceAm, t1!, { level: "demonstrated", note: "Usta gösterdi", photoAssetIds: [] });
    await markTask(tr, s.practiceAm, t1!, { level: "supervised", note: null, photoAssetIds: [] });
    await expect(markTask(tr, s.practiceAm, t1!, { level: "demonstrated", note: null, photoAssetIds: [] })).rejects.toMatchObject({ code: "practice_reason_required" });
    await markTask(tr, s.practiceAm, t1!, { level: "demonstrated", note: "Kalıbı ters taktı", photoAssetIds: [] });

    const view = await practiceModule(s.u.actor, s.practiceAm);
    const task = view.tasks.find((t) => t.taskId === t1)!;
    expect(task).toMatchObject({ level: "demonstrated", next: "supervised" });
    expect(task.history.map((h) => [h.level, h.direction])).toEqual([
      ["demonstrated", "down"],
      ["supervised", "up"],
      ["demonstrated", "up"],
    ]);
    expect(view.canMark).toBe(false);
    expect(await statusOf(s.u, s.practiceAm)).toBe("in_progress");

    const err = await db().update(practiceMarks).set({ note: "değişti" }).where(eq(practiceMarks.practiceTaskId, t1!)).then(() => null, (e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);
  });

  it("karar #66: atanmış eğitmen ve kapsamdaki bölüm sorumlusu işaretler; başka eğitmen, kapsam dışı sorumlu, İK ve kursiyer işaretleyemez", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const t = s.tasks[0]!;
    const mark = (a: Actor) => markTask(a, s.practiceAm, t, { level: "demonstrated", note: null, photoAssetIds: [] });
    await expect(mark(p.trainerKalite.actor)).rejects.toMatchObject({ code: "forbidden" });
    await expect(mark(p.smKalite.actor)).rejects.toMatchObject({ code: "forbidden" });
    await expect(mark(p.hr.actor)).rejects.toMatchObject({ code: "forbidden" });
    await expect(mark(s.u.actor)).rejects.toMatchObject({ code: "forbidden" });
    await mark(p.smUretim.actor);
    // Görme: İK okur, başka eğitmen göremez
    expect((await practiceModule(p.hr.actor, s.practiceAm)).tasks).toHaveLength(3);
    await expect(practiceModule(p.trainerKalite.actor, s.practiceAm)).rejects.toMatchObject({ code: "not_found" });
    expect((await myPractice(s.u.actor))[0]!.tasks[0]!.level).toBe("demonstrated");
    const overview = await evaluatorOverview(p.trainerPres.actor);
    expect(overview.find((o) => o.assignmentId === s.assignmentId)?.practice[0]).toMatchObject({ independent: 0, total: 3 });
    expect(await evaluatorOverview(p.trainerKalite.actor)).toEqual([]);
  });

  it("FG-5.3 bütün görevler tek başına yapar olunca pratik modül tamamlanır ve pratik sınav açılır", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    expect(await statusOf(s.u, s.examAm)).toBe("locked");
    await markAll(p.trainerPres.actor, s.practiceAm, s.tasks.slice(0, 2));
    expect(await statusOf(s.u, s.practiceAm)).toBe("in_progress");
    await markAll(p.trainerPres.actor, s.practiceAm, s.tasks.slice(2));
    expect(await statusOf(s.u, s.practiceAm)).toBe("completed");
    expect(await statusOf(s.u, s.examAm)).toBe("available");
    await expect(markTask(p.trainerPres.actor, s.practiceAm, s.tasks[0]!, { level: "supervised", note: "tekrar", photoAssetIds: [] })).rejects.toMatchObject({
      code: "practice_module_closed",
    });
  });
});

describe("FG-6.2 pratik sınav", () => {
  it("taslak → kursiyer ve eğitmen imzası → bölüm sorumlusu 2. imzası; geçince modül tamamlanır; imzalı form değişmez", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    await markAll(p.trainerPres.actor, s.practiceAm, s.tasks);
    await expect(startPracticalExam(s.u.actor, s.examAm)).rejects.toMatchObject({ code: "forbidden" });
    const { id } = await startPracticalExam(p.trainerPres.actor, s.examAm);
    expect((await startPracticalExam(p.trainerPres.actor, s.examAm)).id).toBe(id);

    const pass = s.tasks.map((taskId) => ({ taskId, result: "pass" as const, note: null }));
    await savePracticalDraft(p.trainerPres.actor, id, { criteria: [{ taskId: s.tasks[0]!, result: "pass", note: "Temiz" }], note: null, photoAssetIds: [] });
    expect((await getPracticalExam(p.trainerPres.actor, id)).criteria[0]).toMatchObject({ result: "pass", note: "Temiz" });
    expect((await getPracticalExam(p.trainerPres.actor, id)).can).toMatchObject({ edit: true, sign: true });
    await expect(
      signPracticalExam(p.trainerPres.actor, id, { criteria: [], note: null, photoAssetIds: [], traineeSignature: testSignaturePng(1), trainerSignature: testSignaturePng(2), ...META }),
    ).rejects.toMatchObject({ code: "practical_incomplete" });
    await expect(
      signPracticalExam(p.trainerPres.actor, id, { criteria: pass, note: null, photoAssetIds: [], traineeSignature: "data:image/png;base64,AAAA", trainerSignature: testSignaturePng(2), ...META }),
    ).rejects.toMatchObject({ code: "signature_invalid" });
    await signPracticalExam(p.trainerPres.actor, id, { criteria: pass, note: "Başarılı", photoAssetIds: [], traineeSignature: testSignaturePng(1), trainerSignature: testSignaturePng(2), ...META });

    const view = await getPracticalExam(p.smUretim.actor, id);
    expect(view).toMatchObject({ status: "awaiting_second_signature", score: 100, passed: true, can: { secondSign: true, edit: false } });
    expect(view.signatures.map((x) => x.role)).toEqual(["trainee", "trainer"]);
    expect((await secondSignatureQueue(p.smUretim.actor)).map((x) => x.id)).toEqual([id]);
    expect(await secondSignatureQueue(p.smKalite.actor)).toEqual([]);

    // 1. imzadan sonra kriterler değişmez
    const err = await db().update(practicalExamResults).set({ score: 10 }).where(eq(practicalExamResults.id, id)).then(() => null, (e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);
    // Eğitmen ve kapsam dışı sorumlu 2. imzayı atamaz
    await expect(secondSignPracticalExam(p.trainerPres.actor, id, { signature: testSignaturePng(3), ...META })).rejects.toMatchObject({ code: "forbidden" });
    await expect(secondSignPracticalExam(p.smKalite.actor, id, { signature: testSignaturePng(3), ...META })).rejects.toMatchObject({ code: "forbidden" });
    await secondSignPracticalExam(p.smUretim.actor, id, { signature: testSignaturePng(3), ...META });

    expect(await statusOf(s.u, s.examAm)).toBe("completed");
    expect((await myLearning(s.u.actor)).current!.status).toBe("awaiting_readiness");
    const final = await getPracticalExam(s.u.actor, id);
    expect(final).toMatchObject({ status: "final", passed: true, can: { edit: false, sign: false, secondSign: false } });
    const sigs = await db().select().from(signatures).where(eq(signatures.subjectId, id));
    expect(sigs).toHaveLength(3);
    expect(new Set(sigs.map((x) => x.subjectHash)).size).toBe(1);
    expect(sigs.find((x) => x.role === "trainee")).toMatchObject({ signerUserId: s.u.userId, capturedBy: p.trainerPres.userId, ip: "10.0.0.9" });

    // İmza görseli: kursiyer ve İK görür, ilgisiz kişi göremez
    const image = final.signatures[0]!.imageAssetId;
    expect(await getAssetForViewer(s.u.actor, image)).not.toBeNull();
    expect(await getAssetForViewer(p.hr.actor, image)).not.toBeNull();
    expect(await getAssetForViewer((await createTestUser({})).actor, image)).toBeNull();

    const locked = await db().update(practicalExamResults).set({ returnReason: "x" }).where(eq(practicalExamResults.id, id)).then(() => null, (e: unknown) => e);
    expect(isImmutableViolation(locked)).toBe(true);
  });

  it("karar #72: kalınca yapamadığı görevler gözetiminde yapara düşer, pratik modül tekrar açılır; haklar bitince atama karar bekler", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const tr = p.trainerPres.actor;
    const [critical, second, third] = s.tasks as [string, string, string];
    const run = async (failTask: string) => {
      await markAll(tr, s.practiceAm, s.tasks);
      const { id } = await startPracticalExam(tr, s.examAm);
      const criteria = s.tasks.map((taskId) => ({ taskId, result: taskId === failTask ? ("fail" as const) : ("pass" as const), note: null }));
      await signPracticalExam(tr, id, { criteria, note: null, photoAssetIds: [], traineeSignature: testSignaturePng(4), trainerSignature: testSignaturePng(5), ...META });
      await secondSignPracticalExam(p.smUretim.actor, id, { signature: testSignaturePng(6), ...META });
      return id;
    };

    // 1. deneme: kritik görev yapamadı → 67 puan, kritik nedeniyle kalır
    const first = await run(critical);
    expect(await getPracticalExam(tr, first)).toMatchObject({ score: 67, passed: false, failReason: "critical" });
    const view = await practiceModule(tr, s.practiceAm);
    expect(view.status).toBe("review_required");
    expect(view.tasks.find((t) => t.taskId === critical)).toMatchObject({ level: "supervised" });
    expect(view.tasks.find((t) => t.taskId === critical)!.history[0]).toMatchObject({ source: "exam_fail", direction: "down" });
    expect(view.tasks.find((t) => t.taskId === second)!.level).toBe("independent");
    expect(await statusOf(s.u, s.examAm)).toBe("locked");
    expect(await practicalExamInfo(tr, s.examAm)).toMatchObject({ used: 1, left: 1, block: "locked" });

    // Görev yeniden tek başına yapar olunca sınav açılır; 2. deneme (puan 67 < 80) de kalırsa haklar biter
    await run(third);
    expect((await myLearning(s.u.actor)).current!.status).toBe("awaiting_decision");
    expect(await practicalExamInfo(tr, s.examAm)).toMatchObject({ used: 2, left: 0 });
  });

  it("karar #71: bölüm sorumlusu gerekçeyle geri gönderir; deneme hak saymaz, yeni form açılır; kursiyer kendi değerlendirmesini yapamaz", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    await markAll(p.trainerPres.actor, s.practiceAm, s.tasks);
    const { id } = await startPracticalExam(p.trainerPres.actor, s.examAm);
    const pass = s.tasks.map((taskId) => ({ taskId, result: "pass" as const, note: null }));
    await signPracticalExam(p.trainerPres.actor, id, { criteria: pass, note: null, photoAssetIds: [], traineeSignature: testSignaturePng(7), trainerSignature: testSignaturePng(8), ...META });
    await expect(returnPracticalExam(p.smUretim.actor, id, "")).rejects.toMatchObject({ code: "reject_comment_required" });
    await returnPracticalExam(p.smUretim.actor, id, "Fotoğraf eksik, yeniden değerlendirin");
    expect(await getPracticalExam(p.trainerPres.actor, id)).toMatchObject({ status: "returned", returnReason: "Fotoğraf eksik, yeniden değerlendirin" });
    expect(await practicalExamInfo(p.trainerPres.actor, s.examAm)).toMatchObject({ used: 0, left: 2, block: null, open: null });
    const next = await startPracticalExam(p.trainerPres.actor, s.examAm);
    expect(next.id).not.toBe(id);
    expect((await getPracticalExam(p.trainerPres.actor, next.id)).attemptNo).toBe(2);

    // Bölüm sorumlusu kendi değerlendirdiği formu 2. imzalayamaz
    const own = await owner()`select count(*)::int as n from practical_exam_results where evaluator_id = ${p.smUretim.userId}`;
    expect(own[0]!.n).toBe(0);
  });
});
