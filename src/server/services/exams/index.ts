import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Actor } from "@/server/authz/actor";
import { assertUser } from "@/server/authz/policy";
import { db, type DbOrTx, type Tx } from "@/server/db/client";
import {
  assignmentModules,
  assignments,
  attemptGrants,
  examAttemptEvents,
  examAttemptItems,
  examAttempts,
  questionVersions,
  users,
} from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { NotFoundError, ValidationError } from "@/server/errors";
import { enqueue } from "@/server/jobs/send";
import { QUEUES } from "@/server/jobs/queues";
import { isDone } from "@/server/state/assignment";
import { attemptsLeft, cooldownUntil, drawQuestions, scoreAttempt, shuffle, topicSummary } from "@/server/state/exam";
import { canViewPerson } from "../assignments";
import { completeModule, refreshAssignment, reopenModule } from "../assignments/engine";
import { planDefaults } from "../positions/plan-settings";
import { poolForModules, poolModuleIds } from "../questions";
import { verifyProctorCode } from "./proctor";

/**
 * Teorik sınav motoru (FG-6.1, SPEC Bölüm 6). Süre sunucuda işler; cevap her seçimde kaydedilir; süre dolunca
 * verilen cevaplarla teslim edilir (worker işi + erişimde kontrol). Kursiyer doğru cevapları görmez.
 */

const ANSWER_GRACE_MS = 5_000;

type AttemptRow = typeof examAttempts.$inferSelect;
type ModuleRow = typeof assignmentModules.$inferSelect;

export type ExamRules = { questionCount: number; durationMin: number; passScore: number; maxAttempts: number; cooldownHours: number; proctorRequired: boolean };

async function rulesFor(am: ModuleRow): Promise<ExamRules> {
  const d = (await planDefaults()).theory_exam;
  return { ...d, ...Object.fromEntries(Object.entries(am.settings).filter(([, v]) => v !== undefined)) } as ExamRules;
}

async function ownExamModule(conn: DbOrTx, actor: Actor & { kind: "user" }, assignmentModuleId: string) {
  const [row] = await conn
    .select({ am: assignmentModules, a: assignments })
    .from(assignmentModules)
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .where(eq(assignmentModules.id, assignmentModuleId))
    .limit(1);
  if (!row || row.a.userId !== actor.userId || row.am.kind !== "theory_exam") throw new NotFoundError("exam");
  return row;
}

/** Havuz modülleri: atamada sınavdan önce gelen teorik modüller (karar #59). */
async function poolModules(conn: DbOrTx, am: ModuleRow): Promise<string[]> {
  const mods = await conn
    .select({ moduleId: assignmentModules.moduleId, kind: assignmentModules.kind })
    .from(assignmentModules)
    .where(eq(assignmentModules.assignmentId, am.assignmentId))
    .orderBy(asc(assignmentModules.sortOrder));
  return poolModuleIds(mods, am.moduleId);
}

async function attemptStats(conn: DbOrTx, am: ModuleRow) {
  const attempts = await conn.select().from(examAttempts).where(eq(examAttempts.assignmentModuleId, am.id)).orderBy(desc(examAttempts.attemptNo));
  const [grants] = await conn
    .select({ n: sql<number>`coalesce(sum(${attemptGrants.extraAttempts}), 0)::int` })
    .from(attemptGrants)
    .where(eq(attemptGrants.assignmentModuleId, am.id));
  return { attempts, extra: Number(grants?.n ?? 0) };
}

// ---------------------------------------------------------------------------
// Sınav bilgisi (kursiyerin modül ekranı)
// ---------------------------------------------------------------------------

export type ExamBlock = "locked" | "cooldown" | "no_attempts" | "pool_insufficient" | "completed" | null;

export type ExamInfo = {
  assignmentModuleId: string;
  rules: ExamRules;
  used: number;
  left: number;
  openAttemptId: string | null;
  cooldownUntil: Date | null;
  block: ExamBlock;
  last: { attemptId: string; score: number; passed: boolean; submittedAt: Date } | null;
};

export async function examInfo(actor: Actor, assignmentModuleId: string): Promise<ExamInfo> {
  assertUser(actor);
  const { am, a } = await ownExamModule(db(), actor, assignmentModuleId);
  const rules = await rulesFor(am);
  const { attempts, extra } = await attemptStats(db(), am);
  const open = attempts.find((x) => !x.submittedAt) ?? null;
  const submitted = attempts.filter((x) => x.submittedAt);
  const lastFailed = submitted.find((x) => x.passed === false)?.submittedAt ?? null;
  const left = attemptsLeft(rules.maxAttempts, extra, attempts.length);
  const until = cooldownUntil(lastFailed, rules.cooldownHours);
  const pool = (await poolForModules(db(), await poolModules(db(), am))).length;
  let block: ExamBlock = null;
  if (isDone(am.status)) block = "completed";
  else if (open) block = null;
  else if (am.status === "locked" || a.status !== "active") block = "locked";
  else if (left <= 0) block = "no_attempts";
  else if (until && until > new Date()) block = "cooldown";
  else if (pool < rules.questionCount) block = "pool_insufficient";
  const last = submitted[0];
  return {
    assignmentModuleId: am.id,
    rules,
    used: attempts.length,
    left,
    openAttemptId: open?.id ?? null,
    cooldownUntil: until && until > new Date() ? until : null,
    block,
    last: last ? { attemptId: last.id, score: last.score!, passed: last.passed!, submittedAt: last.submittedAt! } : null,
  };
}

// ---------------------------------------------------------------------------
// Başlatma
// ---------------------------------------------------------------------------

export async function startExam(
  actor: Actor,
  assignmentModuleId: string,
  input: { code: string | null; ip: string | null; userAgent: string | null },
): Promise<{ attemptId: string }> {
  assertUser(actor);
  return withActor(actor, async (tx) => {
    const { am, a } = await ownExamModule(tx, actor, assignmentModuleId);
    await tx.select({ id: assignmentModules.id }).from(assignmentModules).where(eq(assignmentModules.id, am.id)).for("update");
    const { attempts, extra } = await attemptStats(tx, am);
    const open = attempts.find((x) => !x.submittedAt);
    if (open) {
      if (open.deadlineAt > new Date()) return { attemptId: open.id };
      await finalize(tx, open, "timeout");
    }
    if (a.status !== "active" || am.status === "locked" || isDone(am.status)) throw new ValidationError("module_locked");
    const rules = await rulesFor(am);
    if (attemptsLeft(rules.maxAttempts, extra, attempts.length) <= 0) throw new ValidationError("exam_no_attempts");
    const lastFailed = attempts.find((x) => x.submittedAt && x.passed === false)?.submittedAt ?? null;
    const until = cooldownUntil(lastFailed, rules.cooldownHours);
    if (until && until > new Date()) throw new ValidationError("exam_cooldown", { until: until.toISOString() });

    let proctor: { sessionId: string; proctorUserId: string } | null = null;
    if (rules.proctorRequired) {
      if (!input.code) throw new ValidationError("proctor_code_required");
      proctor = await verifyProctorCode(tx, actor.userId, input.code);
    }

    const pool = await poolForModules(tx, await poolModules(tx, am));
    const drawn = drawQuestions(pool, rules.questionCount);
    if (!drawn) throw new ValidationError("exam_pool_insufficient");

    const now = new Date();
    const deadline = new Date(now.getTime() + rules.durationMin * 60_000);
    const [attempt] = await tx
      .insert(examAttempts)
      .values({
        assignmentModuleId: am.id,
        attemptNo: attempts.length + 1,
        proctorSessionId: proctor?.sessionId ?? null,
        proctorUserId: proctor?.proctorUserId ?? null,
        questionCount: rules.questionCount,
        durationMin: rules.durationMin,
        passScore: rules.passScore,
        startedAt: now,
        deadlineAt: deadline,
        ip: input.ip,
        userAgent: input.userAgent?.slice(0, 500) ?? null,
      })
      .returning();
    await tx.insert(examAttemptItems).values(
      drawn.map((q, i) => ({
        attemptId: attempt!.id,
        sortOrder: i,
        questionVersionId: q.versionId,
        optionOrder: shuffle(Array.from({ length: q.optionCount }, (_, k) => k)),
      })),
    );
    if (am.status === "available") await tx.update(assignmentModules).set({ status: "in_progress", startedAt: am.startedAt ?? now }).where(eq(assignmentModules.id, am.id));
    // Süre dolunca (kursiyer sayfayı kapatmış olsa da) teslim edilir
    await enqueue(QUEUES.examTimeout, { attemptId: attempt!.id }, { startAfter: new Date(deadline.getTime() + 2_000) }).catch(() => null);
    return { attemptId: attempt!.id };
  });
}

// ---------------------------------------------------------------------------
// Deneme ekranı
// ---------------------------------------------------------------------------

export type AttemptQuestion = { itemId: string; stem: string; options: string[]; mediaAssetId: string | null; answer: number | null };

export type AttemptView =
  | {
      state: "open";
      attemptId: string;
      title: string;
      deadlineAt: Date;
      serverNow: Date;
      questions: AttemptQuestion[];
    }
  | {
      state: "submitted";
      attemptId: string;
      title: string;
      assignmentId: string;
      moduleId: string;
      score: number;
      passed: boolean;
      failReason: "score" | "ohs_critical" | null;
      passScore: number;
      submitReason: "user" | "timeout";
      topics: { topic: string; correct: number; total: number }[];
      left: number;
      nextAvailableAt: Date | null;
    };

async function ownAttempt(conn: DbOrTx, actor: Actor & { kind: "user" }, attemptId: string) {
  const [row] = await conn
    .select({ at: examAttempts, am: assignmentModules, a: assignments })
    .from(examAttempts)
    .innerJoin(assignmentModules, eq(assignmentModules.id, examAttempts.assignmentModuleId))
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .where(eq(examAttempts.id, attemptId))
    .limit(1);
  if (!row || row.a.userId !== actor.userId) throw new NotFoundError("exam_attempt");
  return row;
}

export async function getAttempt(actor: Actor, attemptId: string): Promise<AttemptView> {
  assertUser(actor);
  let { at, am, a } = await ownAttempt(db(), actor, attemptId);
  if (!at.submittedAt && at.deadlineAt.getTime() + ANSWER_GRACE_MS < Date.now()) {
    await finalizeExpiredAttempt(at.id);
    ({ at, am, a } = await ownAttempt(db(), actor, attemptId));
  }
  const items = await db()
    .select({ item: examAttemptItems, v: questionVersions })
    .from(examAttemptItems)
    .innerJoin(questionVersions, eq(questionVersions.id, examAttemptItems.questionVersionId))
    .where(eq(examAttemptItems.attemptId, at.id))
    .orderBy(asc(examAttemptItems.sortOrder));

  if (!at.submittedAt) {
    return {
      state: "open",
      attemptId: at.id,
      title: am.title,
      deadlineAt: at.deadlineAt,
      serverNow: new Date(),
      questions: items.map(({ item, v }) => ({
        itemId: item.id,
        stem: v.stem,
        options: item.optionOrder.map((k) => v.options[k]!),
        mediaAssetId: v.mediaAssetId,
        // Kursiyere gösterilen sıradaki indeks
        answer: item.answerIndex === null ? null : item.optionOrder.indexOf(item.answerIndex),
      })),
    };
  }
  const rules = await rulesFor(am);
  const { attempts, extra } = await attemptStats(db(), am);
  const lastFailed = attempts.find((x) => x.submittedAt && x.passed === false)?.submittedAt ?? null;
  const until = cooldownUntil(lastFailed, rules.cooldownHours);
  return {
    state: "submitted",
    attemptId: at.id,
    title: am.title,
    assignmentId: a.id,
    moduleId: am.moduleId,
    score: at.score!,
    passed: at.passed!,
    failReason: at.failReason,
    passScore: at.passScore,
    submitReason: at.submitReason!,
    // Doğru cevaplar gösterilmez; yalnızca konu bazında özet (SPEC 17.1/3)
    topics: topicSummary(items.map(({ item, v }) => ({ topic: v.topic, isCorrect: !!item.isCorrect }))),
    left: attemptsLeft(rules.maxAttempts, extra, attempts.length),
    nextAvailableAt: until && until > new Date() ? until : null,
  };
}

async function openAttemptForWrite(tx: Tx, actor: Actor & { kind: "user" }, attemptId: string) {
  const row = await ownAttempt(tx, actor, attemptId);
  if (row.at.submittedAt) throw new ValidationError("exam_submitted");
  if (row.at.deadlineAt.getTime() + ANSWER_GRACE_MS < Date.now()) throw new ValidationError("exam_time_over");
  return row;
}

/** Cevap (gösterilen şık sırasına göre). Her seçimde kaydedilir. */
export async function answerExam(actor: Actor, attemptId: string, itemId: string, shownIndex: number | null): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    await openAttemptForWrite(tx, actor, attemptId);
    const [item] = await tx.select().from(examAttemptItems).where(and(eq(examAttemptItems.id, itemId), eq(examAttemptItems.attemptId, attemptId))).limit(1);
    if (!item) throw new NotFoundError("exam_item");
    if (shownIndex !== null && (!Number.isInteger(shownIndex) || shownIndex < 0 || shownIndex >= item.optionOrder.length)) throw new ValidationError("invalid_input");
    await tx
      .update(examAttemptItems)
      .set({ answerIndex: shownIndex === null ? null : item.optionOrder[shownIndex]!, answeredAt: new Date() })
      .where(eq(examAttemptItems.id, item.id));
  });
}

/** Sekmeden çıkış vb. olaylar (kopya önlemi; sınavı bitirmez) ve sesli okuma kullanımı. */
export async function recordExamEvent(actor: Actor, attemptId: string, kind: "tab_hidden" | "tab_visible" | "blur" | "reconnect" | "tts"): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    const { at } = await ownAttempt(tx, actor, attemptId);
    if (at.submittedAt) return;
    if (kind === "tts") {
      if (!at.ttsUsed) await tx.update(examAttempts).set({ ttsUsed: true }).where(eq(examAttempts.id, at.id));
      return;
    }
    await tx.insert(examAttemptEvents).values({ attemptId: at.id, kind });
    if (kind === "tab_hidden") await tx.update(examAttempts).set({ tabLeaveCount: at.tabLeaveCount + 1 }).where(eq(examAttempts.id, at.id));
  });
}

export async function submitExam(actor: Actor, attemptId: string): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    const { at } = await ownAttempt(tx, actor, attemptId);
    if (at.submittedAt) return;
    await tx.select({ id: examAttempts.id }).from(examAttempts).where(eq(examAttempts.id, at.id)).for("update");
    const late = at.deadlineAt.getTime() + ANSWER_GRACE_MS < Date.now();
    await finalize(tx, at, late ? "timeout" : "user");
  });
}

/** Süresi dolan açık denemeyi teslim eder (worker işi ve erişimde). */
export async function finalizeExpiredAttempt(attemptId: string): Promise<void> {
  await withActor({ kind: "system", name: "exam:timeout" }, async (tx) => {
    const [at] = await tx.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).limit(1).for("update");
    if (!at || at.submittedAt || at.deadlineAt.getTime() > Date.now()) return;
    await finalize(tx, at, "timeout");
  });
}

/**
 * Puanlar ve teslim eder. Geçerse modül tamamlanır. Kalırsa: ilgili teorik modüller "tekrar gerekli" olur,
 * sınav modülü kilitlenir (modüller yeniden tamamlanınca açılır; bekleme süresi başlatmada kontrol edilir).
 * Tüm haklar bittiyse atama "karar bekliyor" olur — karar insana bırakılır (1.7).
 */
async function finalize(tx: Tx, at: AttemptRow, reason: "user" | "timeout"): Promise<void> {
  const items = await tx
    .select({ id: examAttemptItems.id, answerIndex: examAttemptItems.answerIndex, correctIndex: questionVersions.correctIndex, isOhsCritical: questionVersions.isOhsCritical })
    .from(examAttemptItems)
    .innerJoin(questionVersions, eq(questionVersions.id, examAttemptItems.questionVersionId))
    .where(eq(examAttemptItems.attemptId, at.id));
  const scored = items.map((i) => ({ ...i, isCorrect: i.answerIndex !== null && i.answerIndex === i.correctIndex }));
  for (const i of scored) await tx.update(examAttemptItems).set({ isCorrect: i.isCorrect }).where(eq(examAttemptItems.id, i.id));
  const result = scoreAttempt(scored, at.passScore);
  await tx
    .update(examAttempts)
    .set({ submittedAt: new Date(), submitReason: reason, score: result.score, passed: result.passed, failReason: result.failReason })
    .where(eq(examAttempts.id, at.id));

  const [am] = await tx.select().from(assignmentModules).where(eq(assignmentModules.id, at.assignmentModuleId)).limit(1);
  if (!am) return;
  if (result.passed) {
    await completeModule(tx, am.id, "online");
    return;
  }
  // İlgili teorik modüller: sınavın ön koşulu olan en yakın teorik modüller (SPEC 17.1/4)
  const mods = await tx.select().from(assignmentModules).where(eq(assignmentModules.assignmentId, am.assignmentId));
  const byModule = new Map(mods.map((m) => [m.moduleId, m]));
  const reopen = new Set<string>();
  const walk = (ids: string[], seen = new Set<string>()) => {
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const m = byModule.get(id);
      if (!m) continue;
      if (m.kind === "theory") reopen.add(m.id);
      else walk(m.prerequisiteModuleIds, seen);
    }
  };
  walk(am.prerequisiteModuleIds);
  for (const id of reopen) await reopenModule(tx, id);
  await tx.update(assignmentModules).set({ status: "locked", unlockedAt: null }).where(eq(assignmentModules.id, am.id));

  const rules = await rulesFor(am);
  const { attempts, extra } = await attemptStats(tx, am);
  if (attemptsLeft(rules.maxAttempts, extra, attempts.length) <= 0) {
    await tx.update(assignments).set({ status: "awaiting_decision" }).where(and(eq(assignments.id, am.assignmentId), eq(assignments.status, "active")));
    return;
  }
  await refreshAssignment(tx, am.assignmentId);
}

// ---------------------------------------------------------------------------
// Yönetici görünümü
// ---------------------------------------------------------------------------

export type AttemptSummary = {
  id: string;
  moduleTitle: string;
  attemptNo: number;
  startedAt: Date;
  submittedAt: Date | null;
  submitReason: "user" | "timeout" | null;
  score: number | null;
  passed: boolean | null;
  failReason: "score" | "ohs_critical" | null;
  tabLeaveCount: number;
  ttsUsed: boolean;
  proctorName: string | null;
  events: { kind: string; at: Date }[];
};

/** Kişinin sınav denemeleri (eğitmen, kapsamdaki bölüm sorumlusu, İK). Sorular ve cevaplar gösterilmez. */
export async function attemptsForAssignment(actor: Actor, assignmentId: string): Promise<AttemptSummary[]> {
  assertUser(actor);
  const [a] = await db().select({ userId: assignments.userId }).from(assignments).where(eq(assignments.id, assignmentId)).limit(1);
  if (!a || a.userId === actor.userId || !(await canViewPerson(actor, a.userId))) throw new NotFoundError("assignment");
  const proctor = alias(users, "proctor");
  const rows = await db()
    .select({ at: examAttempts, moduleTitle: assignmentModules.title, proctorName: proctor.name })
    .from(examAttempts)
    .innerJoin(assignmentModules, eq(assignmentModules.id, examAttempts.assignmentModuleId))
    .leftJoin(proctor, eq(proctor.id, examAttempts.proctorUserId))
    .where(eq(assignmentModules.assignmentId, assignmentId))
    .orderBy(asc(examAttempts.startedAt));
  const events = rows.length
    ? await db().select().from(examAttemptEvents).where(inArray(examAttemptEvents.attemptId, rows.map((r) => r.at.id))).orderBy(asc(examAttemptEvents.at))
    : [];
  return rows.map(({ at, moduleTitle, proctorName }) => ({
    id: at.id,
    moduleTitle,
    attemptNo: at.attemptNo,
    startedAt: at.startedAt,
    submittedAt: at.submittedAt,
    submitReason: at.submitReason,
    score: at.score,
    passed: at.passed,
    failReason: at.failReason,
    tabLeaveCount: at.tabLeaveCount,
    ttsUsed: at.ttsUsed,
    proctorName,
    events: events.filter((e) => e.attemptId === at.id).map((e) => ({ kind: e.kind, at: e.at })),
  }));
}

/** Plan tasarımcısı uyarısı: her sınav modülü için havuz büyüklüğü (havuz < 2 × soru sayısı ise uyarı). */
export async function examPoolSizes(items: readonly { moduleId: string; kind: string }[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const i of items) if (i.kind === "theory_exam") out.set(i.moduleId, (await poolForModules(db(), poolModuleIds(items, i.moduleId))).length);
  return out;
}


