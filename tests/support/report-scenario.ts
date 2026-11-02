import { addDays, todayIn } from "@/lib/dates";
import { myLearning } from "@/server/services/assignments";
import { acknowledgeItem, learnModule, reportReachedEnd } from "@/server/services/assignments/learner";
import { answerExam, getAttempt, startExam, submitExam } from "@/server/services/exams";
import { createModule, setModuleContents } from "@/server/services/modules";
import { createQuestion } from "@/server/services/questions";
import type { seedContentPeople } from "./content";
import { choice, opts } from "./exam";
import { createTestUser } from "./factories";
import { moduleInput, publishCard, publishedText } from "./training";

/** Rapor testlerinin ortak senaryosu (raporlar ve yönetim özeti). */

export type People = Awaited<ReturnType<typeof seedContentPeople>>;
export type Trainee = Awaited<ReturnType<typeof createTestUser>>;

/** Pres: ortak İSG modülü (12 ay) + teorik modül + teorik sınav (4 soru, 2 hak). */
export async function setup(p: People) {
  const sm = p.smUretim.actor;
  const ohsContent = await publishedText(p.ohs.actor, null, "Genel İSG", "metin", true);
  const isg = (await createModule(p.ohs.actor, moduleInput(null, "theory", "Genel İSG eğitimi", { isOhs: true, validityMonths: 12, durationMin: 480 }))).id;
  await setModuleContents(p.ohs.actor, isg, [ohsContent]);
  const c = await publishedText(sm, p.org.units.pres, "Pres temelleri", "metin");
  const theory = (await createModule(sm, moduleInput(p.org.units.pres, "theory", "Pres teorisi"))).id;
  await setModuleContents(sm, theory, [c]);
  const exam = (await createModule(sm, moduleInput(p.org.units.pres, "theory_exam", "Pres sınavı"))).id;
  for (let i = 0; i < 4; i++) {
    await createQuestion(sm, {
      type: "single_choice", stem: `Pres sınav sorusu ${i}`, options: ["Doğru şık", "Yanlış bir", "Yanlış iki"], correctIndex: 0, explanation: null,
      topic: "Pres", difficulty: 1, isOhsCritical: false, mediaAssetId: null, moduleIds: [theory], ownerOrgUnitId: p.org.units.pres, isOhs: false,
    });
  }
  const { cardModuleId } = await publishCard(p, p.org.positions.presOp, [theory, exam], sm, {
    [exam]: { questionCount: 4, passScore: 75, maxAttempts: 2, cooldownHours: 0, durationMin: 10, proctorRequired: false },
  });
  return { isg, theory, exam, cardModuleId };
}

export async function finish(u: Trainee, moduleId: string) {
  const am = (await myLearning(u.actor)).current!.modules.find((m) => m.moduleId === moduleId)!;
  for (const item of (await learnModule(u.actor, am.id)).items) {
    await reportReachedEnd(u.actor, item.id);
    await acknowledgeItem(u.actor, item.id);
  }
}

export async function takeExam(u: Trainee, examModuleId: string, pass: boolean) {
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

/** Kursiyer: 10 gün önce işe girdi; İSG + kart + teori; sınavda bir kalır, bir geçer (onay testte verilir). */
export async function scenario(p: People) {
  const s = await setup(p);
  const today = todayIn("Europe/Istanbul");
  const u = await createTestUser({ positionId: p.org.positions.presOp, trainingRequired: true, hireDate: addDays(today, -10) });
  await finish(u, s.isg);
  await finish(u, s.cardModuleId);
  await finish(u, s.theory);
  await takeExam(u, s.exam, false);
  await finish(u, s.theory);
  await takeExam(u, s.exam, true);
  const a = (await myLearning(u.actor)).current!;
  return { s, u, a };
}
