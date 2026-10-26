import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertUser } from "@/server/authz/policy";
import { db, type DbOrTx, type Tx } from "@/server/db/client";
import {
  assignmentItems,
  assignmentModules,
  assignments,
  contents,
  contentVersionLocales,
  mediaAssets,
  positionCardVersions,
  quizQuestions,
  quizResponses,
  rereadTasks,
  trainingPlans,
  type QuizSnapshot,
} from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { NotFoundError, ValidationError } from "@/server/errors";
import { getSettings } from "@/server/services/settings";
import { coveredSeconds, isDone, mergeRanges, type ModuleKind, type ModuleStatus, type Range } from "@/server/state/assignment";
import { CONTENT_LOCALE } from "../content";
import { bodyAssetIds, type ContentBody, type ContentType } from "../content/body";
import type { CardIdentity, CardSections, StoredCard } from "../positions/card-schema";
import { parseCardSections } from "../positions/card-schema";
import { quizComplete, tryCompleteTheory } from "./engine";

/**
 * Kursiyerin teorik eğitim işlemleri (FG-4.1–4.3). Yalnızca atamanın sahibi çalışabilir; kilitli modülde işlem yapılmaz.
 * Tamamlama kuralları (karar #54): video eşiği, PDF son sayfa, diğerlerinde sayfa sonu; ardından "Okudum, anladım".
 */

const WORKING: ModuleStatus[] = ["available", "in_progress", "review_required", "completed"];

async function ownModule(conn: DbOrTx, actor: Actor & { kind: "user" }, assignmentModuleId: string) {
  const [row] = await conn
    .select({ am: assignmentModules, a: assignments })
    .from(assignmentModules)
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .where(eq(assignmentModules.id, assignmentModuleId))
    .limit(1);
  if (!row || row.a.userId !== actor.userId) throw new NotFoundError("assignment_module");
  return row;
}

async function ownItem(tx: Tx, actor: Actor & { kind: "user" }, itemId: string) {
  const [item] = await tx.select().from(assignmentItems).where(eq(assignmentItems.id, itemId)).limit(1).for("update");
  if (!item) throw new NotFoundError("assignment_item");
  const { am, a } = await ownModule(tx, actor, item.assignmentModuleId);
  if (a.status === "cancelled" || !WORKING.includes(am.status) || item.round !== am.round) throw new ValidationError("module_locked");
  return { item, am, a };
}

// ---------------------------------------------------------------------------
// Modül görünümü
// ---------------------------------------------------------------------------

export type LearnItem = {
  id: string;
  kind: "content" | "card_section";
  title: string;
  /** İçerik adımı */
  contentType?: ContentType;
  body?: ContentBody;
  assetIds?: string[];
  videoDurationSec?: number | null;
  /** Kart adımı */
  sectionKey?: string;
  startedAt: Date | null;
  progressRatio: number;
  reachedEnd: boolean;
  acknowledgedAt: Date | null;
};

export type QuizItem = {
  id: string;
  type: "single_choice" | "true_false";
  stem: string;
  options: string[];
  answer: { answerIndex: number; isCorrect: boolean; correctIndex: number; explanation: string | null } | null;
};

export type LearnModuleView = {
  assignmentId: string;
  assignmentModuleId: string;
  kind: ModuleKind;
  title: string;
  status: ModuleStatus;
  remoteAllowed: boolean;
  isOhs: boolean;
  durationMin: number;
  completedVia: "online" | "classroom" | "carried_over" | null;
  items: LearnItem[];
  card: { identity: CardIdentity; sections: CardSections } | null;
  quiz: QuizItem[];
  quizUnlocked: boolean;
  videoWatchRatio: number;
};

export async function learnModule(actor: Actor, assignmentModuleId: string): Promise<LearnModuleView> {
  assertUser(actor);
  const { am, a } = await ownModule(db(), actor, assignmentModuleId);
  if (am.status === "locked") throw new ValidationError("module_locked");

  // Yalnızca modülün geçerli turunun adımları (sınavda kalınca yeni tur açılır)
  const items = await db()
    .select()
    .from(assignmentItems)
    .where(and(eq(assignmentItems.assignmentModuleId, am.id), eq(assignmentItems.round, am.round)))
    .orderBy(asc(assignmentItems.sortOrder));
  const versionIds = items.map((i) => i.contentVersionId).filter((x): x is string => !!x);
  const locales = versionIds.length
    ? await db()
        .select({ versionId: contentVersionLocales.contentVersionId, title: contentVersionLocales.title, body: contentVersionLocales.body, type: contents.type })
        .from(contentVersionLocales)
        .innerJoin(assignmentItems, eq(assignmentItems.contentVersionId, contentVersionLocales.contentVersionId))
        .innerJoin(contents, eq(contents.id, assignmentItems.contentId))
        .where(and(inArray(contentVersionLocales.contentVersionId, versionIds), eq(contentVersionLocales.locale, CONTENT_LOCALE)))
    : [];
  const byVersion = new Map(locales.map((l) => [l.versionId, l]));
  const allAssetIds = locales.flatMap((l) => bodyAssetIds(l.type, l.body as ContentBody));
  const durations = allAssetIds.length
    ? new Map((await db().select({ id: mediaAssets.id, d: mediaAssets.durationSec }).from(mediaAssets).where(inArray(mediaAssets.id, allAssetIds))).map((r) => [r.id, r.d]))
    : new Map<string, number | null>();

  let card: LearnModuleView["card"] = null;
  const cardVersionId = items.find((i) => i.cardVersionId)?.cardVersionId;
  if (cardVersionId) {
    const [cv] = await db().select({ sections: positionCardVersions.sections }).from(positionCardVersions).where(eq(positionCardVersions.id, cardVersionId));
    const stored = cv?.sections as StoredCard | undefined;
    const parsed = parseCardSections(stored ?? {});
    if (stored?.identity && parsed.success) card = { identity: stored.identity, sections: parsed.data };
  }

  const view: LearnItem[] = items.map((i) => {
    if (i.kind === "card_section") {
      return {
        id: i.id,
        kind: "card_section",
        title: i.sectionKey!,
        sectionKey: i.sectionKey!,
        startedAt: i.startedAt,
        progressRatio: i.progressRatio,
        reachedEnd: !!i.reachedEndAt,
        acknowledgedAt: i.acknowledgedAt,
      };
    }
    const loc = byVersion.get(i.contentVersionId!);
    const body = (loc?.body ?? {}) as ContentBody;
    const assetIds = loc ? bodyAssetIds(loc.type, body) : [];
    return {
      id: i.id,
      kind: "content",
      title: loc?.title ?? "—",
      contentType: loc?.type,
      body,
      assetIds,
      videoDurationSec: loc?.type === "video" ? (durations.get(assetIds[0] ?? "") ?? null) : undefined,
      startedAt: i.startedAt,
      progressRatio: i.progressRatio,
      reachedEnd: !!i.reachedEndAt,
      acknowledgedAt: i.acknowledgedAt,
    };
  });

  const allAcked = items.every((i) => i.acknowledgedAt);
  const questions = await db()
    .select()
    .from(quizQuestions)
    .where(and(eq(quizQuestions.moduleId, am.moduleId), isNull(quizQuestions.archivedAt)))
    .orderBy(asc(quizQuestions.sortOrder));
  const responses = questions.length
    ? await db().select().from(quizResponses).where(eq(quizResponses.assignmentModuleId, am.id)).orderBy(asc(quizResponses.answeredAt))
    : [];
  const latest = new Map(responses.map((r) => [r.quizQuestionId, r]));

  return {
    assignmentId: a.id,
    assignmentModuleId: am.id,
    kind: am.kind,
    title: am.title,
    status: am.status,
    remoteAllowed: am.remoteAllowed,
    isOhs: am.isOhs,
    durationMin: am.durationMin,
    completedVia: am.completedVia,
    items: view,
    card,
    quizUnlocked: allAcked,
    quiz: allAcked
      ? questions.map((q) => {
          const r = latest.get(q.id);
          return {
            id: q.id,
            type: q.type,
            stem: r?.snapshot.stem ?? q.stem,
            options: r?.snapshot.options ?? q.options,
            answer: r ? { answerIndex: r.answerIndex, isCorrect: r.isCorrect, correctIndex: r.snapshot.correctIndex, explanation: r.snapshot.explanation } : null,
          };
        })
      : [],
    videoWatchRatio: await watchRatio(db(), a.planId),
  };
}

async function watchRatio(conn: DbOrTx, planId: string): Promise<number> {
  const [plan] = await conn.select({ overrides: trainingPlans.overrides }).from(trainingPlans).where(eq(trainingPlans.id, planId));
  return plan?.overrides.videoWatchRatio ?? (await getSettings(["theory.video_watch_ratio"]))["theory.video_watch_ratio"];
}

// ---------------------------------------------------------------------------
// İlerleme
// ---------------------------------------------------------------------------

async function markStarted(tx: Tx, item: typeof assignmentItems.$inferSelect, am: typeof assignmentModules.$inferSelect) {
  const now = new Date();
  if (!item.startedAt) await tx.update(assignmentItems).set({ startedAt: now }).where(eq(assignmentItems.id, item.id));
  if (am.status === "available") await tx.update(assignmentModules).set({ status: "in_progress", startedAt: am.startedAt ?? now }).where(eq(assignmentModules.id, am.id));
}

/** Video izleme aralıkları (FG-4.2): izlenmeyen kısım sayılmaz, süre dışı aralık kabul edilmez. */
export async function reportVideoProgress(actor: Actor, itemId: string, ranges: Range[]): Promise<{ ratio: number; reachedEnd: boolean }> {
  assertUser(actor);
  if (ranges.length > 500) throw new ValidationError("invalid_input");
  return withActor(actor, async (tx) => {
    const { item, am, a } = await ownItem(tx, actor, itemId);
    if (item.kind !== "content" || item.acknowledgedAt) return { ratio: item.progressRatio, reachedEnd: !!item.reachedEndAt };
    const [loc] = await tx
      .select({ body: contentVersionLocales.body, type: contents.type })
      .from(contentVersionLocales)
      .innerJoin(contents, eq(contents.id, item.contentId!))
      .where(and(eq(contentVersionLocales.contentVersionId, item.contentVersionId!), eq(contentVersionLocales.locale, CONTENT_LOCALE)));
    if (loc?.type !== "video") throw new ValidationError("invalid_input");
    const [assetId] = bodyAssetIds("video", loc.body as ContentBody);
    const [asset] = assetId ? await tx.select({ d: mediaAssets.durationSec }).from(mediaAssets).where(eq(mediaAssets.id, assetId)) : [];
    const duration = asset?.d ?? 0;
    if (duration <= 0) throw new ValidationError("video_not_ready");

    await markStarted(tx, item, am);
    const merged = mergeRanges([...item.watchedRanges, ...ranges], duration);
    const ratio = Math.min(1, coveredSeconds(merged) / duration);
    const reached = ratio >= (await watchRatio(tx, a.planId));
    await tx
      .update(assignmentItems)
      .set({ watchedRanges: merged, progressRatio: ratio, ...(reached && !item.reachedEndAt ? { reachedEndAt: new Date() } : {}) })
      .where(eq(assignmentItems.id, item.id));
    return { ratio, reachedEnd: reached || !!item.reachedEndAt };
  });
}

/** Sayfa sonuna/son sayfaya ulaşıldı (video dışı adımlar). */
export async function reportReachedEnd(actor: Actor, itemId: string, ratio = 1): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    const { item, am } = await ownItem(tx, actor, itemId);
    if (item.acknowledgedAt) return;
    if (item.kind === "content") {
      const [c] = await tx.select({ type: contents.type }).from(contents).where(eq(contents.id, item.contentId!));
      if (c?.type === "video") throw new ValidationError("invalid_input");
    }
    await markStarted(tx, item, am);
    const r = Math.max(item.progressRatio, Math.min(1, Math.max(0, ratio)));
    await tx
      .update(assignmentItems)
      .set({ progressRatio: r, ...(r >= 1 && !item.reachedEndAt ? { reachedEndAt: new Date() } : {}) })
      .where(eq(assignmentItems.id, item.id));
  });
}

/** "Okudum, anladım" (FG-4.2): sona ulaşmadan verilemez; zaman damgasıyla kilitlenir. */
export async function acknowledgeItem(actor: Actor, itemId: string): Promise<{ moduleCompleted: boolean }> {
  assertUser(actor);
  return withActor(actor, async (tx) => {
    const { item, am } = await ownItem(tx, actor, itemId);
    if (item.acknowledgedAt) return { moduleCompleted: isDone(am.status) };
    if (!item.reachedEndAt) throw new ValidationError("not_reached_end");
    await markStarted(tx, item, am);
    await tx.update(assignmentItems).set({ acknowledgedAt: new Date() }).where(eq(assignmentItems.id, item.id));
    return { moduleCompleted: await tryCompleteTheory(tx, am.id) };
  });
}

/** Ara değerlendirme cevabı (FG-4.3): not etkisi yok, yanlışta doğru şık ve açıklama döner. */
export async function answerQuiz(
  actor: Actor,
  assignmentModuleId: string,
  questionId: string,
  answerIndex: number,
): Promise<{ isCorrect: boolean; correctIndex: number; explanation: string | null; moduleCompleted: boolean }> {
  assertUser(actor);
  return withActor(actor, async (tx) => {
    const { am, a } = await ownModule(tx, actor, assignmentModuleId);
    if (a.status === "cancelled" || !WORKING.includes(am.status)) throw new ValidationError("module_locked");
    const [q] = await tx.select().from(quizQuestions).where(and(eq(quizQuestions.id, questionId), eq(quizQuestions.moduleId, am.moduleId))).limit(1);
    if (!q || q.archivedAt) throw new NotFoundError("quiz_question");
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= q.options.length) throw new ValidationError("invalid_input");
    const items = await tx
      .select({ ack: assignmentItems.acknowledgedAt })
      .from(assignmentItems)
      .where(and(eq(assignmentItems.assignmentModuleId, am.id), eq(assignmentItems.round, am.round)));
    if (items.some((i) => !i.ack)) throw new ValidationError("quiz_locked");
    const [existing] = await tx
      .select({ id: quizResponses.id })
      .from(quizResponses)
      .where(and(eq(quizResponses.assignmentModuleId, am.id), eq(quizResponses.quizQuestionId, q.id)))
      .limit(1);
    if (existing) throw new ValidationError("quiz_already_answered");
    const snapshot: QuizSnapshot = { stem: q.stem, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation };
    const isCorrect = answerIndex === q.correctIndex;
    await tx.insert(quizResponses).values({ assignmentModuleId: am.id, quizQuestionId: q.id, snapshot, answerIndex, isCorrect });
    const moduleCompleted = (await quizComplete(tx, am.id, am.moduleId)) ? await tryCompleteTheory(tx, am.id) : false;
    return { isCorrect, correctIndex: q.correctIndex, explanation: q.explanation, moduleCompleted };
  });
}

// ---------------------------------------------------------------------------
// Okuma görevleri (FG-2.2)
// ---------------------------------------------------------------------------

export async function getRereadTask(actor: Actor, taskId: string) {
  assertUser(actor);
  const [t] = await db()
    .select({ task: rereadTasks, title: contentVersionLocales.title, body: contentVersionLocales.body, type: contents.type })
    .from(rereadTasks)
    .innerJoin(contents, eq(contents.id, rereadTasks.contentId))
    .innerJoin(contentVersionLocales, and(eq(contentVersionLocales.contentVersionId, rereadTasks.contentVersionId), eq(contentVersionLocales.locale, CONTENT_LOCALE)))
    .where(eq(rereadTasks.id, taskId))
    .limit(1);
  if (!t || t.task.userId !== actor.userId) throw new NotFoundError("reread_task");
  return { id: t.task.id, title: t.title, type: t.type, body: t.body as ContentBody, dueDate: t.task.dueDate, acknowledgedAt: t.task.acknowledgedAt };
}

export async function acknowledgeReread(actor: Actor, taskId: string): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    const [t] = await tx.select().from(rereadTasks).where(eq(rereadTasks.id, taskId)).limit(1).for("update");
    if (!t || t.userId !== actor.userId) throw new NotFoundError("reread_task");
    if (t.acknowledgedAt) return;
    await tx.update(rereadTasks).set({ acknowledgedAt: new Date() }).where(eq(rereadTasks.id, t.id));
  });
}

/** Medya erişimi: kursiyerin kendi atamasında ya da okuma görevinde yer alan içerik sürümü. */
export async function learnerCanViewAsset(userId: string, assetId: string): Promise<boolean> {
  const rows = await db()
    .select({ body: contentVersionLocales.body, type: contents.type })
    .from(assignmentItems)
    .innerJoin(assignmentModules, eq(assignmentModules.id, assignmentItems.assignmentModuleId))
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .innerJoin(contentVersionLocales, eq(contentVersionLocales.contentVersionId, assignmentItems.contentVersionId))
    .innerJoin(contents, eq(contents.id, assignmentItems.contentId))
    .where(and(eq(assignments.userId, userId), eq(contentVersionLocales.locale, CONTENT_LOCALE)));
  const tasks = await db()
    .select({ body: contentVersionLocales.body, type: contents.type })
    .from(rereadTasks)
    .innerJoin(contents, eq(contents.id, rereadTasks.contentId))
    .innerJoin(contentVersionLocales, eq(contentVersionLocales.contentVersionId, rereadTasks.contentVersionId))
    .where(eq(rereadTasks.userId, userId));
  return [...rows, ...tasks].some((r) => bodyAssetIds(r.type, r.body as ContentBody).includes(assetId));
}



/** Rota parametrelerinden (atama + modül) kursiyerin modül görünümü. */
export async function learnModuleByIds(actor: Actor, assignmentId: string, moduleId: string): Promise<LearnModuleView> {
  assertUser(actor);
  const [row] = await db()
    .select({ id: assignmentModules.id })
    .from(assignmentModules)
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .where(and(eq(assignmentModules.assignmentId, assignmentId), eq(assignmentModules.moduleId, moduleId), eq(assignments.userId, actor.userId)))
    .limit(1);
  if (!row) throw new NotFoundError("assignment_module");
  return learnModule(actor, row.id);
}
