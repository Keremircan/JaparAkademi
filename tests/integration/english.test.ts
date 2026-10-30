import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { contents, emailOutbox, personnel, questionVersions } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { systemActor } from "@/server/authz/actor";
import { myLearning } from "@/server/services/assignments";
import { acknowledgeItem, learnModule, reportReachedEnd } from "@/server/services/assignments/learner";
import { signIn, setPreferredLocale, type SessionUser } from "@/server/services/auth";
import { createContent, getVersion, saveDraft, submitForApproval } from "@/server/services/content";
import { answerExam, getAttempt, startExam, submitExam } from "@/server/services/exams";
import { createModule, setModuleContents } from "@/server/services/modules";
import { notify } from "@/server/services/notifications";
import { createQuestion, getQuestion, type QuestionInput } from "@/server/services/questions";
import { commitQuestionImport } from "@/server/services/questions/import";
import { QUESTION_HEADERS } from "@/server/services/questions/parse";
import { DEFAULT_EMAIL_EVENTS } from "@/server/state/notifications";
import { owner } from "../support/db";
import { seedContentPeople, textBody } from "../support/content";
import { choice } from "../support/exam";
import { createTestUser, meta, TEST_PASSWORD } from "../support/factories";
import { moduleInput, publishCard, publishedText } from "../support/training";

type People = Awaited<ReturnType<typeof seedContentPeople>>;

const setLocale = (userId: string, locale: "tr" | "en") => owner()`update personnel set locale = ${locale} where user_id = ${userId}`;

/** Türkçe + İngilizce metin içeriği (bölüm sorumlusu kendi kapsamında: kendi onayıyla yayınlanır). */
async function bilingualText(p: People, title: string, enTitle: string) {
  const sm = p.smUretim.actor;
  const { id } = await createContent(sm, { type: "text", title, ownerOrgUnitId: p.org.units.pres, commonTarget: null, isOhs: false });
  await saveDraft(sm, id, { title, body: textBody(`${title} metni`), tagIds: [], en: { title: enTitle, body: textBody(`${enTitle} text`) } });
  await submitForApproval(sm, id, { changeNote: null, requireReread: false });
  return id;
}

const question = (moduleId: string, stem: string, extra: Partial<QuestionInput> = {}): QuestionInput => ({
  type: "single_choice",
  stem,
  options: ["Kumandada", "Kalıpta", "Cepte"],
  correctIndex: 0,
  explanation: null,
  topic: "Pres",
  difficulty: 1,
  isOhsCritical: false,
  mediaAssetId: null,
  moduleIds: [moduleId],
  ...extra,
});
const EN = { stem: "Where should your hands be?", options: ["On the control", "In the die", "In your pockets"] };

/** Teorik modül (iki dilli + yalnızca Türkçe içerik) + 2 soruluk sınav. */
async function setup(p: People) {
  const sm = p.smUretim.actor;
  const both = await bilingualText(p, "Pres güvenliği", "Press safety");
  const trOnly = await publishedText(sm, p.org.units.pres, "Pres bakımı", "Yağlama");
  const theory = (await createModule(sm, moduleInput(p.org.units.pres, "theory", "Pres teorisi"))).id;
  await setModuleContents(sm, theory, [both, trOnly]);
  const exam = (await createModule(sm, moduleInput(p.org.units.pres, "theory_exam", "Pres sınavı"))).id;
  await createQuestion(sm, { ...question(theory, "Eller nerede olmalı? 1", { en: EN }), ownerOrgUnitId: p.org.units.pres, isOhs: false });
  await createQuestion(sm, { ...question(theory, "Eller nerede olmalı? 2"), ownerOrgUnitId: p.org.units.pres, isOhs: false });
  const { cardModuleId } = await publishCard(p, p.org.positions.presOp, [theory, exam], sm, {
    [exam]: { questionCount: 2, passScore: 100, maxAttempts: 2, cooldownHours: 0, durationMin: 10, proctorRequired: false },
  });
  return { both, theory, exam, cardModuleId };
}

/** Kursiyer kart ve teorik modülü bitirir; teorik modülün görünümü döner. */
async function trainee(p: People, s: Awaited<ReturnType<typeof setup>>, locale: "tr" | "en") {
  const u = await createTestUser({ positionId: p.org.positions.presOp, trainingRequired: true });
  await setLocale(u.userId, locale);
  const views = [];
  for (const moduleId of [s.cardModuleId, s.theory]) {
    const cur = (await myLearning(u.actor)).current!;
    const view = await learnModule(u.actor, cur.modules.find((m) => m.moduleId === moduleId)!.id);
    views.push(view);
    for (const item of view.items) {
      await reportReachedEnd(u.actor, item.id);
      await acknowledgeItem(u.actor, item.id);
    }
  }
  const cur = (await myLearning(u.actor)).current!;
  return { u, theoryView: views[1]!, examAm: cur.modules.find((m) => m.moduleId === s.exam)!.id };
}

describe("İngilizce (iş paketi 2.7b, karar #207)", () => {
  it("dil tercihi hesapta saklanır ve girişte döner; geçersiz dil veritabanında reddedilir", async () => {
    const u = await createTestUser();
    expect(await signIn({ sicilNo: u.sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta())).toMatchObject({ ok: true, locale: "tr" });
    const session = { userId: u.userId, roles: u.actor.roles, baseRoles: u.actor.roles } as SessionUser;
    await setPreferredLocale(session, "en");
    expect(await signIn({ sicilNo: u.sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta({ ip: "10.0.0.9" }))).toMatchObject({
      ok: true,
      locale: "en",
    });
    await expect(owner()`update personnel set locale = 'de' where user_id = ${u.userId}`).rejects.toThrow();
  });

  it("FG-8.2 içerikte TR zorunlu, EN isteğe bağlı; eksik İngilizce onaya gönderilemez, iki dil aynı sürümle yayınlanır", async () => {
    const p = await seedContentPeople();
    const sm = p.smUretim.actor;
    const { id } = await createContent(sm, { type: "text", title: "Kalıp değişimi", ownerOrgUnitId: p.org.units.pres, commonTarget: null, isOhs: false });
    await saveDraft(sm, id, { title: "Kalıp değişimi", body: textBody("Adımlar"), tagIds: [], en: { title: "Die change", body: {} } });
    await expect(submitForApproval(sm, id, { changeNote: null, requireReread: false })).rejects.toMatchObject({ code: "body_incomplete_en" });
    // İngilizce verilmezse dokunulmaz; null kaldırır
    await saveDraft(sm, id, { title: "Kalıp değişimi", body: textBody("Adımlar"), tagIds: [] });
    await expect(submitForApproval(sm, id, { changeNote: null, requireReread: false })).rejects.toMatchObject({ code: "body_incomplete_en" });
    await saveDraft(sm, id, { title: "Kalıp değişimi", body: textBody("Adımlar"), tagIds: [], en: null });
    expect((await submitForApproval(sm, id, { changeNote: null, requireReread: false })).status).toBe("published");

    const both = await bilingualText(p, "Pres güvenliği", "Press safety");
    const [c] = await db().select({ versionId: contents.currentPublishedVersionId }).from(contents).where(eq(contents.id, both));
    expect(await getVersion(sm, c!.versionId!)).toMatchObject({ title: "Pres güvenliği", en: { title: "Press safety" } });
  });

  it("kursiyer içeriği ve sınav sorusunu kendi dilinde görür; İngilizcesi olmayan Türkçe gösterilir; doğru cevap aynıdır", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const en = await trainee(p, s, "en");
    expect(en.theoryView.items.map((i) => [i.title, i.locale])).toEqual([
      ["Press safety", "en"],
      ["Pres bakımı", "tr"],
    ]);
    const tr = await trainee(p, s, "tr");
    expect(tr.theoryView.items.map((i) => i.title)).toEqual(["Pres güvenliği", "Pres bakımı"]);

    const { attemptId } = await startExam(en.u.actor, en.examAm, { code: null, ip: null, userAgent: null });
    const view = await getAttempt(en.u.actor, attemptId);
    if (view.state !== "open") throw new Error("açık deneme bekleniyordu");
    expect(view.questions.find((q) => q.locale === "en")).toMatchObject({ type: "choice", stem: EN.stem });
    expect(view.questions.find((q) => q.locale === "tr")?.stem).toBe("Eller nerede olmalı? 2");
    for (const q of view.questions) {
      if (q.type !== "choice") continue;
      const correct = q.locale === "en" ? "On the control" : "Kumandada";
      await answerExam(en.u.actor, attemptId, q.itemId, choice(q.options.indexOf(correct)));
    }
    await submitExam(en.u.actor, attemptId);
    expect(await getAttempt(en.u.actor, attemptId)).toMatchObject({ state: "submitted", passed: true, score: 100 });
  });

  it("soru çevirisi Türkçeyle aynı şık sayısında ve tekil olmalı; boş çeviri yok sayılır; doğru/yanlışta yalnızca metin", async () => {
    const p = await seedContentPeople();
    const sm = p.smUretim.actor;
    const theory = (await createModule(sm, moduleInput(p.org.units.pres, "theory", "Pres teorisi"))).id;
    const target = { ownerOrgUnitId: p.org.units.pres, isOhs: false };
    await expect(createQuestion(sm, { ...question(theory, "Eller nerede olmalı?", { en: { stem: "Where are the hands?", options: ["A", "B"] } }), ...target })).rejects.toMatchObject({
      code: "question_translation_invalid",
    });
    await expect(
      createQuestion(sm, { ...question(theory, "Eller nerede olmalı?", { en: { stem: "Where are the hands?", options: ["Same", "same", "Other"] } }), ...target }),
    ).rejects.toMatchObject({ code: "question_translation_invalid" });
    const { id } = await createQuestion(sm, { ...question(theory, "Eller nerede olmalı?", { en: { stem: " ", options: ["", "", ""], explanation: "" } }), ...target });
    expect((await getQuestion(sm, id)).editable?.translations).toBeNull();
    const tf = await createQuestion(sm, {
      ...question(theory, "Pres arızalıyken çalışır.", {
        type: "true_false",
        options: ["Doğru", "Yanlış"],
        correctIndex: 1,
        en: { stem: "The press runs when faulty.", options: ["x", "y"] },
      }),
      ...target,
    });
    expect((await getQuestion(sm, tf.id)).editable?.translations).toEqual({ en: { stem: "The press runs when faulty.", explanation: null } });
  });

  it("Excel'den eşleştirme sorusu çiftleri ve İngilizce metniyle aktarılır", async () => {
    const p = await seedContentPeople();
    await createModule(p.smUretim.actor, moduleInput(p.org.units.pres, "theory", "Pres Teorisi"));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sorular");
    ws.addRow([...QUESTION_HEADERS]);
    ws.addRow([
      "İşaretleri eşleştirin.", "Eşleştirme", "Sarı = Dikkat", "Mavi = Zorunlu", "Kırmızı = Yasak", "", "", "", "", "İşaret", 1, "Hayır", "pres teorisi", "",
      "Match the signs.", "Yellow = Caution", "Blue = Mandatory", "Red = Prohibited", "", "", "", "",
    ]);
    const file = Buffer.from(await wb.xlsx.writeBuffer());
    expect(await commitQuestionImport(p.smUretim.actor, file, { ownerOrgUnitId: p.org.units.pres, isOhs: false })).toMatchObject({ created: 1, skipped: 0 });
    const [v] = await db().select().from(questionVersions).where(eq(questionVersions.stem, "İşaretleri eşleştirin.")).limit(1);
    expect(v).toMatchObject({
      type: "matching",
      pairs: [
        { left: "Sarı", right: "Dikkat" },
        { left: "Mavi", right: "Zorunlu" },
        { left: "Kırmızı", right: "Yasak" },
      ],
    });
    expect(v?.translations?.en?.pairs).toHaveLength(3);
  });

  it("bildirim e-postası alıcının dilinde; bağlantı İngilizce adrese gider", async () => {
    const tr = await createTestUser({ email: "tr-kisi@example.com" });
    const en = await createTestUser({ email: "en-kisi@example.com" });
    await setLocale(en.userId, "en");
    const kind = DEFAULT_EMAIL_EVENTS.includes("assignment_started") ? "assignment_started" : DEFAULT_EMAIL_EVENTS[0]!;
    await withActor(systemActor("test"), (tx) => notify(tx, { kind, userIds: [tr.userId, en.userId], subjectKey: `test:${tr.userId}`, link: "/learn" }));
    const mails = await db().select().from(emailOutbox).where(eq(emailOutbox.kind, kind));
    const trMail = mails.find((m) => m.toAddress === "tr-kisi@example.com")!;
    const enMail = mails.find((m) => m.toAddress === "en-kisi@example.com")!;
    expect(trMail.subject).toContain("JAPAR Akademi");
    expect(enMail.subject).toContain("JAPAR Academy");
    expect(enMail.bodyText).toMatch(/\/en\/learn/);
    expect(trMail.bodyText).not.toMatch(/\/en\//);
    const [row] = await db().select({ locale: personnel.locale }).from(personnel).where(eq(personnel.userId, en.userId));
    expect(row?.locale).toBe("en");
  });
});
