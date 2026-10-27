import { and, asc, desc, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Actor, UserActor } from "@/server/authz/actor";
import { assertUser, hasRole } from "@/server/authz/policy";
import { isPersonInScope } from "@/server/authz/scope";
import { db, type DbOrTx, type Tx } from "@/server/db/client";
import {
  assignmentModules,
  assignments,
  attemptGrants,
  mediaAssets,
  positions,
  practicalExamResults,
  practiceMarks,
  practiceTasks,
  signatures,
  users,
  type PracticalCriterion,
} from "@/server/db/schema";
import { personnel } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { isDone } from "@/server/state/assignment";
import { attemptsLeft } from "@/server/state/exam";
import { checkMark, currentLevels, allIndependent, lowerLevels, nextLevel, scorePractical, type PracticeLevel } from "@/server/state/practice";
import { canViewPerson } from "../assignments";
import { completeModule, refreshAssignment } from "../assignments/engine";
import { notify, notifyAllAttemptsFailed, resolveNotifications, sectionManagersForPerson } from "../notifications";
import { planDefaults } from "../positions/plan-settings";
import { createSignature, subjectHash, uploadSignatureImage } from "../signatures";

/**
 * Pratik eğitim ve pratik sınav (FG-5, FG-6.2, iş paketi 1.6).
 * Değerlendiren (karar #66): atamanın eğitmeni ya da kişiyi kapsamında tutan bölüm sorumlusu. 2. imza: kapsamdaki bölüm
 * sorumlusu; 1. imzayı atan kişi 2. imzayı atamaz. Kimse kendi kaydını işaretleyemez/değerlendiremez.
 * Görme: kursiyer (kendi), eğitmeni, kapsamdaki bölüm sorumlusu, İK (okuma).
 */

export type { PracticalCriterion };

type ModuleRow = typeof assignmentModules.$inferSelect;
type AssignmentRow = typeof assignments.$inferSelect;
type ResultRow = typeof practicalExamResults.$inferSelect;

const MAX_PHOTOS = 6;
const MAX_NOTE = 1000;
const SUBJECT = "practical_exam";

async function canEvaluate(actor: UserActor, a: AssignmentRow, conn: DbOrTx = db()): Promise<boolean> {
  if (actor.userId === a.userId) return false;
  if (hasRole(actor, "trainer") && a.trainerUserId === actor.userId) return true;
  return hasRole(actor, "section_manager") && (await isPersonInScope(actor, a.userId, conn));
}

async function canSecondSign(actor: UserActor, a: AssignmentRow, r: ResultRow, conn: DbOrTx = db()): Promise<boolean> {
  if (actor.userId === a.userId || actor.userId === r.evaluatorId) return false;
  return hasRole(actor, "section_manager") && (await isPersonInScope(actor, a.userId, conn));
}

async function loadModule(conn: DbOrTx, assignmentModuleId: string, kind: "practice" | "practice_exam") {
  const [row] = await conn
    .select({ am: assignmentModules, a: assignments })
    .from(assignmentModules)
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .where(eq(assignmentModules.id, assignmentModuleId))
    .limit(1);
  if (!row || row.am.kind !== kind) throw new NotFoundError("module");
  return row;
}

async function assertCanView(actor: UserActor, a: AssignmentRow, conn: DbOrTx = db()) {
  if (!(await canViewPerson(actor, a.userId, conn))) throw new NotFoundError("assignment");
}

async function validatePhotos(conn: DbOrTx, actor: UserActor, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length > MAX_PHOTOS) throw new ValidationError("too_many_photos");
  if (unique.length === 0) return [];
  const rows = await conn.select({ id: mediaAssets.id, kind: mediaAssets.kind, createdBy: mediaAssets.createdBy }).from(mediaAssets).where(inArray(mediaAssets.id, unique));
  if (rows.length !== unique.length || rows.some((r) => r.kind !== "image" || r.createdBy !== actor.userId)) throw new ValidationError("asset_invalid");
  return unique;
}

function cleanNote(note: string | null | undefined): string | null {
  const n = note?.trim() ?? "";
  if (n.length > MAX_NOTE) throw new ValidationError("comment_too_long");
  return n || null;
}

async function marksFor(conn: DbOrTx, assignmentModuleIds: string[]) {
  if (assignmentModuleIds.length === 0) return [];
  const marker = alias(users, "marker");
  return conn
    .select({ m: practiceMarks, markedByName: marker.name })
    .from(practiceMarks)
    .innerJoin(marker, eq(marker.id, practiceMarks.markedBy))
    .where(inArray(practiceMarks.assignmentModuleId, assignmentModuleIds))
    .orderBy(asc(practiceMarks.markedAt), asc(practiceMarks.id));
}

// ---------------------------------------------------------------------------
// Pratik eğitim görünümü (Ekran 5 kursiyer, Ekran 6 eğitmen)
// ---------------------------------------------------------------------------

export type PracticeMarkView = {
  id: string;
  level: PracticeLevel;
  direction: "up" | "down";
  note: string | null;
  photoAssetIds: string[];
  source: "trainer" | "exam_fail" | "readiness";
  markedByName: string;
  markedAt: Date;
};

export type PracticeTaskView = {
  taskId: string;
  title: string;
  description: string | null;
  isCritical: boolean;
  level: PracticeLevel | null;
  next: PracticeLevel | null;
  lower: PracticeLevel[];
  history: PracticeMarkView[];
};

export type PracticeModuleView = {
  assignmentModuleId: string;
  assignmentId: string;
  moduleId: string;
  title: string;
  status: ModuleRow["status"];
  trainee: { userId: string; name: string; sicilNo: string | null; positionName: string | null };
  canMark: boolean;
  open: boolean;
  tasks: PracticeTaskView[];
  independent: number;
};

async function buildPracticeView(actor: UserActor, am: ModuleRow, a: AssignmentRow, conn: DbOrTx = db()): Promise<PracticeModuleView> {
  const taskIds = am.pinnedTaskIds;
  const tasks = taskIds.length ? await conn.select().from(practiceTasks).where(inArray(practiceTasks.id, taskIds)) : [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const marks = await marksFor(conn, [am.id]);
  const levels = currentLevels(marks.map((x) => ({ practiceTaskId: x.m.practiceTaskId, level: x.m.level })));
  const [person] = await conn
    .select({ name: users.name, sicilNo: users.username, positionName: positions.name })
    .from(users)
    .leftJoin(personnel, eq(personnel.userId, users.id))
    .leftJoin(positions, eq(positions.id, personnel.positionId))
    .where(eq(users.id, a.userId))
    .limit(1);
  const open = a.status === "active" && ["available", "in_progress", "review_required"].includes(am.status);
  const views = taskIds
    .map((id) => byId.get(id))
    .filter((t) => !!t)
    .map((t) => {
      const level = levels.get(t.id) ?? null;
      return {
        taskId: t.id,
        title: t.title,
        description: t.description,
        isCritical: t.isCritical,
        level,
        next: nextLevel(level),
        lower: lowerLevels(level),
        history: marks
          .filter((x) => x.m.practiceTaskId === t.id)
          .map((x) => ({
            id: x.m.id,
            level: x.m.level,
            direction: x.m.direction,
            note: x.m.note,
            photoAssetIds: x.m.photoAssetIds,
            source: x.m.source,
            markedByName: x.markedByName,
            markedAt: x.m.markedAt,
          }))
          .reverse(),
      };
    });
  return {
    assignmentModuleId: am.id,
    assignmentId: a.id,
    moduleId: am.moduleId,
    title: am.title,
    status: am.status,
    trainee: { userId: a.userId, name: person?.name ?? "—", sicilNo: person?.sicilNo ?? null, positionName: person?.positionName ?? null },
    canMark: open && (await canEvaluate(actor, a, conn)),
    open,
    tasks: views,
    independent: views.filter((v) => v.level === "independent").length,
  };
}

export async function practiceModule(actor: Actor, assignmentModuleId: string): Promise<PracticeModuleView> {
  assertUser(actor);
  const { am, a } = await loadModule(db(), assignmentModuleId, "practice");
  await assertCanView(actor, a);
  return buildPracticeView(actor, am, a);
}

/** Kursiyerin güncel atamasındaki pratik modüller (Ekran 5). */
export async function myPractice(actor: Actor): Promise<PracticeModuleView[]> {
  assertUser(actor);
  const rows = await db()
    .select({ am: assignmentModules, a: assignments })
    .from(assignmentModules)
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .where(and(eq(assignments.userId, actor.userId), eq(assignmentModules.kind, "practice"), ne(assignments.status, "cancelled"), ne(assignments.status, "completed")))
    .orderBy(desc(assignments.createdAt), asc(assignmentModules.sortOrder));
  const latest = rows[0]?.a.id;
  const out: PracticeModuleView[] = [];
  for (const r of rows.filter((x) => x.a.id === latest)) out.push(await buildPracticeView(actor, r.am, r.a));
  return out;
}

// ---------------------------------------------------------------------------
// İşaretleme (FG-5.2)
// ---------------------------------------------------------------------------

export async function markTask(
  actor: Actor,
  assignmentModuleId: string,
  taskId: string,
  input: { level: PracticeLevel; note: string | null; photoAssetIds: string[] },
): Promise<{ moduleCompleted: boolean }> {
  assertUser(actor);
  return withActor(actor, async (tx) => {
    const { am, a } = await loadModule(tx, assignmentModuleId, "practice");
    if (a.userId === actor.userId) throw new ForbiddenError("self_action");
    if (!(await canEvaluate(actor, a, tx))) throw new ForbiddenError("practice.mark");
    if (a.status !== "active" || !["available", "in_progress", "review_required"].includes(am.status)) throw new ValidationError("practice_module_closed");
    if (!am.pinnedTaskIds.includes(taskId)) throw new NotFoundError("task");

    // Aynı göreve eşzamanlı işaretleme sırayı bozmasın
    await tx.select({ id: assignmentModules.id }).from(assignmentModules).where(eq(assignmentModules.id, am.id)).for("update");
    const marks = await tx
      .select({ practiceTaskId: practiceMarks.practiceTaskId, level: practiceMarks.level })
      .from(practiceMarks)
      .where(eq(practiceMarks.assignmentModuleId, am.id))
      .orderBy(asc(practiceMarks.markedAt), asc(practiceMarks.id));
    const levels = currentLevels(marks);
    const note = cleanNote(input.note);
    const check = checkMark(levels.get(taskId) ?? null, input.level, note);
    if (!check.ok) throw new ValidationError(check.error);
    const photos = await validatePhotos(tx, actor, input.photoAssetIds);
    await tx.insert(practiceMarks).values({
      assignmentModuleId: am.id,
      practiceTaskId: taskId,
      level: input.level,
      direction: check.direction,
      note,
      photoAssetIds: photos,
      markedBy: actor.userId,
    });
    levels.set(taskId, input.level);
    if (am.status === "available") await tx.update(assignmentModules).set({ status: "in_progress", startedAt: am.startedAt ?? new Date() }).where(eq(assignmentModules.id, am.id));
    if (allIndependent(am.pinnedTaskIds, levels)) {
      await completeModule(tx, am.id, "online");
      return { moduleCompleted: true };
    }
    return { moduleCompleted: false };
  });
}

// ---------------------------------------------------------------------------
// Eğitmen paneli (Ekran 6)
// ---------------------------------------------------------------------------

export type TraineeOverview = {
  assignmentId: string;
  userId: string;
  name: string;
  positionName: string | null;
  practice: { assignmentModuleId: string; title: string; status: ModuleRow["status"]; independent: number; total: number }[];
  exams: { assignmentModuleId: string; title: string; status: ModuleRow["status"]; openResultId: string | null; openStatus: ResultRow["status"] | null }[];
};

/** Değerlendirebildiğim kursiyerler: atamada eğitmeni olduklarım (bölüm sorumlusu için kapsamındakiler). */
export async function evaluatorOverview(actor: Actor): Promise<TraineeOverview[]> {
  assertUser(actor);
  const rows = await db()
    .select({ a: assignments, name: users.name, positionName: positions.name })
    .from(assignments)
    .innerJoin(users, eq(users.id, assignments.userId))
    .leftJoin(positions, eq(positions.id, assignments.positionId))
    .where(and(eq(assignments.status, "active"), hasRole(actor, "section_manager") ? sql`true` : eq(assignments.trainerUserId, actor.userId)))
    .orderBy(asc(users.name));
  const mine: typeof rows = [];
  for (const r of rows) if (await canEvaluate(actor, r.a)) mine.push(r);
  if (mine.length === 0) return [];
  const mods = await db()
    .select()
    .from(assignmentModules)
    .where(and(inArray(assignmentModules.assignmentId, mine.map((r) => r.a.id)), inArray(assignmentModules.kind, ["practice", "practice_exam"])))
    .orderBy(asc(assignmentModules.sortOrder));
  const practiceIds = mods.filter((m) => m.kind === "practice").map((m) => m.id);
  const marks = await db()
    .select({ amId: practiceMarks.assignmentModuleId, practiceTaskId: practiceMarks.practiceTaskId, level: practiceMarks.level })
    .from(practiceMarks)
    .where(practiceIds.length ? inArray(practiceMarks.assignmentModuleId, practiceIds) : sql`false`)
    .orderBy(asc(practiceMarks.markedAt), asc(practiceMarks.id));
  const examIds = mods.filter((m) => m.kind === "practice_exam").map((m) => m.id);
  const openForms = examIds.length
    ? await db()
        .select({ id: practicalExamResults.id, amId: practicalExamResults.assignmentModuleId, status: practicalExamResults.status })
        .from(practicalExamResults)
        .where(and(inArray(practicalExamResults.assignmentModuleId, examIds), inArray(practicalExamResults.status, ["draft", "awaiting_second_signature"])))
    : [];
  return mine.map((r) => ({
    assignmentId: r.a.id,
    userId: r.a.userId,
    name: r.name,
    positionName: r.positionName,
    practice: mods
      .filter((m) => m.assignmentId === r.a.id && m.kind === "practice")
      .map((m) => {
        const levels = currentLevels(marks.filter((x) => x.amId === m.id));
        return {
          assignmentModuleId: m.id,
          title: m.title,
          status: m.status,
          independent: m.pinnedTaskIds.filter((t) => levels.get(t) === "independent").length,
          total: m.pinnedTaskIds.length,
        };
      }),
    exams: mods
      .filter((m) => m.assignmentId === r.a.id && m.kind === "practice_exam")
      .map((m) => {
        const f = openForms.find((x) => x.amId === m.id);
        return { assignmentModuleId: m.id, title: m.title, status: m.status, openResultId: f?.id ?? null, openStatus: f?.status ?? null };
      }),
  }));
}

// ---------------------------------------------------------------------------
// Pratik sınav (FG-6.2, Ekran 7)
// ---------------------------------------------------------------------------

export type PracticalRules = { passScore: number; maxAttempts: number };

async function rulesFor(am: ModuleRow): Promise<PracticalRules> {
  const d = (await planDefaults()).practice_exam;
  const s = am.settings as Partial<PracticalRules>;
  return { passScore: s.passScore ?? d.passScore, maxAttempts: s.maxAttempts ?? d.maxAttempts };
}

async function practicalStats(conn: DbOrTx, am: ModuleRow) {
  const results = await conn.select().from(practicalExamResults).where(eq(practicalExamResults.assignmentModuleId, am.id)).orderBy(desc(practicalExamResults.attemptNo));
  const [grants] = await conn
    .select({ n: sql<number>`coalesce(sum(${attemptGrants.extraAttempts}), 0)::int` })
    .from(attemptGrants)
    .where(eq(attemptGrants.assignmentModuleId, am.id));
  const final = results.filter((r) => r.status === "final");
  return { results, final, extra: Number(grants?.n ?? 0), open: results.find((r) => r.status === "draft" || r.status === "awaiting_second_signature") ?? null };
}

/** Kriterler (karar #69): atamada sınavdan önce gelen pratik modüllerin sabit görevleri. */
async function criteriaFor(conn: DbOrTx, am: ModuleRow): Promise<PracticalCriterion[]> {
  const mods = await conn
    .select()
    .from(assignmentModules)
    .where(and(eq(assignmentModules.assignmentId, am.assignmentId), eq(assignmentModules.kind, "practice")))
    .orderBy(asc(assignmentModules.sortOrder));
  const taskIds = [...new Set(mods.filter((m) => m.sortOrder < am.sortOrder).flatMap((m) => m.pinnedTaskIds))];
  if (taskIds.length === 0) return [];
  const tasks = await conn.select().from(practiceTasks).where(inArray(practiceTasks.id, taskIds));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return taskIds.flatMap((id) => {
    const t = byId.get(id);
    return t ? [{ taskId: t.id, title: t.title, isCritical: t.isCritical, result: null, note: null }] : [];
  });
}

export type PracticalBlock = "locked" | "completed" | "no_attempts" | "no_criteria" | null;

export type PracticalExamInfo = {
  assignmentModuleId: string;
  title: string;
  status: ModuleRow["status"];
  rules: PracticalRules;
  used: number;
  left: number;
  block: PracticalBlock;
  open: { id: string; status: ResultRow["status"] } | null;
  canEvaluate: boolean;
  history: { id: string; attemptNo: number; status: ResultRow["status"]; score: number | null; passed: boolean | null; createdAt: Date }[];
};

export async function practicalExamInfo(actor: Actor, assignmentModuleId: string): Promise<PracticalExamInfo> {
  assertUser(actor);
  const { am, a } = await loadModule(db(), assignmentModuleId, "practice_exam");
  await assertCanView(actor, a);
  const rules = await rulesFor(am);
  const { results, final, extra, open } = await practicalStats(db(), am);
  const left = attemptsLeft(rules.maxAttempts, extra, final.length);
  let block: PracticalBlock = null;
  if (isDone(am.status)) block = "completed";
  else if (open) block = null;
  else if (am.status === "locked" || a.status !== "active") block = "locked";
  else if (left <= 0) block = "no_attempts";
  else if ((await criteriaFor(db(), am)).length === 0) block = "no_criteria";
  return {
    assignmentModuleId: am.id,
    title: am.title,
    status: am.status,
    rules,
    used: final.length,
    left,
    block,
    open: open ? { id: open.id, status: open.status } : null,
    canEvaluate: await canEvaluate(actor, a),
    history: results.map((r) => ({ id: r.id, attemptNo: r.attemptNo, status: r.status, score: r.score, passed: r.passed, createdAt: r.createdAt })),
  };
}

/** Değerlendirmeyi başlatır (taslak form). Açık form varsa onu döndürür. */
export async function startPracticalExam(actor: Actor, assignmentModuleId: string): Promise<{ id: string }> {
  assertUser(actor);
  return withActor(actor, async (tx) => {
    const { am, a } = await loadModule(tx, assignmentModuleId, "practice_exam");
    if (a.userId === actor.userId) throw new ForbiddenError("self_action");
    if (!(await canEvaluate(actor, a, tx))) throw new ForbiddenError("practice.mark");
    await tx.select({ id: assignmentModules.id }).from(assignmentModules).where(eq(assignmentModules.id, am.id)).for("update");
    const { results, final, extra, open } = await practicalStats(tx, am);
    if (open) return { id: open.id };
    if (a.status !== "active" || !["available", "in_progress"].includes(am.status)) throw new ValidationError("module_locked");
    const rules = await rulesFor(am);
    if (attemptsLeft(rules.maxAttempts, extra, final.length) <= 0) throw new ValidationError("exam_no_attempts");
    const criteria = await criteriaFor(tx, am);
    if (criteria.length === 0) throw new ValidationError("practical_no_criteria");
    const [row] = await tx
      .insert(practicalExamResults)
      .values({ assignmentModuleId: am.id, attemptNo: (results[0]?.attemptNo ?? 0) + 1, criteria, passScore: rules.passScore, evaluatorId: actor.userId })
      .returning({ id: practicalExamResults.id });
    if (am.status === "available") await tx.update(assignmentModules).set({ status: "in_progress", startedAt: am.startedAt ?? new Date() }).where(eq(assignmentModules.id, am.id));
    return { id: row!.id };
  });
}

async function loadResult(conn: DbOrTx, id: string) {
  const [row] = await conn
    .select({ r: practicalExamResults, am: assignmentModules, a: assignments })
    .from(practicalExamResults)
    .innerJoin(assignmentModules, eq(assignmentModules.id, practicalExamResults.assignmentModuleId))
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .where(eq(practicalExamResults.id, id))
    .limit(1);
  if (!row) throw new NotFoundError("practical_exam");
  return row;
}

export type SignatureView = { role: "trainee" | "trainer" | "manager"; signerName: string; signedAt: Date; imageAssetId: string };

export type PracticalExamView = {
  id: string;
  assignmentModuleId: string;
  assignmentId: string;
  moduleId: string;
  title: string;
  attemptNo: number;
  status: ResultRow["status"];
  criteria: PracticalCriterion[];
  passScore: number;
  score: number | null;
  passed: boolean | null;
  failReason: "score" | "critical" | null;
  note: string | null;
  photoAssetIds: string[];
  trainee: { userId: string; name: string };
  evaluatorName: string;
  managerName: string | null;
  returnReason: string | null;
  submittedAt: Date | null;
  finalizedAt: Date | null;
  signatures: SignatureView[];
  can: { edit: boolean; sign: boolean; secondSign: boolean };
};

export async function getPracticalExam(actor: Actor, id: string): Promise<PracticalExamView> {
  assertUser(actor);
  const { r, am, a } = await loadResult(db(), id);
  await assertCanView(actor, a);
  const names = await db()
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, [a.userId, r.evaluatorId, ...(r.managerUserId ? [r.managerUserId] : [])]));
  const nameOf = (uid: string | null) => names.find((n) => n.id === uid)?.name ?? null;
  const signer = alias(users, "signer");
  const sigs = await db()
    .select({ s: signatures, signerName: signer.name })
    .from(signatures)
    .innerJoin(signer, eq(signer.id, signatures.signerUserId))
    .where(and(eq(signatures.subjectType, SUBJECT), eq(signatures.subjectId, r.id)))
    .orderBy(asc(signatures.signedAt));
  const isEvaluator = r.evaluatorId === actor.userId && (await canEvaluate(actor, a));
  return {
    id: r.id,
    assignmentModuleId: am.id,
    assignmentId: a.id,
    moduleId: am.moduleId,
    title: am.title,
    attemptNo: r.attemptNo,
    status: r.status,
    criteria: r.criteria,
    passScore: r.passScore,
    score: r.score,
    passed: r.passed,
    failReason: r.failReason,
    note: r.note,
    photoAssetIds: r.photoAssetIds,
    trainee: { userId: a.userId, name: nameOf(a.userId) ?? "—" },
    evaluatorName: nameOf(r.evaluatorId) ?? "—",
    managerName: nameOf(r.managerUserId),
    returnReason: r.returnReason,
    submittedAt: r.submittedAt,
    finalizedAt: r.finalizedAt,
    signatures: sigs.map((x) => ({ role: x.s.role, signerName: x.signerName, signedAt: x.s.signedAt, imageAssetId: x.s.imageAssetId })),
    can: {
      edit: r.status === "draft" && isEvaluator,
      sign: r.status === "draft" && isEvaluator,
      secondSign: r.status === "awaiting_second_signature" && (await canSecondSign(actor, a, r)),
    },
  };
}

export type PracticalDraftInput = {
  criteria: { taskId: string; result: "pass" | "fail" | null; note: string | null }[];
  note: string | null;
  photoAssetIds: string[];
};

async function editableDraft(tx: Tx, actor: UserActor, id: string) {
  const row = await loadResult(tx, id);
  await tx.select({ id: practicalExamResults.id }).from(practicalExamResults).where(eq(practicalExamResults.id, id)).for("update");
  if (row.r.status !== "draft") throw new ValidationError("practical_not_draft");
  if (row.r.evaluatorId !== actor.userId || !(await canEvaluate(actor, row.a, tx))) throw new ForbiddenError("practice.mark");
  return row;
}

function mergeCriteria(current: PracticalCriterion[], input: PracticalDraftInput["criteria"]): PracticalCriterion[] {
  const byTask = new Map(input.map((c) => [c.taskId, c]));
  if (input.some((c) => !current.some((x) => x.taskId === c.taskId))) throw new ValidationError("invalid_input");
  return current.map((c) => {
    const x = byTask.get(c.taskId);
    return x ? { ...c, result: x.result, note: cleanNote(x.note) } : c;
  });
}

/** Taslağı kaydeder (tablette yarıda kalırsa devam edilir; karar #71). */
export async function savePracticalDraft(actor: Actor, id: string, input: PracticalDraftInput): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    const { r } = await editableDraft(tx, actor, id);
    const criteria = mergeCriteria(r.criteria, input.criteria);
    const photos = await validatePhotos(tx, actor, input.photoAssetIds);
    await tx.update(practicalExamResults).set({ criteria, note: cleanNote(input.note), photoAssetIds: photos }).where(eq(practicalExamResults.id, r.id));
  });
}

export async function discardPracticalDraft(actor: Actor, id: string): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    const { r } = await editableDraft(tx, actor, id);
    await tx.delete(practicalExamResults).where(eq(practicalExamResults.id, r.id));
  });
}

/** İmzalanan içerik: form kimliği, deneme, kursiyer, kriterler, puan ve sonuç. */
function signedSubject(r: ResultRow, traineeUserId: string) {
  return {
    id: r.id,
    attemptNo: r.attemptNo,
    traineeUserId,
    evaluatorId: r.evaluatorId,
    criteria: r.criteria,
    passScore: r.passScore,
    score: r.score,
    passed: r.passed,
    failReason: r.failReason,
    note: r.note,
    photoAssetIds: r.photoAssetIds,
  };
}

type Meta = { ip: string | null; userAgent: string | null };

/**
 * Kursiyer + eğitmen imzası (1. imza). Kursiyer eğitmenin cihazında imzalar (karar #71).
 * Bundan sonra kriterler değişmez (trigger); form bölüm sorumlusunun 2. imzasını bekler.
 */
export async function signPracticalExam(
  actor: Actor,
  id: string,
  input: PracticalDraftInput & { traineeSignature: string; trainerSignature: string } & Meta,
): Promise<void> {
  assertUser(actor);
  const traineeImage = await uploadSignatureImage(input.traineeSignature);
  const trainerImage = await uploadSignatureImage(input.trainerSignature);
  await withActor(actor, async (tx) => {
    const { r, a } = await editableDraft(tx, actor, id);
    const criteria = mergeCriteria(r.criteria, input.criteria);
    const result = scorePractical(criteria, r.passScore);
    if (!result) throw new ValidationError("practical_incomplete");
    const photos = await validatePhotos(tx, actor, input.photoAssetIds);
    const signed: ResultRow = { ...r, criteria, note: cleanNote(input.note), photoAssetIds: photos, score: result.score, passed: result.passed, failReason: result.failReason };
    const hash = subjectHash(signedSubject(signed, a.userId));
    const base = { subjectType: SUBJECT, subjectId: r.id, hash, capturedBy: actor.userId, ip: input.ip, userAgent: input.userAgent };
    const traineeSig = await createSignature(tx, { ...base, image: traineeImage, signerUserId: a.userId, role: "trainee" });
    const trainerSig = await createSignature(tx, { ...base, image: trainerImage, signerUserId: actor.userId, role: "trainer" });
    await tx
      .update(practicalExamResults)
      .set({
        criteria,
        note: signed.note,
        photoAssetIds: photos,
        score: result.score,
        passed: result.passed,
        failReason: result.failReason,
        traineeSignatureId: traineeSig,
        trainerSignatureId: trainerSig,
        submittedAt: new Date(),
        status: "awaiting_second_signature",
      })
      .where(eq(practicalExamResults.id, r.id));
    // Bildirim: kapsamdaki bölüm sorumlularına 2. imza (değerlendiren ve kursiyer hariç)
    const [u] = await tx.select({ name: users.name }).from(users).where(eq(users.id, a.userId)).limit(1);
    await notify(tx, {
      kind: "second_signature_pending",
      userIds: await sectionManagersForPerson(tx, a.userId),
      subjectKey: `practical:${r.id}`,
      link: `/trainer/evaluations/${r.id}`,
      params: { name: u?.name ?? "" },
      exclude: [a.userId, actor.userId],
    });
  });
}

async function awaitingSecond(tx: Tx, actor: UserActor, id: string) {
  const row = await loadResult(tx, id);
  await tx.select({ id: practicalExamResults.id }).from(practicalExamResults).where(eq(practicalExamResults.id, id)).for("update");
  if (row.r.status !== "awaiting_second_signature") throw new ValidationError("practical_not_awaiting");
  if (row.a.userId === actor.userId || row.r.evaluatorId === actor.userId) throw new ForbiddenError("self_action");
  if (!(await canSecondSign(actor, row.a, row.r, tx))) throw new ForbiddenError("practice.second_signature");
  return row;
}

/** Bölüm sorumlusu 2. imzası: sonuç kesinleşir ve uygulanır. */
export async function secondSignPracticalExam(actor: Actor, id: string, input: { signature: string } & Meta): Promise<void> {
  assertUser(actor);
  const image = await uploadSignatureImage(input.signature);
  await withActor(actor, async (tx) => {
    const { r, am, a } = await awaitingSecond(tx, actor, id);
    const hash = subjectHash(signedSubject(r, a.userId));
    const sig = await createSignature(tx, { image, subjectType: SUBJECT, subjectId: r.id, hash, signerUserId: actor.userId, capturedBy: actor.userId, role: "manager", ip: input.ip, userAgent: input.userAgent });
    await tx
      .update(practicalExamResults)
      .set({ managerUserId: actor.userId, managerSignatureId: sig, status: "final", finalizedAt: new Date() })
      .where(eq(practicalExamResults.id, r.id));
    await resolveNotifications(tx, `practical:${r.id}`, "second_signature_pending");
    await applyResult(tx, actor, { ...r, status: "final" }, am);
  });
}

/** Geri gönderme (karar #71): gerekçe zorunlu; deneme hak saymaz, yeni form gerekir. */
export async function returnPracticalExam(actor: Actor, id: string, reason: string): Promise<void> {
  assertUser(actor);
  const text = reason.trim();
  if (text.length < 3) throw new ValidationError("reject_comment_required");
  if (text.length > MAX_NOTE) throw new ValidationError("comment_too_long");
  await withActor(actor, async (tx) => {
    const { r } = await awaitingSecond(tx, actor, id);
    await tx
      .update(practicalExamResults)
      .set({ managerUserId: actor.userId, returnReason: text, status: "returned", finalizedAt: new Date() })
      .where(eq(practicalExamResults.id, r.id));
    await resolveNotifications(tx, `practical:${r.id}`, "second_signature_pending");
  });
}

/**
 * Kesinleşen sonucu uygular. Geçti: sınav modülü tamamlanır. Kaldı (karar #72): "Yapamadı" görevleri
 * "gözetiminde yapar"a düşer, ilgili pratik modüller "tekrar gerekli" olur, sınav kilitlenir; haklar bittiyse atama karar bekler.
 */
async function applyResult(tx: Tx, actor: UserActor, r: ResultRow, am: ModuleRow): Promise<void> {
  const [owner] = await tx.select({ userId: assignments.userId }).from(assignments).where(eq(assignments.id, am.assignmentId)).limit(1);
  await notify(tx, { kind: "exam_result", userIds: [owner?.userId], subjectKey: `practical:${r.id}`, link: `/trainer/evaluations/${r.id}`, params: { title: am.title } });
  if (r.passed) {
    await completeModule(tx, am.id, "online");
    return;
  }
  const failed = new Set(r.criteria.filter((c) => c.result === "fail").map((c) => c.taskId));
  const practiceMods = (
    await tx
      .select()
      .from(assignmentModules)
      .where(and(eq(assignmentModules.assignmentId, am.assignmentId), eq(assignmentModules.kind, "practice")))
  ).filter((m) => m.sortOrder < am.sortOrder && m.pinnedTaskIds.some((t) => failed.has(t)));
  for (const m of practiceMods) {
    const marks = await tx
      .select({ practiceTaskId: practiceMarks.practiceTaskId, level: practiceMarks.level })
      .from(practiceMarks)
      .where(eq(practiceMarks.assignmentModuleId, m.id))
      .orderBy(asc(practiceMarks.markedAt), asc(practiceMarks.id));
    const levels = currentLevels(marks);
    const down = m.pinnedTaskIds.filter((t) => failed.has(t) && levels.get(t) === "independent");
    if (down.length) {
      await tx.insert(practiceMarks).values(
        down.map((t) => ({ assignmentModuleId: m.id, practiceTaskId: t, level: "supervised" as const, direction: "down" as const, source: "exam_fail" as const, examResultId: r.id, markedBy: actor.userId })),
      );
    }
    await tx
      .update(assignmentModules)
      .set({ status: "review_required", completedAt: null, completedVia: null, expiresAt: null })
      .where(eq(assignmentModules.id, m.id));
  }
  await tx.update(assignmentModules).set({ status: "locked", unlockedAt: null }).where(eq(assignmentModules.id, am.id));
  const rules = await rulesFor(am);
  const { final, extra } = await practicalStats(tx, am);
  if (attemptsLeft(rules.maxAttempts, extra, final.length) <= 0) {
    await tx.update(assignments).set({ status: "awaiting_decision" }).where(and(eq(assignments.id, am.assignmentId), eq(assignments.status, "active")));
    if (owner) await notifyAllAttemptsFailed(tx, { assignmentId: am.assignmentId, traineeUserId: owner.userId, examTitle: am.title, isOhs: am.isOhs });
    return;
  }
  await refreshAssignment(tx, am.assignmentId);
}

// ---------------------------------------------------------------------------
// Bölüm sorumlusu: 2. imza kuyruğu; yönetici görünümleri
// ---------------------------------------------------------------------------

export type SecondSignatureItem = { id: string; title: string; attemptNo: number; traineeName: string; evaluatorName: string; score: number | null; passed: boolean | null; submittedAt: Date };

export async function secondSignatureQueue(actor: Actor): Promise<SecondSignatureItem[]> {
  assertUser(actor);
  if (!hasRole(actor, "section_manager")) return [];
  const trainee = alias(users, "trainee");
  const evaluator = alias(users, "evaluator");
  const rows = await db()
    .select({ r: practicalExamResults, a: assignments, title: assignmentModules.title, traineeName: trainee.name, evaluatorName: evaluator.name })
    .from(practicalExamResults)
    .innerJoin(assignmentModules, eq(assignmentModules.id, practicalExamResults.assignmentModuleId))
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .innerJoin(trainee, eq(trainee.id, assignments.userId))
    .innerJoin(evaluator, eq(evaluator.id, practicalExamResults.evaluatorId))
    .where(eq(practicalExamResults.status, "awaiting_second_signature"))
    .orderBy(asc(practicalExamResults.submittedAt));
  const out: SecondSignatureItem[] = [];
  for (const x of rows) {
    if (await canSecondSign(actor, x.a, x.r)) {
      out.push({ id: x.r.id, title: x.title, attemptNo: x.r.attemptNo, traineeName: x.traineeName, evaluatorName: x.evaluatorName, score: x.r.score, passed: x.r.passed, submittedAt: x.r.submittedAt! });
    }
  }
  return out;
}

export type PracticalSummary = { id: string; moduleTitle: string; attemptNo: number; status: ResultRow["status"]; score: number | null; passed: boolean | null; evaluatorName: string; submittedAt: Date | null };

/** Atamadaki pratik sınav formları (yönetici görünümü). Kursiyerin kendisi kendi sonucunu sınav ekranından görür. */
export async function practicalExamsForAssignment(actor: Actor, assignmentId: string): Promise<PracticalSummary[]> {
  assertUser(actor);
  const [a] = await db().select({ userId: assignments.userId }).from(assignments).where(eq(assignments.id, assignmentId)).limit(1);
  if (!a || !(await canViewPerson(actor, a.userId))) throw new NotFoundError("assignment");
  const evaluator = alias(users, "evaluator");
  const rows = await db()
    .select({ r: practicalExamResults, moduleTitle: assignmentModules.title, evaluatorName: evaluator.name })
    .from(practicalExamResults)
    .innerJoin(assignmentModules, eq(assignmentModules.id, practicalExamResults.assignmentModuleId))
    .innerJoin(evaluator, eq(evaluator.id, practicalExamResults.evaluatorId))
    .where(and(eq(assignmentModules.assignmentId, assignmentId), or(isNotNull(practicalExamResults.submittedAt), eq(practicalExamResults.status, "draft"))))
    .orderBy(asc(practicalExamResults.attemptNo));
  return rows.map((x) => ({
    id: x.r.id,
    moduleTitle: x.moduleTitle,
    attemptNo: x.r.attemptNo,
    status: x.r.status,
    score: x.r.score,
    passed: x.r.passed,
    evaluatorName: x.evaluatorName,
    submittedAt: x.r.submittedAt,
  }));
}

/**
 * Medya erişimi (karar #73): işaretleme fotoğrafı, sınav formu fotoğrafı ve imza görseli; kişiyi görebilen
 * (kursiyer, eğitmeni, kapsamdaki bölüm sorumlusu, İK) görür.
 */
export async function canViewPracticeAsset(actor: Actor, assetId: string): Promise<boolean> {
  if (actor.kind === "system") return true;
  const owners = new Set<string>();
  const marks = await db()
    .select({ userId: assignments.userId })
    .from(practiceMarks)
    .innerJoin(assignmentModules, eq(assignmentModules.id, practiceMarks.assignmentModuleId))
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .where(sql`${assetId}::uuid = any(${practiceMarks.photoAssetIds})`);
  for (const m of marks) owners.add(m.userId);
  const forms = await db()
    .select({ userId: assignments.userId })
    .from(practicalExamResults)
    .innerJoin(assignmentModules, eq(assignmentModules.id, practicalExamResults.assignmentModuleId))
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .leftJoin(signatures, and(eq(signatures.subjectType, SUBJECT), eq(signatures.subjectId, practicalExamResults.id)))
    .where(or(sql`${assetId}::uuid = any(${practicalExamResults.photoAssetIds})`, eq(signatures.imageAssetId, assetId)));
  for (const f of forms) owners.add(f.userId);
  for (const userId of owners) if (await canViewPerson(actor, userId)) return true;
  return false;
}
