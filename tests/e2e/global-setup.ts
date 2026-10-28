import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { isNotNull } from "drizzle-orm";
import { systemActor } from "../../src/server/authz/actor";
import { closeDb, db } from "../../src/server/db/client";
import { legalTexts } from "../../src/server/db/schema";
import { createAccount } from "../../src/server/services/accounts";
import { createDraft, publishText } from "../../src/server/services/legal";
import { createOrgUnit, createPosition } from "../../src/server/services/org";
import { setSectionManagerScopes } from "../../src/server/services/roles";
import { createModule, saveTasks, setModuleContents } from "../../src/server/services/modules";
import { createContent, saveDraft, submitForApproval } from "../../src/server/services/content";
import { saveQuizQuestions } from "../../src/server/services/quiz";
import { createQuestion } from "../../src/server/services/questions";
import { myLearning, updateAssignment } from "../../src/server/services/assignments";
import { acknowledgeItem, learnModule, reportReachedEnd } from "../../src/server/services/assignments/learner";
import { approveCard, cardApprovalQueue, createCard, getEditableCard, saveCardSections, savePlan, submitCard } from "../../src/server/services/positions";
import { fullCardSections, textBody } from "../support/content";
import { buildPeopleXlsx } from "../support/xlsx";

/**
 * Her çalıştırmada benzersiz sicil numaralı test kullanıcıları ve küçük bir org ağacı oluşturur.
 * Yayınlanmış KVKK metni yoksa bir tane yayınlar (onay adımı her ortamda aynı olsun).
 */
export const E2E_PASSWORD = "E2e.Test-Sifre9";
export const E2E_NEW_PASSWORD = "Yeni.E2e-Sifre7";
export const E2E_IMPORT_FILE = path.join(process.cwd(), "test-results", "e2e-import.xlsx");

export default async function globalSetup() {
  const suffix = Date.now().toString(36).toUpperCase();
  process.env.E2E_SUFFIX = suffix;
  const sys = systemActor("e2e");

  const [published] = await db().select({ id: legalTexts.id }).from(legalTexts).where(isNotNull(legalTexts.publishedAt)).limit(1);
  if (!published) {
    const draft = await db().select({ id: legalTexts.id }).from(legalTexts).limit(1);
    const id = draft[0]?.id ?? (await createDraft(sys, { title: "E2E Aydınlatma Metni", body: "Uçtan uca test için aydınlatma metni. ".repeat(3) })).id;
    await publishText(sys, id);
  }

  const dept = await createOrgUnit(sys, { kind: "department", name: `E2E Departman ${suffix}`, code: `E2E-${suffix}` });
  await createPosition(sys, { orgUnitId: dept.id, name: "E2E Operatör", code: `E2E-OP-${suffix}`, collarType: "blue" });
  process.env.E2E_DEPARTMENT = `E2E Departman ${suffix}`;

  // İçerik akışı (1.2): bölüm, bu bölümde pozisyonu olan eğitmen, kapsamı bu departman olan bölüm sorumlusu, İSG uzmanı
  const section = await createOrgUnit(sys, { kind: "section", parentId: dept.id, name: "E2E Hat", code: `E2E-HAT-${suffix}` });
  const sectionPos = await createPosition(sys, { orgUnitId: section.id, name: "E2E Hat Ustası", code: `E2E-USTA-${suffix}`, collarType: "blue" });

  for (const project of ["mobile", "desktop"]) {
    const p = project[0];
    // İlk giriş akışı kullanıcısı (şifre değiştirme zorunlu)
    await createAccount(sys, {
      sicilNo: `E2E-${suffix}-${p}`,
      fullName: "Deneme Kullanıcı",
      password: E2E_PASSWORD,
      roles: ["trainer", "hr"],
      mustChangePassword: true,
    });
    // İK akışı kullanıcısı
    await createAccount(sys, {
      sicilNo: `E2E-${suffix}-HR${p}`,
      fullName: "Deneme İK",
      password: E2E_PASSWORD,
      roles: ["hr"],
      mustChangePassword: false,
    });
    // Güvenlik görevlisi (ziyaretçi ön kaydı, iş paketi 2.2)
    await createAccount(sys, {
      sicilNo: `E2E-${suffix}-SEC${p}`,
      fullName: "Deneme Güvenlik",
      password: E2E_PASSWORD,
      roles: ["security"],
      mustChangePassword: false,
    });
  }

  for (const project of ["mobile", "desktop"]) {
    const p = project[0];
    const trainerAccount = await createAccount(sys, { sicilNo: `E2E-${suffix}-TR${p}`, fullName: "Deneme Eğitmen", password: E2E_PASSWORD, roles: ["trainer"], positionId: sectionPos.id, mustChangePassword: false });
    const sm = await createAccount(sys, { sicilNo: `E2E-${suffix}-SM${p}`, fullName: "Deneme Bölüm Sorumlusu", password: E2E_PASSWORD, roles: ["section_manager"], mustChangePassword: false });
    await setSectionManagerScopes(sys, sm.userId, [dept.id]);
    // Kart ve plan akışı (1.3): taslak kart (bölümleri dolu) ve eklenecek pratik modül
    const smActor = { kind: "user" as const, userId: sm.userId, roles: ["personnel" as const, "section_manager" as const] };
    const cardPos = await createPosition(sys, { orgUnitId: section.id, name: `E2E Kart Pozisyonu ${p}`, code: `E2E-KART-${suffix}-${p}`.toUpperCase(), collarType: "blue" });
    await createCard(smActor, cardPos.id);
    await saveCardSections(smActor, cardPos.id, fullCardSections());
    const practice = await createModule(smActor, {
      kind: "practice", title: `E2E Pratik ${p}`, description: null, durationMin: 60, isOhs: false, remoteAllowed: true,
      validityMonths: null, ownerOrgUnitId: section.id, commonTarget: null, commonSortOrder: null,
    });
    await saveTasks(smActor, practice.id, [{ title: "Görev bir", description: null, isCritical: true }]);
    const ohs = await createAccount(sys, { sicilNo: `E2E-${suffix}-OHS${p}`, fullName: "Deneme İSG Uzmanı", password: E2E_PASSWORD, roles: ["ohs_specialist"], mustChangePassword: false });

    // Teorik eğitim akışı (1.4): yayında kart + teorik modül (ara değerlendirmeli) ve yeni giren kursiyer
    const ohsActor = { kind: "user" as const, userId: ohs.userId, roles: ["personnel" as const, "ohs_specialist" as const] };
    const learnPos = await createPosition(sys, { orgUnitId: section.id, name: `E2E Öğrenme Pozisyonu ${p}`, code: `E2E-OGR-${suffix}-${p}`.toUpperCase(), collarType: "blue" });
    const { id: contentId } = await createContent(smActor, { type: "text", title: `E2E Hat kuralları ${p}`, ownerOrgUnitId: section.id, commonTarget: null, isOhs: false });
    await saveDraft(smActor, contentId, { title: `E2E Hat kuralları ${p}`, body: textBody("Hatta çalışırken eldiven takılır."), tagIds: [] });
    await submitForApproval(smActor, contentId, { changeNote: null, requireReread: false });
    const theory = await createModule(smActor, {
      kind: "theory", title: `E2E Hat eğitimi ${p}`, description: null, durationMin: 30, isOhs: false, remoteAllowed: true,
      validityMonths: null, ownerOrgUnitId: section.id, commonTarget: null, commonSortOrder: null,
    });
    await setModuleContents(smActor, theory.id, [contentId]);
    await saveQuizQuestions(smActor, theory.id, [
      { type: "single_choice", stem: "Hatta ne takılır?", options: ["Eldiven", "Şapka", "Saat"], correctIndex: 0, explanation: "Eldiven zorunludur." },
      { type: "single_choice", stem: "Arızada kime haber verilir?", options: ["Bakım", "Muhasebe", "Kimseye"], correctIndex: 0, explanation: "Bakım ekibine haber verilir." },
      { type: "true_false", stem: "Işık perdesi köprülenebilir.", options: ["Doğru", "Yanlış"], correctIndex: 1, explanation: "Asla köprülenmez." },
    ]);
    await createCard(smActor, learnPos.id);
    await saveCardSections(smActor, learnPos.id, fullCardSections());
    const learnCard = await getEditableCard(smActor, learnPos.id);
    const learnCardModule = learnCard.plan.items.find((i) => i.isCardModule)!.moduleId;
    await savePlan(smActor, learnPos.id, {
      overrides: {},
      items: [
        { moduleId: learnCardModule, isRequired: true, prerequisiteModuleIds: [], settings: {} },
        { moduleId: theory.id, isRequired: true, prerequisiteModuleIds: [learnCardModule], settings: {} },
      ],
    });
    await submitCard(smActor, learnPos.id, { changeNote: null });
    const pendingCard = (await cardApprovalQueue(ohsActor)).find((q) => q.positionId === learnPos.id);
    if (pendingCard) await approveCard(ohsActor, pendingCard.versionId);
    await createAccount(sys, {
      sicilNo: `E2E-${suffix}-KUR${p}`, fullName: "Deneme Kursiyer", password: E2E_PASSWORD, mustChangePassword: false,
      positionId: learnPos.id, trainingRequired: true,
    });

    // Teorik sınav akışı (1.5): teorik modül + gözetmenli sınav; kursiyerin teorik adımları önceden tamamlanır
    const examPos = await createPosition(sys, { orgUnitId: section.id, name: `E2E Sınav Pozisyonu ${p}`, code: `E2E-SNV-${suffix}-${p}`.toUpperCase(), collarType: "blue" });
    const examTheory = await createModule(smActor, {
      kind: "theory", title: `E2E Sınav teorisi ${p}`, description: null, durationMin: 30, isOhs: false, remoteAllowed: true,
      validityMonths: null, ownerOrgUnitId: section.id, commonTarget: null, commonSortOrder: null,
    });
    await setModuleContents(smActor, examTheory.id, [contentId]);
    const examModule = await createModule(smActor, {
      kind: "theory_exam", title: `E2E Teorik sınav ${p}`, description: null, durationMin: 10, isOhs: false, remoteAllowed: true,
      validityMonths: null, ownerOrgUnitId: section.id, commonTarget: null, commonSortOrder: null,
    });
    for (let i = 1; i <= 4; i++) {
      await createQuestion(smActor, {
        type: "single_choice", stem: `E2E sınav sorusu ${i}`, options: ["Doğru cevap", `Yanlış cevap ${i}a`, `Yanlış cevap ${i}b`], correctIndex: 0,
        explanation: null, topic: i % 2 ? "Hat güvenliği" : "Kalite", difficulty: 1, isOhsCritical: false, mediaAssetId: null,
        moduleIds: [examTheory.id], ownerOrgUnitId: section.id, isOhs: false,
      });
    }
    await createCard(smActor, examPos.id);
    await saveCardSections(smActor, examPos.id, fullCardSections());
    const examCard = await getEditableCard(smActor, examPos.id);
    const examCardModule = examCard.plan.items.find((i) => i.isCardModule)!.moduleId;
    await savePlan(smActor, examPos.id, {
      overrides: {},
      items: [
        { moduleId: examCardModule, isRequired: true, prerequisiteModuleIds: [], settings: {} },
        { moduleId: examTheory.id, isRequired: true, prerequisiteModuleIds: [examCardModule], settings: {} },
        {
          moduleId: examModule.id, isRequired: true, prerequisiteModuleIds: [examTheory.id],
          settings: { questionCount: 4, durationMin: 10, passScore: 75, maxAttempts: 2, cooldownHours: 0, proctorRequired: true },
        },
      ],
    });
    await submitCard(smActor, examPos.id, { changeNote: null });
    const pendingExamCard = (await cardApprovalQueue(ohsActor)).find((q) => q.positionId === examPos.id);
    if (pendingExamCard) await approveCard(ohsActor, pendingExamCard.versionId);
    const examTrainee = await createAccount(sys, {
      sicilNo: `E2E-${suffix}-SNV${p}`, fullName: `Deneme Sınav Kursiyeri ${p}`, password: E2E_PASSWORD, mustChangePassword: false,
      positionId: examPos.id, trainingRequired: true,
    });
    const traineeActor = { kind: "user" as const, userId: examTrainee.userId, roles: ["personnel" as const] };
    // Sınavdan önceki tüm teorik modüller (ortak modüller dahil) sırayla tamamlanır
    const theoryModules = (await myLearning(traineeActor)).current!.modules.filter((m) => m.kind === "theory");
    for (const am of theoryModules) {
      for (const item of (await learnModule(traineeActor, am.id)).items) {
        await reportReachedEnd(traineeActor, item.id);
        await acknowledgeItem(traineeActor, item.id);
      }
    }

    // Pratik eğitim akışı (1.6): kart + pratik modül (2 görev) + pratik sınav; kartı tamam, eğitmeni atanmış kursiyer
    const pracPos = await createPosition(sys, { orgUnitId: section.id, name: `E2E Pratik Pozisyonu ${p}`, code: `E2E-PRA-${suffix}-${p}`.toUpperCase(), collarType: "blue" });
    const pracModule = await createModule(smActor, {
      kind: "practice", title: `E2E Hat pratiği ${p}`, description: null, durationMin: 60, isOhs: false, remoteAllowed: true,
      validityMonths: null, ownerOrgUnitId: section.id, commonTarget: null, commonSortOrder: null,
    });
    await saveTasks(smActor, pracModule.id, [
      { title: "E2E kalıp bağlama", description: null, isCritical: true },
      { title: "E2E ilk parça onayı", description: null, isCritical: false },
    ]);
    const pracExam = await createModule(smActor, {
      kind: "practice_exam", title: `E2E Pratik sınav ${p}`, description: null, durationMin: 60, isOhs: false, remoteAllowed: true,
      validityMonths: null, ownerOrgUnitId: section.id, commonTarget: null, commonSortOrder: null,
    });
    await createCard(smActor, pracPos.id);
    await saveCardSections(smActor, pracPos.id, fullCardSections());
    const pracCard = await getEditableCard(smActor, pracPos.id);
    const pracCardModule = pracCard.plan.items.find((i) => i.isCardModule)!.moduleId;
    await savePlan(smActor, pracPos.id, {
      overrides: {},
      items: [
        { moduleId: pracCardModule, isRequired: true, prerequisiteModuleIds: [], settings: {} },
        { moduleId: pracModule.id, isRequired: true, prerequisiteModuleIds: [pracCardModule], settings: {} },
        { moduleId: pracExam.id, isRequired: true, prerequisiteModuleIds: [pracModule.id], settings: {} },
      ],
    });
    await submitCard(smActor, pracPos.id, { changeNote: null });
    const pendingPracCard = (await cardApprovalQueue(ohsActor)).find((q) => q.positionId === pracPos.id);
    if (pendingPracCard) await approveCard(ohsActor, pendingPracCard.versionId);
    const pracTrainee = await createAccount(sys, {
      sicilNo: `E2E-${suffix}-PRA${p}`, fullName: `Deneme Pratik Kursiyeri ${p}`, password: E2E_PASSWORD, mustChangePassword: false,
      positionId: pracPos.id, trainingRequired: true,
    });
    const pracActor = { kind: "user" as const, userId: pracTrainee.userId, roles: ["personnel" as const] };
    for (const am of (await myLearning(pracActor)).current!.modules.filter((m) => m.kind === "theory")) {
      for (const item of (await learnModule(pracActor, am.id)).items) {
        await reportReachedEnd(pracActor, item.id);
        await acknowledgeItem(pracActor, item.id);
      }
    }
    const hrAccount = await createAccount(sys, { sicilNo: `E2E-${suffix}-HRP${p}`, fullName: "Deneme İK Atama", password: E2E_PASSWORD, roles: ["hr"], mustChangePassword: false });
    const hrActor = { kind: "user" as const, userId: hrAccount.userId, roles: ["personnel" as const, "hr" as const] };
    await updateAssignment(hrActor, (await myLearning(pracActor)).current!.id, { trainerUserId: trainerAccount.userId, targetDate: null });
  }

  await mkdir(path.dirname(E2E_IMPORT_FILE), { recursive: true });
  await writeFile(
    E2E_IMPORT_FILE,
    await buildPeopleXlsx([
      [`E2E-${suffix}-X1`, "Aktarılan Bir", `E2E Departman ${suffix}`, "E2E Operatör", "05.01.2026", "Mavi"],
      [`E2E-${suffix}-X2`, "Aktarılan İki", `e2e departman ${suffix.toLowerCase()}`, `E2E-OP-${suffix}`, "06.01.2026", "Mavi"],
      [`E2E-${suffix}-X3`, "Hatalı Satır", "Olmayan Departman", "Yok", "05.01.2026", "Mavi"],
    ]),
  );
  await closeDb();
}
