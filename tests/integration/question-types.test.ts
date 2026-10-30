import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { examAttemptItems, mediaAssets } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { isImmutableViolation } from "@/server/errors";
import type { HotspotRegion } from "@/lib/questions";
import { myLearning } from "@/server/services/assignments";
import { acknowledgeItem, learnModule, reportReachedEnd } from "@/server/services/assignments/learner";
import { answerExam, getAttempt, startExam, submitExam, type AttemptQuestion } from "@/server/services/exams";
import { createModule, setModuleContents } from "@/server/services/modules";
import { createQuestion, getQuestion, type QuestionInput } from "@/server/services/questions";
import { seedContentPeople } from "../support/content";
import { createTestUser } from "../support/factories";
import { moduleInput, publishCard, publishedText } from "../support/training";

type People = Awaited<ReturnType<typeof seedContentPeople>>;

const PAIRS = [
  { left: "Sarı üçgen", right: "Dikkat" },
  { left: "Mavi daire", right: "Zorunluluk" },
  { left: "Kırmızı daire", right: "Yasak" },
  { left: "Yeşil kare", right: "Acil çıkış" },
];
const REGIONS: HotspotRegion[] = [
  { shape: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
  { shape: "ellipse", cx: 0.7, cy: 0.7, rx: 0.1, ry: 0.15 },
];

const base = (moduleId: string, stem: string): Omit<QuestionInput, "type"> => ({
  stem,
  options: [],
  correctIndex: null,
  explanation: null,
  topic: "İşaretler",
  difficulty: 1,
  isOhsCritical: false,
  mediaAssetId: null,
  moduleIds: [moduleId],
});

async function imageAsset(userId: string) {
  const [asset] = await db()
    .insert(mediaAssets)
    .values({ kind: "image", status: "ready", objectKey: "media/hotspot.png", mime: "image/png", size: 10, originalName: "pano.png", createdBy: userId })
    .returning({ id: mediaAssets.id });
  return asset!.id;
}

/** Teorik modül + sınav (4 soru: 2 eşleştirme, 2 işaretleme; gözetmensiz). */
async function setup(p: People) {
  const sm = p.smUretim.actor;
  const c = await publishedText(sm, p.org.units.pres, "İşaretler", "metin");
  const theory = (await createModule(sm, moduleInput(p.org.units.pres, "theory", "İşaret teorisi"))).id;
  await setModuleContents(sm, theory, [c]);
  const exam = (await createModule(sm, moduleInput(p.org.units.pres, "theory_exam", "İşaret sınavı"))).id;
  const asset = await imageAsset(p.smUretim.userId);
  const owner = { ownerOrgUnitId: p.org.units.pres, isOhs: false };
  for (let i = 0; i < 2; i++) {
    await createQuestion(sm, { ...base(theory, `İşaretleri eşleştirin ${i}`), type: "matching", pairs: PAIRS, ...owner });
    await createQuestion(sm, { ...base(theory, `Acil durdurma butonunu işaretleyin ${i}`), type: "hotspot", mediaAssetId: asset, regions: REGIONS, ...owner });
  }
  const { cardModuleId } = await publishCard(p, p.org.positions.presOp, [theory, exam], sm, {
    [exam]: { questionCount: 4, passScore: 75, maxAttempts: 2, cooldownHours: 0, durationMin: 10, proctorRequired: false },
  });
  return { theory, exam, cardModuleId, asset };
}

async function trainee(p: People, s: Awaited<ReturnType<typeof setup>>) {
  const u = await createTestUser({ positionId: p.org.positions.presOp, trainingRequired: true });
  for (const moduleId of [s.cardModuleId, s.theory]) {
    const cur = (await myLearning(u.actor)).current!;
    const view = await learnModule(u.actor, cur.modules.find((m) => m.moduleId === moduleId)!.id);
    for (const item of view.items) {
      await reportReachedEnd(u.actor, item.id);
      await acknowledgeItem(u.actor, item.id);
    }
  }
  const cur = (await myLearning(u.actor)).current!;
  return { u, examAm: cur.modules.find((m) => m.moduleId === s.exam)!.id };
}

/** Eşleştirmenin doğru cevabı (gösterilen sağ sıraya göre). */
const correctPairs = (q: Extract<AttemptQuestion, { type: "matching" }>) => q.left.map((l) => q.right.indexOf(PAIRS.find((p) => p.left === l)!.right));

describe("İş paketi 2.7a: eşleştirme ve görselde işaretleme", () => {
  it("karar #203, #204: soru doğrulaması — çift sayısı, tekrar, görsel ve bölge zorunlu", async () => {
    const p = await seedContentPeople();
    const sm = p.smUretim.actor;
    const theory = (await createModule(sm, moduleInput(p.org.units.pres, "theory", "Doğrulama teorisi"))).id;
    const owner = { ownerOrgUnitId: p.org.units.pres, isOhs: false };
    const b = base(theory, "Doğrulama sorusu");
    await expect(createQuestion(sm, { ...b, type: "matching", pairs: PAIRS.slice(0, 2), ...owner })).rejects.toMatchObject({ code: "question_pairs_invalid" });
    await expect(
      createQuestion(sm, { ...b, type: "matching", pairs: [...PAIRS.slice(0, 3), { left: "sarı ÜÇGEN", right: "Başka" }], ...owner }),
    ).rejects.toMatchObject({ code: "question_pairs_invalid" });
    await expect(createQuestion(sm, { ...b, type: "hotspot", regions: REGIONS, ...owner })).rejects.toMatchObject({ code: "question_image_required" });
    const asset = await imageAsset(p.smUretim.userId);
    await expect(createQuestion(sm, { ...b, type: "hotspot", mediaAssetId: asset, regions: [], ...owner })).rejects.toMatchObject({ code: "question_regions_invalid" });
    await expect(
      createQuestion(sm, { ...b, type: "hotspot", mediaAssetId: asset, regions: [{ shape: "rect", x: 0.9, y: 0.1, w: 0.3, h: 0.2 }], ...owner }),
    ).rejects.toMatchObject({ code: "question_regions_invalid" });

    const { id } = await createQuestion(sm, { ...b, type: "matching", pairs: PAIRS, options: ["yok sayılır"], correctIndex: 2, ...owner });
    const detail = await getQuestion(sm, id);
    expect(detail.editable).toMatchObject({ type: "matching", pairs: PAIRS, options: [], correctIndex: null, regions: null });
  });

  it("karar #203–205: sınavda doğru cevap gönderilmez; tipine uygun cevap kaydedilir; puanlama ve değiştirilemezlik", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const { u, examAm } = await trainee(p, s);
    const { attemptId } = await startExam(u.actor, examAm, { code: null, ip: null, userAgent: null });
    const view = await getAttempt(u.actor, attemptId);
    if (view.state !== "open") throw new Error("açık deneme bekleniyordu");

    // Bölgeler ve eşleştirme sırası kursiyere gitmez
    const json = JSON.stringify(view);
    expect(json).not.toContain("regions");
    expect(json).not.toMatch(/"(cx|rx|shape)"/);
    const matching = view.questions.filter((q): q is Extract<AttemptQuestion, { type: "matching" }> => q.type === "matching");
    const hotspot = view.questions.filter((q): q is Extract<AttemptQuestion, { type: "hotspot" }> => q.type === "hotspot");
    expect(matching).toHaveLength(2);
    expect(hotspot).toHaveLength(2);
    expect([...matching[0]!.right].sort()).toEqual(PAIRS.map((x) => x.right).sort());
    expect(matching[0]!.answer).toEqual([null, null, null, null]);
    expect(hotspot[0]!.mediaAssetId).toBe(s.asset);

    // Tipine uymayan ya da aynı sağ öğeyi iki kez kullanan cevap reddedilir
    await expect(answerExam(u.actor, attemptId, matching[0]!.itemId, { kind: "choice", shownIndex: 0 })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(answerExam(u.actor, attemptId, matching[0]!.itemId, { kind: "matching", pairs: [0, 0, 1, 2] })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(answerExam(u.actor, attemptId, hotspot[0]!.itemId, { kind: "hotspot", point: { x: 1.5, y: 0.2 } })).rejects.toMatchObject({ code: "invalid_input" });

    // 1. eşleştirme doğru, 2. eşleştirmede iki çift yer değiştirmiş (kısmi puan yok → yanlış)
    await answerExam(u.actor, attemptId, matching[0]!.itemId, { kind: "matching", pairs: correctPairs(matching[0]!) });
    const wrong = correctPairs(matching[1]!);
    [wrong[0], wrong[1]] = [wrong[1]!, wrong[0]!];
    await answerExam(u.actor, attemptId, matching[1]!.itemId, { kind: "matching", pairs: wrong });
    // İşaretleme: biri dairenin içinde (doğru), diğeri bölge dışında (yanlış)
    await answerExam(u.actor, attemptId, hotspot[0]!.itemId, { kind: "hotspot", point: { x: 0.72, y: 0.8 } });
    await answerExam(u.actor, attemptId, hotspot[1]!.itemId, { kind: "hotspot", point: { x: 0.5, y: 0.5 } });

    // Kayıtlı cevap ekranda gösterilen sıraya geri çevrilir
    const reopened = await getAttempt(u.actor, attemptId);
    if (reopened.state !== "open") throw new Error("açık deneme bekleniyordu");
    const again = reopened.questions.find((q) => q.itemId === matching[0]!.itemId) as Extract<AttemptQuestion, { type: "matching" }>;
    expect(again.answer).toEqual(correctPairs(matching[0]!));
    expect((reopened.questions.find((q) => q.itemId === hotspot[0]!.itemId) as Extract<AttemptQuestion, { type: "hotspot" }>).answer).toEqual({ x: 0.72, y: 0.8 });

    await submitExam(u.actor, attemptId);
    const done = await getAttempt(u.actor, attemptId);
    expect(done).toMatchObject({ state: "submitted", score: 50, passed: false });
    const items = await db().select().from(examAttemptItems).where(eq(examAttemptItems.attemptId, attemptId));
    expect(items.filter((i) => i.isCorrect)).toHaveLength(2);

    // Teslimden sonra cevap değiştirilemez
    const err = await withActor(u.actor, (tx) => tx.update(examAttemptItems).set({ answer: { point: { x: 0.2, y: 0.2 } } }).where(eq(examAttemptItems.id, hotspot[1]!.itemId))).catch(
      (e: unknown) => e,
    );
    expect(isImmutableViolation(err)).toBe(true);
  });

  it("karar #204: bölge sınırı dahil; birden çok doğru bölgeden herhangi biri yeterli", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const { u, examAm } = await trainee(p, s);
    const { attemptId } = await startExam(u.actor, examAm, { code: null, ip: null, userAgent: null });
    const view = await getAttempt(u.actor, attemptId);
    if (view.state !== "open") throw new Error("açık deneme bekleniyordu");
    for (const q of view.questions) {
      if (q.type === "matching") await answerExam(u.actor, attemptId, q.itemId, { kind: "matching", pairs: correctPairs(q) });
    }
    const [h1, h2] = view.questions.filter((q) => q.type === "hotspot");
    await answerExam(u.actor, attemptId, h1!.itemId, { kind: "hotspot", point: { x: 0.3, y: 0.3 } }); // dikdörtgenin köşesi
    await answerExam(u.actor, attemptId, h2!.itemId, { kind: "hotspot", point: { x: 0.7, y: 0.55 } }); // elipsin üst sınırı
    await submitExam(u.actor, attemptId);
    expect(await getAttempt(u.actor, attemptId)).toMatchObject({ state: "submitted", score: 100, passed: true });
  });
});
