import { and, asc, count, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertUser, hasRole } from "@/server/authz/policy";
import { db, type DbOrTx } from "@/server/db/client";
import { contents, moduleContents, modules, orgUnits, planModules, practiceTasks } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { canDraftContent, canUseLibrary, canViewContent, contentAccessFor, type ContentAccess } from "./content/access";

/**
 * Modül kütüphanesi (SPEC 4.3, FG-3.1). Modüller birden fazla planda kullanılır; sürümsüzdür
 * (karar #45): değişiklik yeni atamalara yansır. Görme ve düzenleme kuralları içerikle aynıdır.
 * Ortak modüller (sahibi yok) her plana yaka tipine göre otomatik eklenir (karar #46).
 */

export const MODULE_KINDS = ["theory", "practice", "theory_exam", "practice_exam"] as const;
export type ModuleKind = (typeof MODULE_KINDS)[number];

function assertLibrary(actor: Actor) {
  if (actor.kind === "user" && !canUseLibrary(actor)) throw new ForbiddenError("modules.view");
}

type ModuleRow = typeof modules.$inferSelect;

export async function loadModule(actor: Actor, moduleId: string, conn: DbOrTx = db()) {
  assertLibrary(actor);
  const [module] = await conn.select().from(modules).where(eq(modules.id, moduleId)).limit(1);
  if (!module) throw new NotFoundError("module");
  const access = await contentAccessFor(actor, conn);
  if (!canViewContent(access, module)) throw new NotFoundError("module");
  return { module, access };
}

function canEdit(access: ContentAccess, m: Pick<ModuleRow, "ownerOrgUnitId" | "isOhs">) {
  return canDraftContent(access, m);
}

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------

export type ModuleListItem = {
  id: string;
  kind: ModuleKind;
  title: string;
  durationMin: number;
  isOhs: boolean;
  remoteAllowed: boolean;
  validityMonths: number | null;
  ownerOrgUnitId: string | null;
  ownerName: string | null;
  commonTarget: "all" | "blue" | "white" | null;
  commonSortOrder: number | null;
  isCardModule: boolean;
  archived: boolean;
  itemCount: number;
};

export async function listModules(
  actor: Actor,
  filters: { q?: string; kind?: ModuleKind; scope?: "common" | "unit"; archived?: boolean } = {},
): Promise<ModuleListItem[]> {
  assertLibrary(actor);
  const access = await contentAccessFor(actor);
  const conds: (SQL | undefined)[] = [filters.archived ? isNotNull(modules.archivedAt) : isNull(modules.archivedAt)];
  if (filters.kind) conds.push(eq(modules.kind, filters.kind));
  if (filters.scope === "common") conds.push(isNull(modules.ownerOrgUnitId));
  if (filters.scope === "unit") conds.push(isNotNull(modules.ownerOrgUnitId));
  if (filters.q?.trim()) conds.push(ilike(modules.title, `%${filters.q.trim().replace(/[%_\\]/g, "\\$&")}%`));

  const rows = await db()
    .select({ m: modules, ownerName: orgUnits.name })
    .from(modules)
    .leftJoin(orgUnits, eq(orgUnits.id, modules.ownerOrgUnitId))
    .where(and(...conds))
    .orderBy(sql`${modules.ownerOrgUnitId} nulls first`, asc(modules.commonSortOrder), asc(modules.title));
  const visible = rows.filter((r) => canViewContent(access, r.m));
  const counts = await itemCounts(visible.map((r) => r.m.id));
  return visible.map(({ m, ownerName }) => ({
    id: m.id,
    kind: m.kind,
    title: m.title,
    durationMin: m.durationMin,
    isOhs: m.isOhs,
    remoteAllowed: m.remoteAllowed,
    validityMonths: m.validityMonths,
    ownerOrgUnitId: m.ownerOrgUnitId,
    ownerName,
    commonTarget: m.commonTarget,
    commonSortOrder: m.commonSortOrder,
    isCardModule: m.cardPositionId !== null,
    archived: m.archivedAt !== null,
    itemCount: counts.get(m.id) ?? 0,
  }));
}

async function itemCounts(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const [c, t] = await Promise.all([
    db().select({ id: moduleContents.moduleId, n: count() }).from(moduleContents).where(inArray(moduleContents.moduleId, ids)).groupBy(moduleContents.moduleId),
    db()
      .select({ id: practiceTasks.moduleId, n: count() })
      .from(practiceTasks)
      .where(and(inArray(practiceTasks.moduleId, ids), isNull(practiceTasks.archivedAt)))
      .groupBy(practiceTasks.moduleId),
  ]);
  return new Map([...c, ...t].map((r) => [r.id, Number(r.n)]));
}

/** Yaka tipine uyan ortak modüller (plan başına otomatik eklenir). */
export async function commonModulesFor(collarType: "blue" | "white", conn: DbOrTx = db()) {
  return conn
    .select({ id: modules.id, kind: modules.kind, title: modules.title, durationMin: modules.durationMin, isOhs: modules.isOhs })
    .from(modules)
    .where(and(isNull(modules.ownerOrgUnitId), isNull(modules.archivedAt), or(eq(modules.commonTarget, "all"), eq(modules.commonTarget, collarType))))
    .orderBy(sql`${modules.commonSortOrder} asc nulls last`, asc(modules.title));
}

// ---------------------------------------------------------------------------
// Ayrıntı
// ---------------------------------------------------------------------------

export type ModuleDetail = ModuleListItem & {
  description: string | null;
  contents: { id: string; title: string; type: string; published: boolean; archived: boolean }[];
  tasks: { id: string; title: string; description: string | null; isCritical: boolean }[];
  usedInPlans: number;
  can: { edit: boolean; editRemote: boolean; archive: boolean };
};

export async function getModule(actor: Actor, moduleId: string): Promise<ModuleDetail> {
  const { module: m, access } = await loadModule(actor, moduleId);
  const [owner] = m.ownerOrgUnitId ? await db().select({ name: orgUnits.name }).from(orgUnits).where(eq(orgUnits.id, m.ownerOrgUnitId)) : [];
  const [contentRows, tasks, [usage]] = await Promise.all([
    db()
      .select({ id: contents.id, title: contents.title, type: contents.type, publishedId: contents.currentPublishedVersionId, archivedAt: contents.archivedAt })
      .from(moduleContents)
      .innerJoin(contents, eq(contents.id, moduleContents.contentId))
      .where(eq(moduleContents.moduleId, m.id))
      .orderBy(asc(moduleContents.sortOrder)),
    db()
      .select({ id: practiceTasks.id, title: practiceTasks.title, description: practiceTasks.description, isCritical: practiceTasks.isCritical })
      .from(practiceTasks)
      .where(and(eq(practiceTasks.moduleId, m.id), isNull(practiceTasks.archivedAt)))
      .orderBy(asc(practiceTasks.sortOrder)),
    db().select({ n: count() }).from(planModules).where(eq(planModules.moduleId, m.id)),
  ]);
  const edit = m.archivedAt === null && canEdit(access, m);
  return {
    id: m.id,
    kind: m.kind,
    title: m.title,
    description: m.description,
    durationMin: m.durationMin,
    isOhs: m.isOhs,
    remoteAllowed: m.remoteAllowed,
    validityMonths: m.validityMonths,
    ownerOrgUnitId: m.ownerOrgUnitId,
    ownerName: owner?.name ?? null,
    commonTarget: m.commonTarget,
    commonSortOrder: m.commonSortOrder,
    isCardModule: m.cardPositionId !== null,
    archived: m.archivedAt !== null,
    itemCount: m.kind === "practice" ? tasks.length : contentRows.length,
    contents: contentRows.map((c) => ({ id: c.id, title: c.title, type: c.type, published: c.publishedId !== null, archived: c.archivedAt !== null })),
    tasks,
    usedInPlans: Number(usage?.n ?? 0),
    can: {
      edit,
      editRemote: edit && (!m.isOhs || hasRole(actor, "ohs_specialist") || actor.kind === "system"),
      archive: edit && m.cardPositionId === null,
    },
  };
}

// ---------------------------------------------------------------------------
// Oluşturma ve düzenleme
// ---------------------------------------------------------------------------

export type ModuleInput = {
  kind: ModuleKind;
  title: string;
  description: string | null;
  durationMin: number;
  isOhs: boolean;
  remoteAllowed: boolean;
  validityMonths: number | null;
  ownerOrgUnitId: string | null;
  commonTarget: "all" | "blue" | "white" | null;
  commonSortOrder: number | null;
};

function normalize(input: Omit<ModuleInput, "kind" | "ownerOrgUnitId">) {
  const title = input.title.trim().replace(/\s+/g, " ");
  if (title.length < 3 || title.length > 200) throw new ValidationError("invalid_title");
  if (!Number.isInteger(input.durationMin) || input.durationMin < 1 || input.durationMin > 100000) throw new ValidationError("duration_invalid");
  if (input.validityMonths !== null && (!Number.isInteger(input.validityMonths) || input.validityMonths < 1 || input.validityMonths > 240)) {
    throw new ValidationError("validity_invalid");
  }
  return { ...input, title, description: input.description?.trim() || null };
}

export async function createModule(actor: Actor, input: ModuleInput): Promise<{ id: string }> {
  assertUser(actor);
  assertLibrary(actor);
  const v = normalize(input);
  const common = input.ownerOrgUnitId === null;
  return withActor(actor, async (tx) => {
    const access = await contentAccessFor(actor, tx);
    if (!canEdit(access, { ownerOrgUnitId: input.ownerOrgUnitId, isOhs: v.isOhs })) throw new ForbiddenError("modules.edit");
    if (input.ownerOrgUnitId) {
      const [unit] = await tx.select({ isActive: orgUnits.isActive }).from(orgUnits).where(eq(orgUnits.id, input.ownerOrgUnitId));
      if (!unit?.isActive) throw new ValidationError("org_unit_invalid");
    }
    // İSG modülünde "uzaktan verilebilir" yalnızca İSG uzmanı tarafından kapatılabilir/açılabilir
    const remoteAllowed = v.isOhs && !hasRole(actor, "ohs_specialist") ? true : v.remoteAllowed;
    const [row] = await tx
      .insert(modules)
      .values({
        kind: input.kind,
        title: v.title,
        description: v.description,
        durationMin: v.durationMin,
        isOhs: v.isOhs,
        remoteAllowed,
        validityMonths: v.validityMonths,
        ownerOrgUnitId: input.ownerOrgUnitId,
        commonTarget: common ? (input.commonTarget ?? "all") : null,
        commonSortOrder: common ? input.commonSortOrder : null,
        createdBy: actor.userId,
      })
      .returning({ id: modules.id });
    return { id: row!.id };
  });
}

export async function updateModule(actor: Actor, moduleId: string, input: Omit<ModuleInput, "kind" | "ownerOrgUnitId">): Promise<void> {
  assertUser(actor);
  const v = normalize(input);
  await withActor(actor, async (tx) => {
    const { module: m, access } = await loadModule(actor, moduleId, tx);
    if (m.archivedAt || !canEdit(access, m)) throw new ForbiddenError("modules.edit");
    const ohs = hasRole(actor, "ohs_specialist");
    // İSG işaretini yalnızca İSG uzmanı kaldırabilir; İSG modülünde uzaktan verme kararı İSG uzmanınındır
    if (m.isOhs && !v.isOhs && !ohs) throw new ForbiddenError("modules.ohs");
    const isOhs = v.isOhs;
    const remoteAllowed = isOhs && !ohs ? m.remoteAllowed : v.remoteAllowed;
    const common = m.ownerOrgUnitId === null;
    await tx
      .update(modules)
      .set({
        title: v.title,
        description: v.description,
        durationMin: v.durationMin,
        isOhs,
        remoteAllowed,
        validityMonths: v.validityMonths,
        commonTarget: common ? (v.commonTarget ?? "all") : null,
        commonSortOrder: common ? v.commonSortOrder : null,
      })
      .where(eq(modules.id, m.id));
  });
}

/** Teorik modülün içerikleri (sıralı). Yalnızca yayında olan, görülebilen içerikler eklenebilir. */
export async function setModuleContents(actor: Actor, moduleId: string, contentIds: string[]): Promise<void> {
  assertUser(actor);
  const ids = [...new Set(contentIds)];
  if (ids.length > 100) throw new ValidationError("too_many_items");
  await withActor(actor, async (tx) => {
    const { module: m, access } = await loadModule(actor, moduleId, tx);
    if (m.archivedAt || !canEdit(access, m)) throw new ForbiddenError("modules.edit");
    if (m.kind !== "theory") throw new ValidationError("module_kind_invalid");
    const existing = await tx.select({ id: moduleContents.contentId }).from(moduleContents).where(eq(moduleContents.moduleId, m.id));
    const kept = new Set(existing.map((e) => e.id));
    if (ids.length) {
      const rows = await tx.select().from(contents).where(inArray(contents.id, ids));
      if (rows.length !== ids.length) throw new ValidationError("content_invalid");
      for (const c of rows) {
        // Önceden eklenmiş içerik kalabilir; yeni eklenen yayında, arşivsiz ve görülebilir olmalı
        if (kept.has(c.id)) continue;
        if (!canViewContent(access, c) || c.archivedAt || !c.currentPublishedVersionId) throw new ValidationError("content_invalid");
      }
    }
    await tx.delete(moduleContents).where(eq(moduleContents.moduleId, m.id));
    if (ids.length) await tx.insert(moduleContents).values(ids.map((contentId, i) => ({ moduleId: m.id, contentId, sortOrder: i })));
  });
}

export type TaskInput = { id?: string; title: string; description: string | null; isCritical: boolean };

/** Pratik görevler: listeden çıkarılan görev arşivlenir (geçmiş işaretlemeler korunur). */
export async function saveTasks(actor: Actor, moduleId: string, tasks: TaskInput[]): Promise<void> {
  assertUser(actor);
  if (tasks.length > 100) throw new ValidationError("too_many_items");
  const clean = tasks.map((t) => {
    const title = t.title.trim().replace(/\s+/g, " ");
    if (title.length < 2 || title.length > 200) throw new ValidationError("task_title_invalid");
    return { ...t, title, description: t.description?.trim() || null };
  });
  await withActor(actor, async (tx) => {
    const { module: m, access } = await loadModule(actor, moduleId, tx);
    if (m.archivedAt || !canEdit(access, m)) throw new ForbiddenError("modules.edit");
    if (m.kind !== "practice") throw new ValidationError("module_kind_invalid");
    const current = await tx.select({ id: practiceTasks.id }).from(practiceTasks).where(and(eq(practiceTasks.moduleId, m.id), isNull(practiceTasks.archivedAt)));
    const currentIds = new Set(current.map((c) => c.id));
    const keep = new Set(clean.filter((t) => t.id).map((t) => t.id!));
    if ([...keep].some((id) => !currentIds.has(id))) throw new ValidationError("task_invalid");

    const removed = [...currentIds].filter((id) => !keep.has(id));
    if (removed.length) await tx.update(practiceTasks).set({ archivedAt: new Date() }).where(inArray(practiceTasks.id, removed));
    for (const [i, t] of clean.entries()) {
      if (t.id) {
        await tx
          .update(practiceTasks)
          .set({ title: t.title, description: t.description, isCritical: t.isCritical, sortOrder: i })
          .where(eq(practiceTasks.id, t.id));
      } else {
        await tx.insert(practiceTasks).values({ moduleId: m.id, title: t.title, description: t.description, isCritical: t.isCritical, sortOrder: i });
      }
    }
  });
}

export async function archiveModule(actor: Actor, moduleId: string): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    const { module: m, access } = await loadModule(actor, moduleId, tx);
    if (m.archivedAt) throw new ValidationError("module_archived");
    if (!canEdit(access, m) || m.cardPositionId) throw new ForbiddenError("modules.archive");
    await tx.update(modules).set({ archivedAt: new Date() }).where(eq(modules.id, m.id));
  });
}

/** Modüle eklenebilecek içerikler: görülebilen, yayında, arşivsiz. */
export async function pickableContents(actor: Actor, q: string): Promise<{ id: string; title: string; type: string; ownerName: string | null }[]> {
  assertLibrary(actor);
  const access = await contentAccessFor(actor);
  const conds: SQL[] = [isNull(contents.archivedAt), isNotNull(contents.currentPublishedVersionId)];
  if (q.trim()) conds.push(ilike(contents.title, `%${q.trim().replace(/[%_\\]/g, "\\$&")}%`));
  const rows = await db()
    .select({ id: contents.id, title: contents.title, type: contents.type, ownerOrgUnitId: contents.ownerOrgUnitId, isOhs: contents.isOhs, ownerName: orgUnits.name })
    .from(contents)
    .leftJoin(orgUnits, eq(orgUnits.id, contents.ownerOrgUnitId))
    .where(and(...conds))
    .orderBy(asc(contents.title))
    .limit(200);
  return rows.filter((r) => canViewContent(access, r)).map(({ id, title, type, ownerName }) => ({ id, title, type, ownerName }));
}
