import { and, asc, desc, eq, gte, inArray, isNull, notInArray, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { addDays, todayIn } from "@/lib/dates";
import { TRUE_FALSE_OPTIONS, type HotspotRegion } from "@/lib/questions";
import type { UserActor } from "@/server/authz/actor";
import { effectiveRoles, type Role } from "@/server/authz/roles";
import { db } from "@/server/db/client";
import {
  assignmentModules,
  assignments,
  classroomSessions,
  contentVersions,
  examAttemptItems,
  legalTexts,
  mediaAssets,
  modules,
  orgUnits,
  personnel,
  positionCardVersions,
  positions,
  practicalExamResults,
  questions as questionsTable,
  questionVersions,
  quizQuestions,
  sampleRecords,
  userRoles,
  visitorBriefings,
  visitQuizAttempts,
  visits,
} from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { myLearning, updateAssignment, startAssignment } from "@/server/services/assignments";
import { acknowledgeItem, answerQuiz, learnModule, reportReachedEnd, reportVideoProgress } from "@/server/services/assignments/learner";
import { commitPriorImport, previewPriorImport, recordPriorTrainings, startPeriodicTraining } from "@/server/services/assignments/periodic";
import { approveClassroomSession, createClassroomSession, submitClassroomSession } from "@/server/services/classroom";
import { createCompetency, grantCompetency } from "@/server/services/competencies";
import { approveVersion, createContent, createTag, listTags, saveDraft, startNewVersion, submitForApproval } from "@/server/services/content";
import { registerDevice } from "@/server/services/devices";
import { answerExam, startExam, submitExam } from "@/server/services/exams";
import { issueProctorCode } from "@/server/services/exams/proctor";
import { commitImport, validateImport } from "@/server/services/imports";
import { createDraft, currentText } from "@/server/services/legal";
import { completeUpload, startUpload } from "@/server/services/media";
import { ffmpegAvailable, processMediaAsset } from "@/server/services/media/process";
import { createModule, saveTasks, setModuleContents } from "@/server/services/modules";
import { createPerson } from "@/server/services/people";
import { approveCard, createCard, getEditableCard, saveCardSections, savePlan, startNewCardVersion, submitCard } from "@/server/services/positions";
import { markTask, secondSignPracticalExam, signPracticalExam, startPracticalExam } from "@/server/services/practice";
import { decideExplicitConsent, setProfilePhoto } from "@/server/services/profile";
import { approveQuestionVersion, createQuestion, updateQuestion, type QuestionInput } from "@/server/services/questions";
import { commitQuestionImport } from "@/server/services/questions/import";
import { saveQuizQuestions } from "@/server/services/quiz";
import { approveReadiness } from "@/server/services/readiness";
import { setRoles, setSectionManagerScopes } from "@/server/services/roles";
import { chooseWorkSchedule, saveMyScheduleCopy, saveWorkSchedule } from "@/server/services/schedules";
import { getSetting, getSettings, setSetting } from "@/server/services/settings";
import { createBriefingDraft, currentBriefing, publishBriefing, saveBriefingDraft } from "@/server/services/visitors/briefings";
import { addToBlacklist } from "@/server/services/visitors/blacklist";
import { createCompany } from "@/server/services/visitors/companies";
import { endRollcall, insideNow, setSafe, startRollcall } from "@/server/services/visitors/evacuation";
import { completeBriefing, drawQuiz, startBriefing, submitQuiz } from "@/server/services/visitors/flow";
import { checkIn, checkOut } from "@/server/services/visitors/gate";
import { issueVisitSession } from "@/server/services/visitors/session";
import { createVisit } from "@/server/services/visitors/visits";
import { uploadBuffer } from "@/server/storage/client";
import { runQuietly } from "./context";
import { CARD_V2, cardSections } from "./data/card";
import { sampleContents, type ContentKey } from "./data/contents";
import { IMPORT_ROWS, QUESTION_REVISION, QUESTIONS, QUIZ, type ModuleKey, type QuestionSpec } from "./data/questions";
import {
  BLACKLIST,
  BRIEFING,
  CLASSROOM,
  COMPANY,
  COMPETENCIES,
  DEVICE_NAME,
  EXAM_SETTINGS,
  MANUAL_GRANT,
  MODULE_CONTENTS,
  MODULES,
  PEOPLE,
  PPE_ITEM,
  PRACTICAL_EXAM,
  PRACTICAL_SETTINGS,
  PRACTICE_NOTES,
  PRACTICE_TASKS,
  PRIOR,
  PROCTOR_LOCATION,
  READINESS_COMMENT,
  SAMPLE_POSITION_CODE,
  SIGNATORY,
  VIDEO_SLIDES,
  VISITOR,
  VISITOR_RULES,
  WORK_SCHEDULE,
  type CompetencyKey,
  type PersonKey,
} from "./data/records";
import * as media from "./media";
import * as pdfs from "./pdfs";

/**
 * Örnek veri yükleyici (karar #296). Bütün kayıtlar ekranların kullandığı servis fonksiyonlarıyla oluşturulur
 * (yetki, durum makinesi, denetim kaydı aynen işler). Her kök kayıt `sample_records`'a yazılır; temizleme
 * (`purge.ts`) bunları ve bağlı kayıtları siler. Bütün işlem sessiz kipte çalışır (karar #297): gerçek kişilere
 * bildirim, e-posta ya da push gitmez.
 */

export type LoadOptions = {
  ownerSicil: string;
  positionCode?: string;
  /** Yalnızca ön kontrol: hiçbir şey yazılmaz. */
  check?: boolean;
  /** Medya işleme için worker'ı bekleme süresi (sn); sonra yükleyici kendisi işler. */
  mediaWaitSec?: number;
  log?: (line: string) => void;
};

export type Preflight = {
  ok: boolean;
  problems: string[];
  notes: string[];
};

export type LoadReport = Preflight & { created: Record<string, number> };

const META = { ip: null, userAgent: "JAPAR Akademi örnek veri yükleyici" };

type Ctx = {
  log: (s: string) => void;
  notes: string[];
  created: Record<string, number>;
  tz: string;
  today: string;
  start: Date;
};

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

async function record(ctx: Ctx, table: string, id: string) {
  await db().insert(sampleRecords).values({ tableName: table, recordId: id }).onConflictDoNothing();
  ctx.created[table] = (ctx.created[table] ?? 0) + 1;
}

function userActor(userId: string, base: readonly Role[]): UserActor {
  return { kind: "user", userId, roles: effectiveRoles(base), baseRoles: [...base] };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function monthsAgo(today: string, months: number): string {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1 - months, 1));
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(d, last));
  return date.toISOString().slice(0, 10);
}

function regionCenter(r: HotspotRegion) {
  return r.shape === "rect" ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : { x: r.cx, y: r.cy };
}

async function xlsx(rows: (string | number | Date | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sayfa1");
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// Medya
// ---------------------------------------------------------------------------

type Upload = { kind: "image" | "pdf" | "video"; mime: string; fileName: string; data: Buffer; purpose?: "profile_photo" };

async function upload(ctx: Ctx, actor: UserActor, u: Upload): Promise<string> {
  const plan = await startUpload(actor, { kind: u.kind, mime: u.mime, size: u.data.byteLength, fileName: u.fileName, purpose: u.purpose });
  await record(ctx, "media_assets", plan.assetId);
  if (plan.mode !== "single") throw new Error("Örnek dosya tek parça yüklenebilmeli");
  const [row] = await db().select({ key: mediaAssets.objectKey }).from(mediaAssets).where(eq(mediaAssets.id, plan.assetId));
  await uploadBuffer(row!.key, u.data, u.mime);
  await completeUpload(actor, { assetId: plan.assetId });
  return plan.assetId;
}

/** Worker işlerse bekler; işlemezse yükleyici kendisi işler. */
async function waitForMedia(ctx: Ctx, ids: string[], waitSec: number) {
  const deadline = Date.now() + waitSec * 1000;
  let inlineDone = false;
  for (;;) {
    const rows = await db().select({ id: mediaAssets.id, status: mediaAssets.status, error: mediaAssets.error }).from(mediaAssets).where(inArray(mediaAssets.id, ids));
    const failed = rows.find((r) => r.status === "failed");
    if (failed) throw new Error(`Medya işlenemedi (${failed.id}): ${failed.error ?? ""}`);
    const pending = rows.filter((r) => r.status !== "ready");
    if (pending.length === 0) return;
    if (Date.now() >= deadline && !inlineDone) {
      ctx.log(`Medya: ${pending.length} dosyayı yükleyici işliyor…`);
      for (const r of pending.filter((p) => p.status === "uploaded")) await processMediaAsset(r.id);
      inlineDone = true;
      continue;
    }
    if (Date.now() >= deadline + 15 * 60_000) throw new Error("Medya işleme zaman aşımına uğradı");
    await sleep(1000);
  }
}

// ---------------------------------------------------------------------------
// Ön kontrol
// ---------------------------------------------------------------------------

async function ancestors(unitId: string) {
  const all = await db().select({ id: orgUnits.id, parentId: orgUnits.parentId, kind: orgUnits.kind, name: orgUnits.name }).from(orgUnits);
  const byId = new Map(all.map((u) => [u.id, u]));
  const chain = [];
  for (let u = byId.get(unitId); u; u = u.parentId ? byId.get(u.parentId) : undefined) chain.push(u);
  return chain;
}

async function preflight(opts: LoadOptions) {
  const problems: string[] = [];
  const notes: string[] = [];
  const code = opts.positionCode ?? SAMPLE_POSITION_CODE;

  const [already] = await db().select({ n: sql<number>`count(*)::int` }).from(sampleRecords);
  if ((already?.n ?? 0) > 0) problems.push("Örnek veri zaten yüklü. Önce temizleyin (purge --yes).");

  const [owner] = await db()
    .select({ userId: personnel.userId, status: personnel.status })
    .from(personnel)
    .where(eq(personnel.sicilNo, opts.ownerSicil))
    .limit(1);
  const ownerRoles = owner ? (await db().select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, owner.userId))).map((r) => r.role as Role) : [];
  if (!owner || owner.status !== "active") problems.push(`Sicil ${opts.ownerSicil} bulunamadı ya da aktif değil.`);
  else if (!ownerRoles.includes("owner")) problems.push(`Sicil ${opts.ownerSicil} üst yönetici değil.`);

  const [pos] = await db().select().from(positions).where(eq(positions.code, code)).limit(1);
  if (!pos) problems.push(`Pozisyon ${code} bulunamadı.`);
  else {
    if (pos.status !== "active") problems.push(`Pozisyon ${code} aktif değil.`);
    const [card] = await db().select({ id: positionCardVersions.id }).from(positionCardVersions).where(eq(positionCardVersions.positionId, pos.id)).limit(1);
    if (card) problems.push(`Pozisyon ${code} için zaten kart var; örnek kart kartı olmayan bir pozisyona kurulur.`);
    const waiting = await db()
      .select({ id: personnel.userId })
      .from(personnel)
      .where(
        and(
          eq(personnel.positionId, pos.id),
          eq(personnel.status, "active"),
          eq(personnel.trainingRequired, true),
          sql`not exists (select 1 from assignments a where a.user_id = ${personnel.userId})`,
        ),
      );
    if (waiting.length) problems.push(`Pozisyonda eğitim bekleyen ${waiting.length} gerçek kişi var; kart yayınlanınca onlara örnek plan atanırdı.`);
    const [cardModule] = await db().select({ id: modules.id }).from(modules).where(eq(modules.cardPositionId, pos.id)).limit(1);
    if (cardModule) notes.push("Pozisyonun eski bir kart modülü var; kart onu kullanır ve temizlemede silinmez.");
  }

  const sicils = Object.values(PEOPLE).map((p) => p.sicilNo);
  const taken = await db().select({ s: personnel.sicilNo }).from(personnel).where(inArray(personnel.sicilNo, sicils));
  if (taken.length) problems.push(`Örnek sicil numaraları kullanılıyor: ${taken.map((t) => t.s).join(", ")}`);

  const signatories = await getSetting("certificate.signatories");
  if (signatories.length >= 3) notes.push("Sertifikada 3 imza yetkilisi var; örnek imza yetkilisi eklenmeyecek.");
  const types = await getSetting("visitor.types");
  if (!types.contractor.enabled) problems.push("Yüklenici ziyaretçi tipi kapalı.");

  const rulesTr = await currentText("visitor_rules", "tr");
  const kvkkTr = await currentText("kvkk_visitor", "tr");
  if (!rulesTr || !kvkkTr) notes.push("Ziyaretçi kuralları ya da ziyaretçi KVKK metni yayında değil: ziyaret ön kayıtta kalır (bilgilendirme, giriş ve tahliye yoklaması atlanır).");
  if (!(await currentText("explicit_consent_personnel", "tr"))) notes.push("Personel açık rıza metni yayında değil: profil fotoğrafı atlanır.");
  const briefing = await currentBriefing("contractor");
  const [draft] = await db()
    .select({ id: visitorBriefings.id })
    .from(visitorBriefings)
    .where(and(eq(visitorBriefings.visitorType, "contractor"), isNull(visitorBriefings.publishedAt)))
    .limit(1);
  if (briefing) notes.push("Yüklenici bilgilendirme paketi zaten yayında: örnek paket oluşturulmaz, ziyaret mevcut paketi kullanır.");
  else if (draft) notes.push("Yüklenici bilgilendirme paketinin taslağı var: örnek paket oluşturulmaz, ziyaret bilgilendirmesi atlanır.");
  else if (BRIEFING.questions.length < types.contractor.questionCount) notes.push("Örnek pakette yeterli soru yok: paket taslak kalır.");
  else notes.push("Yüklenici bilgilendirme paketi yok: örnek paket yayınlanır ve temizlemeye kadar gerçek yükleniciler de onu görür.");
  const [rulesDraft] = await db().select({ id: legalTexts.id }).from(legalTexts).where(and(eq(legalTexts.kind, "visitor_rules"), isNull(legalTexts.publishedAt))).limit(1);
  if (rulesDraft) notes.push("Ziyaretçi kuralları taslağı zaten var: örnek taslak oluşturulmaz.");

  if (!(await ffmpegAvailable())) problems.push("ffmpeg çalışmıyor (FFMPEG_PATH).");

  return { problems, notes, owner: owner && ownerRoles.includes("owner") ? userActor(owner.userId, ownerRoles) : null, pos: pos ?? null, signatories, rulesTr, kvkkTr, briefing, draft };
}

// ---------------------------------------------------------------------------
// Yükleme
// ---------------------------------------------------------------------------

export async function loadSampleData(opts: LoadOptions): Promise<LoadReport> {
  const log = opts.log ?? (() => {});
  const pf = await preflight(opts);
  const report: LoadReport = { ok: pf.problems.length === 0, problems: pf.problems, notes: [...pf.notes], created: {} };
  if (!report.ok || opts.check || !pf.owner || !pf.pos) return report;

  const tz = await getSetting("org.timezone");
  const ctx: Ctx = { log, notes: report.notes, created: report.created, tz, today: todayIn(tz), start: new Date() };
  const quiet = { userIds: new Set<string>() };
  await runQuietly(quiet, () => run(ctx, pf.owner!, pf.pos!, pf, quiet.userIds, opts.mediaWaitSec ?? 60));
  return report;
}

type Pf = Awaited<ReturnType<typeof preflight>>;
type Position = typeof positions.$inferSelect;

async function run(ctx: Ctx, owner: UserActor, pos: Position, pf: Pf, quietIds: Set<string>, mediaWaitSec: number) {
  const { log, today } = ctx;
  const unitId = pos.orgUnitId;
  const chain = await ancestors(unitId);
  const department = chain.find((u) => u.kind === "department") ?? chain[chain.length - 1]!;

  // ---- Kişiler ----
  log("Örnek kişiler oluşturuluyor…");
  const people = {} as Record<PersonKey, UserActor>;
  const roleOf: Partial<Record<PersonKey, Role[]>> = {
    trainer: ["trainer"],
    manager: ["section_manager"],
    ohs: ["ohs_specialist"],
    security: ["security"],
  };
  async function person(key: PersonKey, opts: { trainingRequired: boolean; hireDate?: string }) {
    const p = PEOPLE[key];
    const { userId } = await createPerson(owner, {
      sicilNo: p.sicilNo,
      fullName: p.fullName,
      positionId: p.inPosition ? pos.id : null,
      employmentType: "employee",
      hireDate: opts.hireDate ?? (p.hireDate || today),
      trainingRequired: opts.trainingRequired,
      channel: "none",
    });
    quietIds.add(userId);
    await record(ctx, "users", userId);
    const roles = roleOf[key] ?? [];
    if (roles.length) await setRoles(owner, userId, roles);
    people[key] = userActor(userId, ["personnel", ...roles]);
    return people[key];
  }
  for (const k of ["trainer", "manager", "ohs", "security", "per1", "per2"] as const) await person(k, { trainingRequired: false });
  await setSectionManagerScopes(owner, people.manager.userId, [unitId]);
  const { trainer, manager, ohs, security } = people;

  // ---- Medya ----
  log("Görseller, videolar ve PDF'ler hazırlanıyor…");
  const ppe = await media.ppeImages();
  const signatorySig = await media.signaturePng(41);
  const png = (fileName: string, data: Buffer): Upload => ({ kind: "image", mime: "image/png", fileName, data });
  const pdf = (fileName: string, data: Buffer): Upload => ({ kind: "pdf", mime: "application/pdf", fileName, data });
  const mp4 = (fileName: string, data: Buffer): Upload => ({ kind: "video", mime: "video/mp4", fileName, data });
  const steps = cardSections({ nearMissId: "", pressRulesId: "", lotoId: "", isgPdfId: "", ppeGalleryId: "", diagramAssetId: "" }).workflow.steps;
  const diagramTitles = ["Hazırlık", "Doz", "Pres çevrimi", "Kontrol", "Paketleme"];

  const a = {
    isgPdfTr: await upload(ctx, owner, pdf("temel-isg-kkd-talimati.pdf", await pdfs.isgInstructionPdf("tr"))),
    isgPdfEn: await upload(ctx, owner, pdf("basic-ohs-ppe-instruction.pdf", await pdfs.isgInstructionPdf("en"))),
    nearMissTr: await upload(ctx, owner, pdf("ramak-kala-bildirim-formu.pdf", await pdfs.nearMissFormPdf("tr"))),
    nearMissEn: await upload(ctx, owner, pdf("near-miss-report-form.pdf", await pdfs.nearMissFormPdf("en"))),
    videoTr: await upload(ctx, owner, mp4("vardiya-basi-pres-hazirligi.mp4", await media.slideshowVideo(VIDEO_SLIDES.tr))),
    videoEn: await upload(ctx, owner, mp4("press-shift-start-preparation.mp4", await media.slideshowVideo(VIDEO_SLIDES.en))),
    ppe: {
      goggles: await upload(ctx, owner, png("kkd-goz-koruyucu.png", ppe.goggles)),
      gloves: await upload(ctx, owner, png("kkd-isiya-dayanikli-eldiven.png", ppe.gloves)),
      earmuffs: await upload(ctx, owner, png("kkd-kulak-koruyucu.png", ppe.earmuffs)),
      mask: await upload(ctx, owner, png("kkd-toz-maskesi.png", ppe.mask)),
      shoes: await upload(ctx, owner, png("kkd-guvenlik-ayakkabisi.png", ppe.shoes)),
      clothing: await upload(ctx, owner, png("kkd-is-kiyafeti.png", ppe.clothing)),
    },
    lotoLock: await upload(ctx, owner, png("loto-kilit-ve-etiket.png", await media.lotoLockImage())),
    lotoVerify: await upload(ctx, owner, png("loto-sifir-enerji.png", await media.lotoVerifyImage())),
  };
  const diagram = await upload(
    ctx,
    owner,
    png("is-akisi.png", await media.workflowDiagram(steps.map((s, i) => ({ title: diagramTitles[i]!, detail: s.output })), `${pos.name} iş akışı`)),
  );
  const pressPanel = await upload(ctx, owner, png("pres-kumanda-panosu.png", await media.pressPanelImage()));
  const sitePlan = await upload(ctx, owner, png("saha-plani.png", await media.sitePlanImage()));
  const signatoryAsset = await upload(ctx, owner, png("imza-yetkilisi.png", signatorySig));
  const practicePhoto = await upload(ctx, trainer, png("pratik-egitim.png", await media.practicePhoto()));
  const ownerMedia = [a.isgPdfTr, a.isgPdfEn, a.nearMissTr, a.nearMissEn, a.videoTr, a.videoEn, ...Object.values(a.ppe), a.lotoLock, a.lotoVerify, diagram, pressPanel, sitePlan, signatoryAsset, practicePhoto];
  log("Medya işleniyor (video dönüştürme birkaç dakika sürebilir)…");
  await waitForMedia(ctx, ownerMedia, mediaWaitSec);

  // ---- Etiketler ----
  const tagGroups = await listTags(owner);
  const tagId = async (type: string, name: string) => {
    const group = tagGroups.find((g) => g.key === type)!;
    const existing = group.tags.find((t) => t.name.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"));
    if (existing) return existing.id;
    const created = await createTag(owner, { tagTypeId: group.typeId, name });
    group.tags.push(created);
    await record(ctx, "tags", created.id);
    return created.id;
  };

  // ---- İçerikler ----
  log("İçerikler oluşturuluyor…");
  const contentIds = {} as Record<ContentKey, string>;
  const specs = sampleContents(a);
  for (const spec of specs) {
    const { id } = await createContent(owner, { type: spec.type, title: spec.tr.title, ownerOrgUnitId: unitId, commonTarget: null, isOhs: spec.isOhs });
    await record(ctx, "contents", id);
    const tagIds = [];
    for (const t of spec.tags) tagIds.push(await tagId(t.type, t.name));
    await saveDraft(owner, id, { title: spec.tr.title, body: spec.tr.body, tagIds, en: { title: spec.en.title, body: spec.en.body } });
    await submitForApproval(owner, id, { changeNote: null, requireReread: false });
    await approveContentUntilPublished(owner, ohs, manager, id);
    contentIds[spec.key] = id;
  }

  // ---- Yetkinlikler ----
  const competencyIds = {} as Record<CompetencyKey, string>;
  for (const [key, c] of Object.entries(COMPETENCIES) as [CompetencyKey, (typeof COMPETENCIES)[CompetencyKey]][]) {
    const { id } = await createCompetency(owner, { ...c, orgUnitId: unitId });
    await record(ctx, "competencies", id);
    competencyIds[key] = id;
  }

  // ---- Modüller ----
  log("Modüller, ara değerlendirme ve pratik görevler oluşturuluyor…");
  const moduleIds = {} as Record<(typeof MODULES)[number]["key"], string>;
  for (const m of MODULES) {
    const { id } = await createModule(owner, {
      kind: m.kind,
      title: m.title,
      description: m.description,
      durationMin: m.durationMin,
      isOhs: m.isOhs,
      remoteAllowed: m.remoteAllowed,
      validityMonths: m.validityMonths,
      ownerOrgUnitId: unitId,
      commonTarget: null,
      commonSortOrder: null,
      ohsTopic: m.ohsTopic,
    });
    await record(ctx, "modules", id);
    moduleIds[m.key] = id;
  }
  for (const [key, list] of Object.entries(MODULE_CONTENTS) as [ModuleKey, ContentKey[]][]) {
    await setModuleContents(owner, moduleIds[key], list.map((k) => contentIds[k]));
  }
  await saveQuizQuestions(owner, moduleIds.pressSafety, QUIZ.map((q) => ({ ...q, options: [...q.options] })));
  await saveTasks(
    owner,
    moduleIds.practice,
    PRACTICE_TASKS.map((t) => ({ title: t.title, description: t.description, isCritical: t.isCritical, competencyId: competencyIds[t.competency] })),
  );

  // ---- Soru bankası ----
  log("Soru bankası oluşturuluyor (ekran + Excel aktarımı)…");
  const isOhsModule = (k: ModuleKey) => MODULES.find((m) => m.key === k)!.isOhs;
  const questionIds = new Map<string, string>();
  const toInput = (q: QuestionSpec): QuestionInput => ({
    type: q.type,
    stem: q.stem,
    options: q.type === "single_choice" ? q.options : q.type === "true_false" ? [...TRUE_FALSE_OPTIONS] : [],
    correctIndex: q.type === "single_choice" ? q.correctIndex : q.type === "true_false" ? (q.correct ? 0 : 1) : null,
    pairs: q.type === "matching" ? q.pairs : null,
    regions: q.type === "hotspot" ? q.regions : null,
    explanation: q.explanation,
    topic: q.topic,
    difficulty: q.difficulty,
    isOhsCritical: q.isOhsCritical,
    mediaAssetId: q.type === "hotspot" ? (q.image === "pressPanel" ? pressPanel : sitePlan) : null,
    moduleIds: [moduleIds[q.module]],
    en: { stem: q.en.stem, options: q.en.options, pairs: q.en.pairs, explanation: q.en.explanation },
  });
  for (const q of QUESTIONS) {
    const { id } = await createQuestion(owner, { ...toInput(q), ownerOrgUnitId: unitId, isOhs: isOhsModule(q.module) });
    await record(ctx, "questions", id);
    questionIds.set(q.key, id);
  }
  const importStart = new Date();
  const titleOf = (k: ModuleKey) => MODULES.find((m) => m.key === k)!.title;
  const qRows: (string | number | null)[][] = [
    ["Soru", "Tip", "A", "B", "C", "D", "E", "F", "Doğru", "Konu", "Zorluk", "İSG kritik", "Modül", "Açıklama", "Soru (EN)", "A (EN)", "B (EN)", "C (EN)", "D (EN)", "E (EN)", "F (EN)", "Açıklama (EN)"],
  ];
  const six = (xs: string[]) => [...xs, ...Array(6 - xs.length).fill(null)];
  for (const r of IMPORT_ROWS) {
    qRows.push([
      r.stem,
      r.type,
      ...six(r.cells),
      r.correct || null,
      r.topic,
      r.difficulty,
      r.critical ? "Evet" : "Hayır",
      r.modules.map(titleOf).join("; "),
      r.explanation,
      r.en.stem,
      ...six(r.en.cells),
      r.en.explanation,
    ]);
  }
  const imported = await commitQuestionImport(owner, await xlsx(qRows), { ownerOrgUnitId: unitId, isOhs: false });
  if (imported.skipped) ctx.notes.push(`Excel soru aktarımında ${imported.skipped} satır atlandı.`);
  const importedRows = await db()
    .select({ id: questionsTable.id })
    .from(questionsTable)
    .where(and(eq(questionsTable.createdBy, owner.userId), eq(questionsTable.ownerOrgUnitId, unitId), gte(questionsTable.createdAt, importStart)));
  for (const q of importedRows) await record(ctx, "questions", q.id);
  await approvePendingQuestions(ohs, [...questionIds.values(), ...importedRows.map((q) => q.id)]);

  // ---- Pozisyon kartı + eğitim planı ----
  log("Pozisyon kartı ve eğitim planı hazırlanıyor…");
  const { versionId: cardV1 } = await createCard(owner, pos.id);
  await record(ctx, "position_card_versions", cardV1);
  const editable = await getEditableCard(owner, pos.id);
  const cardModuleId = editable.plan!.items.find((i) => i.isCardModule)!.moduleId;
  const [cm] = await db().select({ createdAt: modules.createdAt }).from(modules).where(eq(modules.id, cardModuleId));
  if (cm && cm.createdAt >= ctx.start) await record(ctx, "modules", cardModuleId);
  const refs = {
    nearMissId: contentIds.nearMiss,
    pressRulesId: contentIds.pressRules,
    lotoId: contentIds.loto,
    isgPdfId: contentIds.isgPdf,
    ppeGalleryId: contentIds.ppeGallery,
    diagramAssetId: diagram,
  };
  await saveCardSections(owner, pos.id, cardSections(refs));
  const M = moduleIds;
  await savePlan(owner, pos.id, {
    overrides: {},
    items: [
      { moduleId: cardModuleId, isRequired: true, prerequisiteModuleIds: [], settings: {} },
      { moduleId: M.ohsBasics, isRequired: true, prerequisiteModuleIds: [], settings: {} },
      { moduleId: M.fire, isRequired: true, prerequisiteModuleIds: [], settings: {} },
      { moduleId: M.pressSafety, isRequired: true, prerequisiteModuleIds: [cardModuleId], settings: {} },
      { moduleId: M.exam, isRequired: true, prerequisiteModuleIds: [M.ohsBasics, M.fire, M.pressSafety], settings: EXAM_SETTINGS },
      { moduleId: M.practice, isRequired: true, prerequisiteModuleIds: [M.pressSafety], settings: {} },
      { moduleId: M.practicalExam, isRequired: true, prerequisiteModuleIds: [M.practice, M.exam], settings: PRACTICAL_SETTINGS },
    ],
  });
  await submitCard(owner, pos.id, { changeNote: "İlk sürüm: Droplast/Pres İşçisi görev tanımı ve eğitim planı." });
  await approveCardUntilPublished(owner, ohs, manager, pos.id);

  // ---- Eski personel: Excel ile aktarım ----
  log("Personel Excel aktarımı (mevcut personel)…");
  const p3 = PEOPLE.per3;
  const peopleXlsx = await xlsx([
    ["Sicil No", "Ad Soyad", "Departman", "Pozisyon", "İşe Giriş Tarihi", "Yaka Tipi"],
    [p3.sicilNo, p3.fullName, department.name, pos.code, p3.hireDate.split("-").reverse().join("."), pos.collarType === "white" ? "Beyaz yaka" : "Mavi yaka"],
  ]);
  const { batchId } = await validateImport(owner, { fileName: "ornek-personel.xlsx", buffer: peopleXlsx, mode: "existing_staff" });
  await record(ctx, "import_batches", batchId);
  await commitImport(owner, batchId);
  const [per3Row] = await db().select({ userId: personnel.userId }).from(personnel).where(eq(personnel.sicilNo, p3.sicilNo));
  if (!per3Row) throw new Error("Excel aktarımı kişiyi oluşturmadı");
  quietIds.add(per3Row.userId);
  await record(ctx, "users", per3Row.userId);
  people.per3 = userActor(per3Row.userId, ["personnel"]);

  // ---- Kursiyer ----
  log("Kursiyer ve eğitim ataması…");
  const learner = await person("learner", { trainingRequired: true, hireDate: today });
  let [assignment] = await db()
    .select({ id: assignments.id })
    .from(assignments)
    .where(and(eq(assignments.userId, learner.userId), notInArray(assignments.status, ["completed", "cancelled"])))
    .limit(1);
  if (!assignment) assignment = await startAssignment(owner, learner.userId, { trainerUserId: trainer.userId, targetDate: addDays(today, 30) });
  await updateAssignment(owner, assignment.id, { trainerUserId: trainer.userId, targetDate: addDays(today, 30) });

  // ---- Geçici imza yetkilisi (yalnızca örnek sertifikaya basılır) ----
  const originalSignatories = pf.signatories;
  const addSignatory = originalSignatories.length < 3;
  if (addSignatory) {
    await setSetting(owner, "certificate.signatories", [...originalSignatories, { ...SIGNATORY, signatureAssetId: signatoryAsset }], "Örnek veri: geçici imza yetkilisi");
  }
  try {
    await completeTraining(ctx, { owner, learner, trainer, manager, ohs }, assignment.id, practicePhoto, M.fire);
  } finally {
    if (addSignatory) {
      const now = await getSetting("certificate.signatories");
      await setSetting(owner, "certificate.signatories", now.filter((s) => s.signatureAssetId !== signatoryAsset), "Örnek veri: geçici imza yetkilisi kaldırıldı");
    }
  }

  // ---- Yetkinlik (elle), eski eğitimler, periyodik eğitim ----
  log("Yetkinlik, eski eğitim kayıtları ve periyodik eğitim…");
  await grantCompetency(manager, { userId: people[MANUAL_GRANT.person].userId, competencyId: competencyIds[MANUAL_GRANT.competency], reason: MANUAL_GRANT.reason });
  await recordPriorTrainings(owner, {
    userIds: [people[PRIOR.screen.person].userId],
    moduleId: M[PRIOR.screen.module],
    completedOn: monthsAgo(today, PRIOR.screen.monthsAgo),
    note: PRIOR.screen.note,
  });
  const p2 = PEOPLE[PRIOR.excel.person];
  const [py, pm, pd] = monthsAgo(today, PRIOR.excel.monthsAgo).split("-").map(Number) as [number, number, number];
  const priorXlsx = await xlsx([
    ["Sicil no", "Ad soyad", "Modül", "Son eğitim tarihi", "Not"],
    [p2.sicilNo, p2.fullName, titleOf(PRIOR.excel.module), new Date(Date.UTC(py, pm - 1, pd)), PRIOR.excel.note],
  ]);
  const preview = await previewPriorImport(owner, priorXlsx);
  if (preview.rows.some((r) => "errors" in r && Array.isArray(r.errors) && r.errors.length)) ctx.notes.push("Eski eğitim Excel önizlemesinde hata var.");
  await commitPriorImport(owner, priorXlsx);
  const periodic = await startPeriodicTraining(owner, [people.per3.userId]);
  if (periodic.started === 0) ctx.notes.push("Periyodik eğitim başlatılamadı.");

  // ---- Çalışma programı ----
  const { id: scheduleId } = await saveWorkSchedule(owner, pos.id, null, {
    name: WORK_SCHEDULE.name,
    kind: WORK_SCHEDULE.kind,
    days: WORK_SCHEDULE.days,
    startTime: WORK_SCHEDULE.startTime,
    items: WORK_SCHEDULE.items.map((i) => ({ ...i, weekday: null })),
  });
  await record(ctx, "work_schedules", scheduleId);
  await chooseWorkSchedule(learner, scheduleId);
  await saveMyScheduleCopy(learner, scheduleId, [...WORK_SCHEDULE.items, WORK_SCHEDULE.personalItem].map((i) => ({ ...i, weekday: null })));

  // ---- Yeni sürümler: içerik (tekrar oku), kart, soru ----
  log("Yeni sürümler (içerik, kart, soru)…");
  await startNewVersion(owner, contentIds.checklist);
  const checklist = specs.find((s) => s.key === "checklist")!;
  const addItem = (body: unknown, text: string) => ({ items: [...(body as { items: object[] }).items, { text, critical: true }] });
  await saveDraft(owner, contentIds.checklist, {
    title: checklist.tr.title,
    body: addItem(checklist.tr.body, "Toz emiş (havalandırma) sistemi çalışıyor."),
    tagIds: [],
    en: { title: checklist.en.title, body: addItem(checklist.en.body, "Dust extraction (ventilation) system is running.") },
  });
  await submitForApproval(owner, contentIds.checklist, { changeNote: "Toz emiş sisteminin kontrolü kritik madde olarak eklendi.", requireReread: true });
  await approveContentUntilPublished(owner, ohs, manager, contentIds.checklist);

  const { versionId: cardV2 } = await startNewCardVersion(owner, pos.id);
  await record(ctx, "position_card_versions", cardV2);
  const v2 = cardSections(refs);
  v2.kpis.push(CARD_V2.kpi);
  await saveCardSections(owner, pos.id, v2);
  await submitCard(owner, pos.id, { changeNote: CARD_V2.changeNote });
  await approveCardUntilPublished(owner, ohs, manager, pos.id);

  const revised = QUESTIONS.find((q) => q.key === QUESTION_REVISION.key)!;
  const revisedId = questionIds.get(revised.key)!;
  const revisedInput = toInput(revised);
  await updateQuestion(owner, revisedId, {
    ...revisedInput,
    explanation: QUESTION_REVISION.explanation,
    en: { ...revisedInput.en!, explanation: QUESTION_REVISION.enExplanation },
  });
  await approvePendingQuestions(ohs, [revisedId]);

  // ---- Profil fotoğrafı + açık rıza ----
  const consentText = await currentText("explicit_consent_personnel", "tr");
  if (consentText) {
    await decideExplicitConsent(learner, { legalTextId: consentText.id, granted: true, source: "profile" }, META);
    const photo = await upload(ctx, learner, { ...png("profil.png", await media.avatar("EY")), purpose: "profile_photo" });
    await setProfilePhoto(learner, learner.userId, photo);
  }

  // ---- Ziyaretçi ----
  await loadVisitors(ctx, { owner, ohs, security, manager }, pf, mediaWaitSec, sitePlan);

  // ---- Sistem ----
  const device = await registerDevice(owner, { name: DEVICE_NAME, kind: "kiosk" });
  await record(ctx, "devices", device.id);
  log("Bitti.");
}

// ---------------------------------------------------------------------------
// Onay akışları
// ---------------------------------------------------------------------------

async function approveContentUntilPublished(owner: UserActor, ohs: UserActor, manager: UserActor, contentId: string) {
  for (let i = 0; i < 4; i++) {
    const [v] = await db().select({ id: contentVersions.id, status: contentVersions.status }).from(contentVersions).where(eq(contentVersions.contentId, contentId)).orderBy(desc(contentVersions.version)).limit(1);
    if (!v || v.status === "published") return;
    if (v.status === "ohs_review") await approveVersion(ohs, v.id);
    else if (v.status === "section_review") await approveVersion(manager, v.id);
    else throw new Error(`İçerik onay durumu beklenmedik: ${v.status}`);
  }
  void owner;
}

async function approveCardUntilPublished(owner: UserActor, ohs: UserActor, manager: UserActor, positionId: string) {
  for (let i = 0; i < 4; i++) {
    const [v] = await db()
      .select({ id: positionCardVersions.id, status: positionCardVersions.status })
      .from(positionCardVersions)
      .where(eq(positionCardVersions.positionId, positionId))
      .orderBy(desc(positionCardVersions.version))
      .limit(1);
    if (!v || v.status === "published") return;
    if (v.status === "ohs_review") await approveCard(ohs, v.id);
    else if (v.status === "section_review") await approveCard(manager, v.id);
    else throw new Error(`Kart onay durumu beklenmedik: ${v.status}`);
  }
  void owner;
}

async function approvePendingQuestions(ohs: UserActor, questionIds: string[]) {
  if (!questionIds.length) return;
  const pending = await db()
    .select({ id: questionVersions.id })
    .from(questionVersions)
    .where(and(inArray(questionVersions.questionId, questionIds), eq(questionVersions.status, "ohs_review")));
  for (const v of pending) await approveQuestionVersion(ohs, v.id);
}

// ---------------------------------------------------------------------------
// Kursiyerin bütün eğitimi
// ---------------------------------------------------------------------------

type Cast = { owner: UserActor; learner: UserActor; trainer: UserActor; manager: UserActor; ohs: UserActor };

async function completeTraining(ctx: Ctx, cast: Cast, assignmentId: string, practicePhoto: string, classroomFormModuleId: string) {
  const { learner, trainer, manager, ohs, owner } = cast;
  void classroomFormModuleId;
  let photoUsed = false;
  for (let pass = 0; pass < 40; pass++) {
    const current = (await myLearning(learner)).current;
    if (!current || current.id !== assignmentId || current.status !== "active") break;
    const next = current.modules.find((m) => m.status !== "locked" && m.status !== "completed" && m.status !== "waived");
    if (!next) break;
    ctx.log(`Kursiyer: ${next.title}`);
    if (next.kind === "theory" && !next.remoteAllowed) {
      await classroom(ctx, cast, next.moduleId, next.isOhs);
    } else if (next.kind === "theory") {
      await theory(learner, next.id);
    } else if (next.kind === "theory_exam") {
      await exam(ctx, learner, trainer, next.id);
    } else if (next.kind === "practice") {
      const [am] = await db().select({ tasks: assignmentModules.pinnedTaskIds }).from(assignmentModules).where(eq(assignmentModules.id, next.id));
      for (const [i, taskId] of (am?.tasks ?? []).entries()) {
        for (const level of ["demonstrated", "supervised", "independent"] as const) {
          const withPhoto = !photoUsed && i === 0 && level === "independent";
          await markTask(trainer, next.id, taskId, { level, note: PRACTICE_NOTES[level], photoAssetIds: withPhoto ? [practicePhoto] : [] });
          if (withPhoto) photoUsed = true;
        }
      }
    } else if (next.kind === "practice_exam") {
      const { id } = await startPracticalExam(trainer, next.id);
      // Ölçütler, sınav başlarken plandaki pratik görevlerden kopyalanır
      const [result] = await db().select({ criteria: practicalExamResults.criteria }).from(practicalExamResults).where(eq(practicalExamResults.id, id));
      await signPracticalExam(trainer, id, {
        criteria: (result?.criteria ?? []).map((c) => ({ taskId: c.taskId, result: "pass" as const, note: PRACTICAL_EXAM.criterionNote })),
        note: PRACTICAL_EXAM.note,
        photoAssetIds: [],
        traineeSignature: await media.signatureDataUrl(17),
        trainerSignature: await media.signatureDataUrl(23),
        ...META,
      });
      await secondSignPracticalExam(manager, id, { signature: await media.signatureDataUrl(29), ...META });
    }
    const after = (await myLearning(learner)).current?.modules.find((m) => m.id === next.id);
    if (after && after.status !== "completed" && after.status !== "waived" && next.kind !== "practice") {
      throw new Error(`Modül tamamlanamadı: ${next.title} (${after.status})`);
    }
  }
  const [a] = await db().select({ status: assignments.status }).from(assignments).where(eq(assignments.id, assignmentId));
  if (a?.status !== "awaiting_readiness") throw new Error(`Atama işe başlama onayı beklemiyor: ${a?.status}`);
  await approveReadiness(manager, assignmentId, READINESS_COMMENT);
  void ohs;
  void owner;
}

async function theory(learner: UserActor, amId: string) {
  const view = await learnModule(learner, amId);
  for (const item of view.items) {
    if (item.acknowledgedAt) continue;
    if (item.contentType === "video") {
      const duration = item.videoDurationSec ?? 0;
      if (duration <= 0) throw new Error(`Video hazır değil: ${item.title}`);
      await reportVideoProgress(learner, item.id, [[0, duration]]);
    } else {
      await reportReachedEnd(learner, item.id, 1);
    }
    await acknowledgeItem(learner, item.id);
  }
  // Ara değerlendirme bütün adımlar onaylanınca açılır
  const open = (await learnModule(learner, amId)).quiz.filter((q) => !q.answer);
  if (open.length) {
    const rows = await db().select({ id: quizQuestions.id, correct: quizQuestions.correctIndex }).from(quizQuestions).where(inArray(quizQuestions.id, open.map((q) => q.id)));
    const correct = new Map(rows.map((r) => [r.id, r.correct]));
    for (const q of open) await answerQuiz(learner, amId, q.id, correct.get(q.id) ?? 0);
  }
}

async function classroom(ctx: Ctx, cast: Cast, moduleId: string, isOhs: boolean) {
  const { manager, trainer, learner, ohs, owner } = cast;
  const [m] = await db().select({ title: modules.title }).from(modules).where(eq(modules.id, moduleId));
  const [lp] = await db().select({ name: personnel.fullName, sicil: personnel.sicilNo }).from(personnel).where(eq(personnel.userId, learner.userId));
  const [tp] = await db().select({ name: personnel.fullName }).from(personnel).where(eq(personnel.userId, trainer.userId));
  const sheet = await pdfs.attendanceSheetPdf({
    moduleTitle: m!.title,
    date: ctx.today.split("-").reverse().join("."),
    location: CLASSROOM.location,
    durationMin: CLASSROOM.durationMin,
    trainer: { name: tp!.name, signature: await media.signaturePng(3) },
    attendees: [{ name: lp!.name, sicilNo: lp!.sicil, signature: await media.signaturePng(11) }],
  });
  const form = await upload(ctx, manager, { kind: "pdf", mime: "application/pdf", fileName: "sinif-egitimi-katilim-formu.pdf", data: sheet });
  await waitForMedia(ctx, [form], 30);
  const { id } = await createClassroomSession(manager, {
    moduleId,
    trainerUserId: trainer.userId,
    sessionDate: ctx.today,
    durationMin: CLASSROOM.durationMin,
    location: CLASSROOM.location,
    notes: CLASSROOM.notes,
    scannedFormAssetId: form,
    attendeeIds: [learner.userId],
  });
  await record(ctx, "classroom_sessions", id);
  await submitClassroomSession(manager, id);
  await approveClassroomSession(isOhs ? ohs : owner, id);
  const [s] = await db().select({ status: classroomSessions.status }).from(classroomSessions).where(eq(classroomSessions.id, id));
  if (s?.status !== "approved") throw new Error("Sınıf eğitimi onaylanmadı");
}

async function exam(ctx: Ctx, learner: UserActor, trainer: UserActor, amId: string) {
  const { id: proctorId, code } = await issueProctorCode(trainer, { location: PROCTOR_LOCATION });
  await record(ctx, "proctor_sessions", proctorId);
  const { attemptId } = await startExam(learner, amId, { code, ...META });
  const items = await db()
    .select({ id: examAttemptItems.id, order: examAttemptItems.optionOrder, v: questionVersions })
    .from(examAttemptItems)
    .innerJoin(questionVersions, eq(questionVersions.id, examAttemptItems.questionVersionId))
    .where(eq(examAttemptItems.attemptId, attemptId))
    .orderBy(asc(examAttemptItems.sortOrder));
  for (const it of items) {
    const v = it.v;
    if (v.type === "matching") {
      await answerExam(learner, attemptId, it.id, { kind: "matching", pairs: (v.pairs ?? []).map((_, left) => it.order.indexOf(left)) });
    } else if (v.type === "hotspot") {
      await answerExam(learner, attemptId, it.id, { kind: "hotspot", point: regionCenter((v.regions ?? [])[0]!) });
    } else {
      await answerExam(learner, attemptId, it.id, { kind: "choice", shownIndex: it.order.indexOf(v.correctIndex ?? 0) });
    }
  }
  await submitExam(learner, attemptId);
}

// ---------------------------------------------------------------------------
// Ziyaretçi, güvenlik ve yasal metin
// ---------------------------------------------------------------------------

async function loadVisitors(ctx: Ctx, cast: { owner: UserActor; ohs: UserActor; security: UserActor; manager: UserActor }, pf: Pf, mediaWaitSec: number, ownerSitePlan: string) {
  const { owner, ohs, security, manager } = cast;
  const { log, today } = ctx;
  void ownerSitePlan;
  log("Ziyaretçi kayıtları…");

  const ppeItems = await getSetting("visitor.ppe_items");
  if (!ppeItems.includes(PPE_ITEM) && ppeItems.length < 20) {
    // Parametreyi gerçek üst yönetici kaydeder: settings tablosuna temizlemede dokunulmaz, örnek kişiye bağ kalmamalı
    await setSetting(owner, "visitor.ppe_items", [...ppeItems, PPE_ITEM], "Örnek veri: toz maskesi");
    await db().insert(sampleRecords).values({ tableName: "settings", settingKey: "visitor.ppe_items", settingItem: PPE_ITEM });
  }

  const company = await createCompany(ohs, { ...COMPANY, contractEnd: addDays(today, 365) });
  await record(ctx, "contractor_companies", company.id);

  const black = await addToBlacklist(ohs, {
    idKind: "passport",
    idCountry: BLACKLIST.idCountry,
    idNumber: BLACKLIST.idNumber,
    fullName: BLACKLIST.fullName,
    reason: BLACKLIST.reason,
    endsAt: addDays(today, 365),
  });
  await record(ctx, "blacklist_entries", black.id);

  // Bilgilendirme paketi: yalnızca hiç yayın ve taslak yoksa örnek paket yayınlanır
  let briefingReady = !!pf.briefing;
  if (!pf.briefing && !pf.draft) {
    const { id } = await createBriefingDraft(ohs, "contractor");
    await record(ctx, "visitor_briefings", id);
    const image = await upload(ctx, ohs, { kind: "image", mime: "image/png", fileName: "toplanma-alani.png", data: await media.sitePlanImage() });
    await waitForMedia(ctx, [image], mediaWaitSec);
    await saveBriefingDraft(ohs, id, {
      cards: BRIEFING.cards.map((c, i) => ({ ...c, mediaAssetId: i === 5 ? image : null })),
      questions: BRIEFING.questions.map((q) => ({ ...q, optionsTr: [...q.optionsTr], optionsEn: [...q.optionsEn] })),
    });
    const { "visitor.types": types } = await getSettings(["visitor.types"]);
    if (BRIEFING.questions.length >= types.contractor.questionCount) {
      await publishBriefing(ohs, id);
      briefingReady = true;
    }
  }

  const { id: visitId } = await createVisit(security, {
    visitorType: "contractor",
    plannedDate: today,
    fullName: VISITOR.fullName,
    contractorCompanyId: company.id,
    hostSicilNo: PEOPLE.manager.sicilNo,
    note: VISITOR.note,
    id: { idKind: "passport", idCountry: VISITOR.idCountry, idNumber: VISITOR.idNumber },
  });
  await record(ctx, "visits", visitId);
  const [visit] = await db().select({ visitorId: visits.visitorId }).from(visits).where(eq(visits.id, visitId));
  await record(ctx, "visitors", visit!.visitorId);

  if (briefingReady && pf.rulesTr && pf.kvkkTr) {
    const token = await withActor(security, (tx) => issueVisitSession(tx, visitId, "link", today));
    await startBriefing(token, "tr");
    const { "visitor.types": types } = await getSettings(["visitor.types"]);
    const brief = await currentBriefing("contractor");
    const cards = brief?.cards.length ?? 0;
    const wait = cards * types.contractor.cardMinSeconds;
    if (wait > 0) {
      log(`Ziyaretçi bilgilendirmesi: kartların okunma süresi bekleniyor (${wait} sn)…`);
      await sleep(wait * 1000 + 1500);
    }
    const quiz = await drawQuiz(token, "tr");
    if (quiz.attemptId) {
      const [attempt] = await db().select({ items: visitQuizAttempts.items }).from(visitQuizAttempts).where(eq(visitQuizAttempts.id, quiz.attemptId));
      const correctById = new Map((brief?.questions ?? []).map((q) => [q.id, q.correctIndex]));
      const answers = attempt!.items.map((it) => it.optionOrder.indexOf(correctById.get(it.questionId) ?? 0));
      const result = await submitQuiz(token, quiz.attemptId, answers);
      if (!result.passed) throw new Error("Ziyaretçi kontrol sorularını geçemedi");
    }
    await completeBriefing(token, { locale: "tr", rulesId: pf.rulesTr.id, kvkkId: pf.kvkkTr.id, signature: await media.signatureDataUrl(31) }, META);

    const allowed = await getSetting("visitor.ppe_items");
    const ppe = [PPE_ITEM, "Reflektörlü yelek", "İş ayakkabısı", "Koruyucu gözlük"].filter((p) => allowed.includes(p));
    const result = await checkIn(security, visitId, { badgeNo: VISITOR.badgeNo, ppe });
    if ("denied" in result) throw new Error("Örnek ziyaretçi girişte reddedildi");

    const inside = await insideNow(security);
    if (inside.every((p) => p.visitId === visitId)) {
      const { id: rollcallId } = await startRollcall(security, "drill");
      await record(ctx, "evacuation_rollcalls", rollcallId);
      await setSafe(security, rollcallId, visitId, true);
      await endRollcall(security, rollcallId);
    } else {
      ctx.notes.push("İçeride gerçek ziyaretçi olduğu için tahliye yoklaması tatbikatı atlandı.");
    }
    await checkOut(security, visitId, true);
  }

  // Ziyaretçi kuralları taslağı (yayınlanmaz)
  const [rulesDraft] = await db().select({ id: legalTexts.id }).from(legalTexts).where(and(eq(legalTexts.kind, "visitor_rules"), isNull(legalTexts.publishedAt))).limit(1);
  if (!rulesDraft) {
    const tr = await createDraft(ohs, VISITOR_RULES.tr, "visitor_rules", "tr");
    await record(ctx, "legal_texts", tr.id);
    const en = await createDraft(ohs, VISITOR_RULES.en, "visitor_rules", "en");
    await record(ctx, "legal_texts", en.id);
  }
  void manager;
}
