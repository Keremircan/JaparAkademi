import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertNotSelf, assertUser, can, hasRole } from "@/server/authz/policy";
import { inOrgScope, orgScopeFor, type OrgScope } from "@/server/authz/scope";
import { db, type DbOrTx, type Tx } from "@/server/db/client";
import { approvals, assignmentModules, assignments, examAttemptItems, examAttempts, mediaAssets, modules, orgUnits, questionModules, questions, questionVersions, users } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

/**
 * Soru bankası (SPEC Bölüm 6, FG-6.1). Görme: bölüm sorumlusu (kapsamı + ortak İSG soruları), İSG uzmanı ve İK (tümü).
 * Düzenleme: kapsamdaki bölüm sorumlusu; İSG uzmanı her İSG sorusu. İK okur (değiştiremez), eğitmen göremez.
 * Sürüm (karar #61): sınavda kullanılmamış sürüm yerinde düzenlenir; kullanılmışsa yeni sürüm açılır.
 * İSG sorusu veya "İSG kritik" soru İSG uzmanı onayıyla aktifleşir (İSG uzmanının kendi sorusu doğrudan aktif).
 */

export type QuestionType = "single_choice" | "true_false";
type QuestionRow = typeof questions.$inferSelect;
type VersionRow = typeof questionVersions.$inferSelect;

type Access = { actor: Actor; scope: OrgScope };

async function accessFor(actor: Actor, conn: DbOrTx = db()): Promise<Access> {
  return { actor, scope: await orgScopeFor(actor, conn) };
}

function canView(a: Access, q: Pick<QuestionRow, "ownerOrgUnitId" | "isOhs">): boolean {
  if (a.actor.kind === "system" || hasRole(a.actor, "hr") || hasRole(a.actor, "ohs_specialist")) return true;
  if (!hasRole(a.actor, "section_manager")) return false;
  return q.ownerOrgUnitId === null || (!a.scope.all && inOrgScope(a.scope, q.ownerOrgUnitId));
}

function canEdit(a: Access, q: Pick<QuestionRow, "ownerOrgUnitId" | "isOhs">): boolean {
  if (a.actor.kind === "system") return true;
  if (q.isOhs && hasRole(a.actor, "ohs_specialist")) return true;
  return hasRole(a.actor, "section_manager") && !!q.ownerOrgUnitId && !a.scope.all && inOrgScope(a.scope, q.ownerOrgUnitId);
}

const needsOhsApproval = (q: { isOhs: boolean }, v: { isOhsCritical: boolean }) => q.isOhs || v.isOhsCritical;

async function loadQuestion(conn: DbOrTx, actor: Actor, id: string) {
  assertCan(actor, "questions.view");
  const [q] = await conn.select().from(questions).where(eq(questions.id, id)).limit(1);
  if (!q) throw new NotFoundError("question");
  const a = await accessFor(actor, conn);
  if (!canView(a, q)) throw new NotFoundError("question");
  return { q, a };
}

async function isUsed(conn: DbOrTx, versionId: string): Promise<boolean> {
  const [row] = await conn.select({ id: examAttemptItems.id }).from(examAttemptItems).where(eq(examAttemptItems.questionVersionId, versionId)).limit(1);
  return !!row;
}

// ---------------------------------------------------------------------------
// Girdi doğrulama
// ---------------------------------------------------------------------------

export type QuestionInput = {
  type: QuestionType;
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
  topic: string;
  difficulty: number;
  isOhsCritical: boolean;
  mediaAssetId: string | null;
  moduleIds: string[];
};

export function normalizeQuestion(input: QuestionInput): QuestionInput {
  const stem = input.stem.trim();
  if (stem.length < 5 || stem.length > 2000) throw new ValidationError("question_stem_invalid");
  const options = input.options.map((o) => o.trim());
  if ((input.type === "true_false" && options.length !== 2) || options.length < 2 || options.length > 5 || options.some((o) => !o || o.length > 500)) {
    throw new ValidationError("question_options_invalid");
  }
  if (new Set(options.map((o) => o.toLocaleLowerCase("tr-TR"))).size !== options.length) throw new ValidationError("question_options_invalid");
  if (!Number.isInteger(input.correctIndex) || input.correctIndex < 0 || input.correctIndex >= options.length) throw new ValidationError("question_correct_invalid");
  const topic = input.topic.trim().replace(/\s+/g, " ");
  if (topic.length < 2 || topic.length > 100) throw new ValidationError("question_topic_invalid");
  if (![1, 2, 3].includes(input.difficulty)) throw new ValidationError("question_difficulty_invalid");
  const moduleIds = [...new Set(input.moduleIds)];
  if (moduleIds.length === 0 || moduleIds.length > 20) throw new ValidationError("question_modules_required");
  return { ...input, stem, options, topic, explanation: input.explanation?.trim() || null, moduleIds };
}

async function validateRefs(tx: Tx, actor: Actor & { kind: "user" }, input: QuestionInput, existingAssetId: string | null) {
  const mods = await tx.select({ id: modules.id, kind: modules.kind, archivedAt: modules.archivedAt }).from(modules).where(inArray(modules.id, input.moduleIds));
  if (mods.length !== input.moduleIds.length || mods.some((m) => m.kind !== "theory" || m.archivedAt)) throw new ValidationError("question_modules_invalid");
  if (input.mediaAssetId && input.mediaAssetId !== existingAssetId) {
    const [asset] = await tx.select({ kind: mediaAssets.kind, createdBy: mediaAssets.createdBy }).from(mediaAssets).where(eq(mediaAssets.id, input.mediaAssetId));
    if (!asset || asset.kind !== "image" || asset.createdBy !== actor.userId) throw new ValidationError("asset_invalid");
  }
}

async function setModules(tx: Tx, questionId: string, moduleIds: string[]) {
  await tx.delete(questionModules).where(eq(questionModules.questionId, questionId));
  await tx.insert(questionModules).values(moduleIds.map((moduleId) => ({ questionId, moduleId })));
}

function versionValues(input: QuestionInput) {
  return {
    type: input.type,
    stem: input.stem,
    options: input.options,
    correctIndex: input.correctIndex,
    explanation: input.explanation,
    topic: input.topic,
    difficulty: input.difficulty,
    isOhsCritical: input.isOhsCritical,
    mediaAssetId: input.mediaAssetId,
  };
}

/** Sürümü aktifleştirir: önceki aktif sürüm kullanımdan kalkar. */
async function activate(tx: Tx, q: QuestionRow, versionId: string) {
  if (q.currentVersionId && q.currentVersionId !== versionId) {
    await tx.update(questionVersions).set({ status: "retired" }).where(eq(questionVersions.id, q.currentVersionId));
  }
  await tx.update(questionVersions).set({ status: "active" }).where(eq(questionVersions.id, versionId));
  await tx.update(questions).set({ currentVersionId: versionId }).where(eq(questions.id, q.id));
}

// ---------------------------------------------------------------------------
// Oluşturma, düzenleme, onay, arşiv
// ---------------------------------------------------------------------------

export async function createQuestion(
  actor: Actor,
  input: QuestionInput & { ownerOrgUnitId: string | null; isOhs: boolean },
): Promise<{ id: string; status: "active" | "ohs_review" }> {
  assertUser(actor);
  assertCan(actor, "questions.edit");
  const v = normalizeQuestion(input);
  if (input.ownerOrgUnitId === null && !input.isOhs) throw new ValidationError("question_owner_required");
  return withActor(actor, async (tx) => {
    const a = await accessFor(actor, tx);
    if (!canEdit(a, { ownerOrgUnitId: input.ownerOrgUnitId, isOhs: input.isOhs })) throw new ForbiddenError("questions.edit");
    await validateRefs(tx, actor, v, null);
    const [q] = await tx.insert(questions).values({ ownerOrgUnitId: input.ownerOrgUnitId, isOhs: input.isOhs, createdBy: actor.userId }).returning();
    const pending = needsOhsApproval(input, v) && !hasRole(actor, "ohs_specialist");
    const [ver] = await tx
      .insert(questionVersions)
      .values({ ...versionValues(v), questionId: q!.id, version: 1, status: pending ? "ohs_review" : "active", createdBy: actor.userId })
      .returning({ id: questionVersions.id });
    if (!pending) await tx.update(questions).set({ currentVersionId: ver!.id }).where(eq(questions.id, q!.id));
    await setModules(tx, q!.id, v.moduleIds);
    return { id: q!.id, status: pending ? "ohs_review" : "active" };
  });
}

/**
 * Düzenleme (karar #61): bekleyen/reddedilen sürüm varsa o güncellenir; yoksa aktif sürüm kullanılmamışsa ve onay
 * gerekmiyorsa yerinde düzenlenir; aksi halde yeni sürüm açılır (onay gerekiyorsa onaya gider, aktif sürüm kalır).
 */
export async function updateQuestion(actor: Actor, questionId: string, input: QuestionInput): Promise<{ status: "active" | "ohs_review" }> {
  assertUser(actor);
  assertCan(actor, "questions.edit");
  const v = normalizeQuestion(input);
  return withActor(actor, async (tx) => {
    const { q, a } = await loadQuestion(tx, actor, questionId);
    if (q.archivedAt) throw new ValidationError("question_archived");
    if (!canEdit(a, q)) throw new ForbiddenError("questions.edit");
    const [latest] = await tx.select().from(questionVersions).where(eq(questionVersions.questionId, q.id)).orderBy(desc(questionVersions.version)).limit(1).for("update");
    await validateRefs(tx, actor, v, latest?.mediaAssetId ?? null);
    await setModules(tx, q.id, v.moduleIds);
    const pending = needsOhsApproval(q, v) && !hasRole(actor, "ohs_specialist");
    const status = pending ? ("ohs_review" as const) : ("active" as const);

    if (latest && (latest.status === "ohs_review" || latest.status === "rejected")) {
      await tx.update(questionVersions).set({ ...versionValues(v), status, createdBy: actor.userId }).where(eq(questionVersions.id, latest.id));
      if (!pending) await activate(tx, q, latest.id);
      return { status };
    }
    if (latest && latest.status === "active" && !pending && !(await isUsed(tx, latest.id))) {
      await tx.update(questionVersions).set(versionValues(v)).where(eq(questionVersions.id, latest.id));
      return { status };
    }
    const [created] = await tx
      .insert(questionVersions)
      .values({ ...versionValues(v), questionId: q.id, version: (latest?.version ?? 0) + 1, status, createdBy: actor.userId })
      .returning({ id: questionVersions.id });
    if (!pending) await activate(tx, q, created!.id);
    return { status };
  });
}

async function loadPending(tx: Tx, actor: Actor & { kind: "user" }, versionId: string) {
  const [ver] = await tx.select().from(questionVersions).where(eq(questionVersions.id, versionId)).limit(1).for("update");
  if (!ver) throw new NotFoundError("question_version");
  const { q } = await loadQuestion(tx, actor, ver.questionId);
  if (ver.status !== "ohs_review") throw new ValidationError("version_not_pending");
  if (!hasRole(actor, "ohs_specialist")) throw new ForbiddenError("content.approve_ohs");
  assertNotSelf(actor, ver.createdBy);
  return { q, ver };
}

export async function approveQuestionVersion(actor: Actor, versionId: string): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    const { q, ver } = await loadPending(tx, actor, versionId);
    await tx.insert(approvals).values({ subjectType: "question_version", subjectId: ver.id, step: "ohs", decision: "approved", decidedBy: actor.userId });
    await activate(tx, q, ver.id);
  });
}

export async function rejectQuestionVersion(actor: Actor, versionId: string, comment: string): Promise<void> {
  assertUser(actor);
  const reason = comment.trim();
  if (reason.length < 3) throw new ValidationError("reject_comment_required");
  if (reason.length > 2000) throw new ValidationError("comment_too_long");
  await withActor(actor, async (tx) => {
    const { ver } = await loadPending(tx, actor, versionId);
    await tx.insert(approvals).values({ subjectType: "question_version", subjectId: ver.id, step: "ohs", decision: "rejected", comment: reason, decidedBy: actor.userId });
    await tx.update(questionVersions).set({ status: "rejected" }).where(eq(questionVersions.id, ver.id));
  });
}

export async function archiveQuestion(actor: Actor, questionId: string): Promise<void> {
  assertUser(actor);
  assertCan(actor, "questions.edit");
  await withActor(actor, async (tx) => {
    const { q, a } = await loadQuestion(tx, actor, questionId);
    if (q.archivedAt) throw new ValidationError("question_archived");
    if (!canEdit(a, q)) throw new ForbiddenError("questions.edit");
    await tx.update(questions).set({ archivedAt: new Date() }).where(eq(questions.id, q.id));
  });
}

// ---------------------------------------------------------------------------
// Görünümler
// ---------------------------------------------------------------------------

export type QuestionListItem = {
  id: string;
  stem: string;
  type: QuestionType;
  topic: string;
  difficulty: number;
  isOhs: boolean;
  isOhsCritical: boolean;
  ownerName: string | null;
  active: boolean;
  pending: boolean;
  archived: boolean;
  version: number;
};

const PAGE_SIZE = 50;

export async function listQuestions(
  actor: Actor,
  filters: { q?: string; moduleId?: string; topic?: string; status?: "active" | "pending" | "archived"; page?: number } = {},
): Promise<{ items: QuestionListItem[]; total: number; page: number; pageSize: number }> {
  assertCan(actor, "questions.view");
  const a = await accessFor(actor);
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const conds: (SQL | undefined)[] = [];
  if (actor.kind === "user" && !hasRole(actor, "hr") && !hasRole(actor, "ohs_specialist")) {
    const units = a.scope.all ? [] : [...a.scope.orgUnitIds];
    conds.push(or(isNull(questions.ownerOrgUnitId), units.length ? inArray(questions.ownerOrgUnitId, units) : sql`false`));
  }
  conds.push(filters.status === "archived" ? isNotNull(questions.archivedAt) : isNull(questions.archivedAt));
  if (filters.moduleId) {
    conds.push(inArray(questions.id, db().select({ id: questionModules.questionId }).from(questionModules).where(eq(questionModules.moduleId, filters.moduleId))));
  }
  // Listede gösterilen sürüm: en son sürüm
  const latestVersion = db()
    .selectDistinctOn([questionVersions.questionId], {
      questionId: questionVersions.questionId,
      id: questionVersions.id,
      version: questionVersions.version,
      stem: questionVersions.stem,
      type: questionVersions.type,
      topic: questionVersions.topic,
      difficulty: questionVersions.difficulty,
      isOhsCritical: questionVersions.isOhsCritical,
      status: questionVersions.status,
    })
    .from(questionVersions)
    .orderBy(questionVersions.questionId, desc(questionVersions.version))
    .as("lv");
  if (filters.topic) conds.push(eq(latestVersion.topic, filters.topic));
  if (filters.q?.trim()) conds.push(ilike(latestVersion.stem, `%${filters.q.trim().replace(/[%_\\]/g, "\\$&")}%`));
  if (filters.status === "pending") conds.push(eq(latestVersion.status, "ohs_review"));
  if (filters.status === "active") conds.push(isNotNull(questions.currentVersionId));
  const where = and(...conds);
  const [rows, [total]] = await Promise.all([
    db()
      .select({
        q: questions,
        ownerName: orgUnits.name,
        lv: {
          stem: latestVersion.stem,
          type: latestVersion.type,
          topic: latestVersion.topic,
          difficulty: latestVersion.difficulty,
          isOhsCritical: latestVersion.isOhsCritical,
          status: latestVersion.status,
          version: latestVersion.version,
        },
      })
      .from(questions)
      .innerJoin(latestVersion, eq(latestVersion.questionId, questions.id))
      .leftJoin(orgUnits, eq(orgUnits.id, questions.ownerOrgUnitId))
      .where(where)
      .orderBy(asc(latestVersion.topic), desc(questions.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db().select({ n: count() }).from(questions).innerJoin(latestVersion, eq(latestVersion.questionId, questions.id)).where(where),
  ]);
  return {
    items: rows.map(({ q, lv, ownerName }) => ({
      id: q.id,
      stem: lv.stem,
      type: lv.type,
      topic: lv.topic,
      difficulty: lv.difficulty,
      isOhs: q.isOhs,
      isOhsCritical: lv.isOhsCritical,
      ownerName,
      active: q.currentVersionId !== null,
      pending: lv.status === "ohs_review",
      archived: q.archivedAt !== null,
      version: lv.version,
    })),
    total: Number(total?.n ?? 0),
    page,
    pageSize: PAGE_SIZE,
  };
}

export type QuestionDetail = {
  id: string;
  ownerOrgUnitId: string | null;
  ownerName: string | null;
  isOhs: boolean;
  archived: boolean;
  currentVersionId: string | null;
  modules: { id: string; title: string }[];
  /** Düzenleme formunda gösterilen sürüm: bekleyen/reddedilen varsa o, yoksa aktif */
  editable: (Omit<VersionRow, "createdBy" | "updatedAt"> & { createdByName: string }) | null;
  versions: { id: string; version: number; status: VersionRow["status"]; createdByName: string; createdAt: Date; used: boolean }[];
  decisions: { versionId: string; decision: "approved" | "rejected" | "auto_self"; comment: string | null; decidedByName: string; decidedAt: Date }[];
  can: { edit: boolean; approve: boolean; archive: boolean };
};

export async function getQuestion(actor: Actor, questionId: string): Promise<QuestionDetail> {
  const { q, a } = await loadQuestion(db(), actor, questionId);
  const author = alias(users, "author");
  const [owner] = q.ownerOrgUnitId ? await db().select({ name: orgUnits.name }).from(orgUnits).where(eq(orgUnits.id, q.ownerOrgUnitId)) : [];
  const versions = await db()
    .select({ v: questionVersions, createdByName: author.name })
    .from(questionVersions)
    .innerJoin(author, eq(author.id, questionVersions.createdBy))
    .where(eq(questionVersions.questionId, q.id))
    .orderBy(desc(questionVersions.version));
  const used = versions.length
    ? new Set(
        (await db().selectDistinct({ id: examAttemptItems.questionVersionId }).from(examAttemptItems).where(inArray(examAttemptItems.questionVersionId, versions.map((x) => x.v.id)))).map(
          (r) => r.id,
        ),
      )
    : new Set<string>();
  const mods = await db()
    .select({ id: modules.id, title: modules.title })
    .from(questionModules)
    .innerJoin(modules, eq(modules.id, questionModules.moduleId))
    .where(eq(questionModules.questionId, q.id))
    .orderBy(asc(modules.title));
  const decisions = versions.length
    ? await db()
        .select({ versionId: approvals.subjectId, decision: approvals.decision, comment: approvals.comment, decidedByName: users.name, decidedAt: approvals.decidedAt })
        .from(approvals)
        .innerJoin(users, eq(users.id, approvals.decidedBy))
        .where(and(eq(approvals.subjectType, "question_version"), inArray(approvals.subjectId, versions.map((x) => x.v.id))))
        .orderBy(asc(approvals.decidedAt))
    : [];
  const latest = versions[0];
  const editableRow = latest && (latest.v.status === "ohs_review" || latest.v.status === "rejected") ? latest : versions.find((x) => x.v.id === q.currentVersionId);
  const pending = latest?.v.status === "ohs_review" ? latest.v : null;
  const edit = !q.archivedAt && can(actor, "questions.edit") && canEdit(a, q);
  return {
    id: q.id,
    ownerOrgUnitId: q.ownerOrgUnitId,
    ownerName: owner?.name ?? null,
    isOhs: q.isOhs,
    archived: q.archivedAt !== null,
    currentVersionId: q.currentVersionId,
    modules: mods,
    editable: editableRow
      ? {
          id: editableRow.v.id,
          questionId: editableRow.v.questionId,
          version: editableRow.v.version,
          type: editableRow.v.type,
          stem: editableRow.v.stem,
          mediaAssetId: editableRow.v.mediaAssetId,
          options: editableRow.v.options,
          correctIndex: editableRow.v.correctIndex,
          explanation: editableRow.v.explanation,
          topic: editableRow.v.topic,
          difficulty: editableRow.v.difficulty,
          isOhsCritical: editableRow.v.isOhsCritical,
          status: editableRow.v.status,
          createdAt: editableRow.v.createdAt,
          createdByName: editableRow.createdByName,
        }
      : null,
    versions: versions.map((x) => ({ id: x.v.id, version: x.v.version, status: x.v.status, createdByName: x.createdByName, createdAt: x.v.createdAt, used: used.has(x.v.id) })),
    decisions,
    can: {
      edit,
      approve: !!pending && actor.kind === "user" && hasRole(actor, "ohs_specialist") && pending.createdBy !== actor.userId,
      archive: edit,
    },
  };
}

/** İSG onayı bekleyen soru sürümleri (İSG uzmanı; kendi yazdıkları hariç). */
export async function questionApprovalQueue(actor: Actor): Promise<{ versionId: string; questionId: string; stem: string; topic: string; ownerName: string | null; createdByName: string; createdAt: Date }[]> {
  assertUser(actor);
  if (!hasRole(actor, "ohs_specialist")) return [];
  const author = alias(users, "author");
  const rows = await db()
    .select({ v: questionVersions, ownerName: orgUnits.name, createdByName: author.name })
    .from(questionVersions)
    .innerJoin(questions, eq(questions.id, questionVersions.questionId))
    .innerJoin(author, eq(author.id, questionVersions.createdBy))
    .leftJoin(orgUnits, eq(orgUnits.id, questions.ownerOrgUnitId))
    .where(and(eq(questionVersions.status, "ohs_review"), isNull(questions.archivedAt)))
    .orderBy(asc(questionVersions.createdAt));
  return rows
    .filter((r) => r.v.createdBy !== actor.userId)
    .map((r) => ({ versionId: r.v.id, questionId: r.v.questionId, stem: r.v.stem, topic: r.v.topic, ownerName: r.ownerName, createdByName: r.createdByName, createdAt: r.v.createdAt }));
}

/** Konu önerileri (karar #60: serbest metin + mevcut konular önerilir). */
export async function listTopics(actor: Actor): Promise<string[]> {
  assertCan(actor, "questions.view");
  const rows = await db().selectDistinct({ topic: questionVersions.topic }).from(questionVersions).where(eq(questionVersions.status, "active")).orderBy(asc(questionVersions.topic));
  return rows.map((r) => r.topic);
}

/** Soruya bağlanabilecek teorik modüller (görülebilir, arşivsiz, kart modülleri dahil). */
export async function questionModuleOptions(actor: Actor): Promise<{ id: string; title: string; ownerName: string | null }[]> {
  assertCan(actor, "questions.view");
  const { contentAccessFor, canViewContent } = await import("../content/access");
  const access = await contentAccessFor(actor);
  const rows = await db()
    .select({ m: modules, ownerName: orgUnits.name })
    .from(modules)
    .leftJoin(orgUnits, eq(orgUnits.id, modules.ownerOrgUnitId))
    .where(and(eq(modules.kind, "theory"), isNull(modules.archivedAt)))
    .orderBy(asc(modules.title));
  return rows.filter((r) => canViewContent(access, r.m)).map((r) => ({ id: r.m.id, title: r.m.title, ownerName: r.ownerName }));
}

// ---------------------------------------------------------------------------
// Sınav havuzu (karar #59)
// ---------------------------------------------------------------------------

export type PoolQuestion = { versionId: string; topic: string; difficulty: number; isOhsCritical: boolean; optionCount: number };

/** Verilen teorik modüllerin aktif soruları (arşivlenmemiş sorunun güncel sürümü). */
export async function poolForModules(conn: DbOrTx, moduleIds: string[]): Promise<PoolQuestion[]> {
  if (moduleIds.length === 0) return [];
  const rows = await conn
    .selectDistinct({
      versionId: questionVersions.id,
      topic: questionVersions.topic,
      difficulty: questionVersions.difficulty,
      isOhsCritical: questionVersions.isOhsCritical,
      options: questionVersions.options,
    })
    .from(questionModules)
    .innerJoin(questions, eq(questions.id, questionModules.questionId))
    .innerJoin(questionVersions, eq(questionVersions.id, questions.currentVersionId))
    .where(and(inArray(questionModules.moduleId, moduleIds), isNull(questions.archivedAt), eq(questionVersions.status, "active")));
  return rows.map((r) => ({ versionId: r.versionId, topic: r.topic, difficulty: r.difficulty, isOhsCritical: r.isOhsCritical, optionCount: r.options.length }));
}

/** Plan sırasına göre sınavın havuz modülleri: sınavdan önceki teorik modüller. */
export function poolModuleIds(items: readonly { moduleId: string; kind: string }[], examModuleId: string): string[] {
  const idx = items.findIndex((i) => i.moduleId === examModuleId);
  return items.slice(0, Math.max(0, idx)).filter((i) => i.kind === "theory").map((i) => i.moduleId);
}

/**
 * Soru yazılabilecek sahipler: bölüm sorumlusu kapsamındaki birimler; İSG uzmanı tüm birimler (yalnızca İSG sorusu)
 * ve ortak İSG soruları.
 */
export async function questionOwnerOptions(
  actor: Actor,
): Promise<{ common: boolean; ohsOnly: boolean; units: { id: string; name: string; parentName: string | null }[] }> {
  assertUser(actor);
  assertCan(actor, "questions.edit");
  const a = await accessFor(actor);
  const parent = alias(orgUnits, "parent");
  const rows = await db()
    .select({ id: orgUnits.id, name: orgUnits.name, parentName: parent.name })
    .from(orgUnits)
    .leftJoin(parent, eq(parent.id, orgUnits.parentId))
    .where(eq(orgUnits.isActive, true))
    .orderBy(asc(sql`coalesce(${parent.name}, ${orgUnits.name})`), sql`${orgUnits.parentId} asc nulls first`, asc(orgUnits.name));
  const ohs = hasRole(actor, "ohs_specialist");
  const sm = hasRole(actor, "section_manager");
  const units = rows.filter((u) => ohs || (sm && !a.scope.all && inOrgScope(a.scope, u.id)));
  return { common: ohs, ohsOnly: ohs && !sm, units };
}

/**
 * Plan tasarımcısı havuz uyarısı: modül → etkin soru numaraları. Soru kimlikleri istemciye gönderilmez;
 * yalnızca modüller arası çakışmayı ayırt etmek için sıra numarası verilir.
 */
export async function questionIndexForModules(actor: Actor, moduleIds: string[]): Promise<Record<string, number[]>> {
  assertUser(actor);
  if (moduleIds.length === 0) return {};
  const rows = await db()
    .select({ moduleId: questionModules.moduleId, questionId: questions.id })
    .from(questionModules)
    .innerJoin(questions, eq(questions.id, questionModules.questionId))
    .innerJoin(questionVersions, eq(questionVersions.id, questions.currentVersionId))
    .where(and(inArray(questionModules.moduleId, moduleIds), isNull(questions.archivedAt), eq(questionVersions.status, "active")));
  const numbers = new Map<string, number>();
  const out: Record<string, number[]> = {};
  for (const r of rows) {
    if (!numbers.has(r.questionId)) numbers.set(r.questionId, numbers.size);
    (out[r.moduleId] ??= []).push(numbers.get(r.questionId)!);
  }
  return out;
}

/**
 * Soru görseli erişimi: soruyu görebilen yönetici (bankada) ya da görselin çıktığı açık sınav denemesindeki kursiyer.
 * Teslimden sonra kursiyer görseli göremez (sorular gösterilmez; karar #65).
 */
export async function canViewQuestionAsset(actor: Actor, assetId: string): Promise<boolean> {
  if (actor.kind === "system") return true;
  const owners = await db()
    .selectDistinct({ ownerOrgUnitId: questions.ownerOrgUnitId, isOhs: questions.isOhs })
    .from(questionVersions)
    .innerJoin(questions, eq(questions.id, questionVersions.questionId))
    .where(eq(questionVersions.mediaAssetId, assetId));
  if (owners.length === 0) return false;
  if (can(actor, "questions.view")) {
    const a = await accessFor(actor);
    if (owners.some((o) => canView(a, o))) return true;
  }
  const [open] = await db()
    .select({ id: examAttemptItems.id })
    .from(examAttemptItems)
    .innerJoin(questionVersions, eq(questionVersions.id, examAttemptItems.questionVersionId))
    .innerJoin(examAttempts, eq(examAttempts.id, examAttemptItems.attemptId))
    .innerJoin(assignmentModules, eq(assignmentModules.id, examAttempts.assignmentModuleId))
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .where(and(eq(questionVersions.mediaAssetId, assetId), eq(assignments.userId, actor.userId), isNull(examAttempts.submittedAt)))
    .limit(1);
  return !!open;
}
