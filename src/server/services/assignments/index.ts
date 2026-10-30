import { and, asc, desc, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertNotSelf, assertUser, hasAnyRole, hasRole } from "@/server/authz/policy";
import { inOrgScope, isPersonInScope, orgScopeFor } from "@/server/authz/scope";
import { db, type DbOrTx } from "@/server/db/client";
import {
  assignmentItems,
  assignmentModules,
  assignments,
  contents,
  personnel,
  positionCardVersions,
  positions,
  rereadTasks,
  userRoles,
  users,
} from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { lockReason, nextModule, type ModuleKind, type ModuleStatus } from "@/server/state/assignment";
import { OPEN_STATUSES, createAssignment, notifyTrainer, refreshAssignment, today } from "./engine";

/**
 * Eğitim atamaları (SPEC 4.3): görünümler ve İK işlemleri.
 * Görme: kişinin kendisi, İK, kapsamdaki bölüm sorumlusu, atamanın eğitmeni.
 */

export type AssignmentStatus = (typeof assignments.$inferSelect)["status"];

export type ModuleSummary = {
  id: string;
  moduleId: string;
  kind: ModuleKind;
  title: string;
  durationMin: number;
  status: ModuleStatus;
  isRequired: boolean;
  isCommon: boolean;
  isOhs: boolean;
  remoteAllowed: boolean;
  completedVia: "online" | "classroom" | "carried_over" | null;
  completedAt: Date | null;
  expiresAt: Date | null;
  itemsDone: number;
  itemsTotal: number;
  lock: { kind: "prerequisites"; titles: string[] } | { kind: "trainer" } | null;
};

export type AssignmentSummary = {
  id: string;
  userId: string;
  personName: string;
  sicilNo: string;
  positionName: string;
  cardVersion: number;
  reason: "new_hire" | "position_change" | "recertification" | "extra_training" | "periodic";
  status: AssignmentStatus;
  startDate: string;
  targetDate: string | null;
  overdue: boolean;
  trainerUserId: string | null;
  trainerName: string | null;
  cancelReason: string | null;
  createdAt: Date;
  modules: ModuleSummary[];
  progress: number;
  remainingMinutes: number;
  nextModuleId: string | null;
};

const trainer = alias(users, "trainer");

async function summarize(conn: DbOrTx, ids: string[]): Promise<AssignmentSummary[]> {
  if (ids.length === 0) return [];
  const rows = await conn
    .select({
      a: assignments,
      personName: personnel.fullName,
      sicilNo: personnel.sicilNo,
      positionName: positions.name,
      cardVersion: positionCardVersions.version,
      trainerName: trainer.name,
    })
    .from(assignments)
    .innerJoin(personnel, eq(personnel.userId, assignments.userId))
    .innerJoin(positions, eq(positions.id, assignments.positionId))
    .innerJoin(positionCardVersions, eq(positionCardVersions.id, assignments.cardVersionId))
    .leftJoin(trainer, eq(trainer.id, assignments.trainerUserId))
    .where(inArray(assignments.id, ids))
    .orderBy(desc(assignments.createdAt));
  const mods = await conn.select().from(assignmentModules).where(inArray(assignmentModules.assignmentId, ids)).orderBy(asc(assignmentModules.sortOrder));
  const itemCounts = await conn
    .select({
      id: assignmentItems.assignmentModuleId,
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(${assignmentItems.acknowledgedAt})::int`,
    })
    .from(assignmentItems)
    .innerJoin(assignmentModules, and(eq(assignmentModules.id, assignmentItems.assignmentModuleId), eq(assignmentModules.round, assignmentItems.round)))
    .where(inArray(assignmentItems.assignmentModuleId, mods.length ? mods.map((m) => m.id) : ["00000000-0000-0000-0000-000000000000"]))
    .groupBy(assignmentItems.assignmentModuleId);
  const counts = new Map(itemCounts.map((c) => [c.id, c]));
  const todayStr = await today();

  return rows.map(({ a, personName, sicilNo, positionName, cardVersion, trainerName }) => {
    const own = mods.filter((m) => m.assignmentId === a.id);
    const titleOf = new Map(own.map((m) => [m.moduleId, m.title]));
    const hasTrainer = !!a.trainerUserId;
    const modules: ModuleSummary[] = own.map((m) => {
      const lr = lockReason(m, own, hasTrainer);
      const c = counts.get(m.id);
      return {
        id: m.id,
        moduleId: m.moduleId,
        kind: m.kind,
        title: m.title,
        durationMin: m.durationMin,
        status: m.status,
        isRequired: m.isRequired,
        isCommon: m.isCommon,
        isOhs: m.isOhs,
        remoteAllowed: m.remoteAllowed,
        completedVia: m.completedVia,
        completedAt: m.completedAt,
        expiresAt: m.expiresAt,
        itemsDone: c?.done ?? 0,
        itemsTotal: c?.total ?? 0,
        lock: lr ? (lr.kind === "trainer" ? lr : { kind: "prerequisites", titles: lr.moduleIds.map((id) => titleOf.get(id) ?? "—") }) : null,
      };
    });
    const required = modules.filter((m) => m.isRequired);
    const requiredMinutes = required.reduce((s, m) => s + m.durationMin, 0);
    const doneMinutes = required.filter((m) => m.status === "completed" || m.status === "waived").reduce((s, m) => s + m.durationMin, 0);
    const next = nextModule(own);
    const open = (OPEN_STATUSES as readonly string[]).includes(a.status);
    return {
      id: a.id,
      userId: a.userId,
      personName,
      sicilNo,
      positionName,
      cardVersion,
      reason: a.reason,
      status: a.status,
      startDate: a.startDate,
      targetDate: a.targetDate,
      overdue: open && a.status === "active" && !!a.targetDate && a.targetDate < todayStr,
      trainerUserId: a.trainerUserId,
      trainerName,
      cancelReason: a.cancelReason,
      createdAt: a.createdAt,
      modules,
      progress: requiredMinutes ? Math.round((doneMinutes / requiredMinutes) * 100) : 0,
      remainingMinutes: requiredMinutes - doneMinutes,
      nextModuleId: next?.id ?? null,
    };
  });
}

export async function canViewPerson(actor: Actor, userId: string, conn: DbOrTx = db()): Promise<boolean> {
  if (actor.kind === "system") return true;
  if (actor.userId === userId) return true;
  if (hasRole(actor, "hr")) return true;
  if (hasRole(actor, "section_manager") && (await isPersonInScope(actor, userId, conn))) return true;
  if (hasRole(actor, "trainer")) {
    const [row] = await conn
      .select({ id: assignments.id })
      .from(assignments)
      .where(and(eq(assignments.userId, userId), eq(assignments.trainerUserId, actor.userId)))
      .limit(1);
    return !!row;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Kursiyer görünümü
// ---------------------------------------------------------------------------

export type RereadTaskItem = { id: string; contentTitle: string; dueDate: string; overdue: boolean; acknowledgedAt: Date | null };

export async function myLearning(actor: Actor): Promise<{ current: AssignmentSummary | null; history: AssignmentSummary[]; rereads: RereadTaskItem[] }> {
  assertUser(actor);
  const rows = await db().select({ id: assignments.id, status: assignments.status }).from(assignments).where(eq(assignments.userId, actor.userId)).orderBy(desc(assignments.createdAt));
  const all = await summarize(db(), rows.map((r) => r.id));
  const current = all.find((a) => (OPEN_STATUSES as readonly string[]).includes(a.status)) ?? null;
  const todayStr = await today();
  const tasks = await db()
    .select({ id: rereadTasks.id, contentTitle: contents.title, dueDate: rereadTasks.dueDate, acknowledgedAt: rereadTasks.acknowledgedAt })
    .from(rereadTasks)
    .innerJoin(contents, eq(contents.id, rereadTasks.contentId))
    .where(and(eq(rereadTasks.userId, actor.userId), isNull(rereadTasks.acknowledgedAt)))
    .orderBy(asc(rereadTasks.dueDate));
  return {
    current,
    history: all.filter((a) => a.id !== current?.id),
    rereads: tasks.map((t) => ({ ...t, overdue: t.dueDate < todayStr })),
  };
}

// ---------------------------------------------------------------------------
// Yönetim görünümleri
// ---------------------------------------------------------------------------

/** Kişinin atamaları (personel sayfası). */
export async function assignmentsForPerson(actor: Actor, userId: string): Promise<AssignmentSummary[]> {
  if (!(await canViewPerson(actor, userId))) throw new NotFoundError("person");
  const rows = await db().select({ id: assignments.id }).from(assignments).where(eq(assignments.userId, userId));
  return summarize(db(), rows.map((r) => r.id));
}

/** Eğitmenin kursiyerleri (açık atamalar). */
export async function myTrainees(actor: Actor): Promise<AssignmentSummary[]> {
  assertUser(actor);
  const rows = await db()
    .select({ id: assignments.id })
    .from(assignments)
    .where(and(eq(assignments.trainerUserId, actor.userId), inArray(assignments.status, [...OPEN_STATUSES])));
  return summarize(db(), rows.map((r) => r.id));
}

/** Ekip ilerlemesi (karar #57): bölüm sorumlusu kapsamındaki, İK tüm açık atamalar. */
export async function teamProgress(actor: Actor): Promise<AssignmentSummary[]> {
  assertUser(actor);
  if (!hasAnyRole(actor, ["section_manager", "hr"])) throw new ForbiddenError("assignments.view");
  const scope = await orgScopeFor(actor);
  const rows = await db()
    .select({ id: assignments.id, orgUnitId: positions.orgUnitId })
    .from(assignments)
    .innerJoin(positions, eq(positions.id, assignments.positionId))
    .where(inArray(assignments.status, [...OPEN_STATUSES]));
  return summarize(db(), rows.filter((r) => inOrgScope(scope, r.orgUnitId)).map((r) => r.id));
}

export type WaitingPerson = { userId: string; fullName: string; sicilNo: string; positionName: string | null; reason: "no_position" | "no_published_card" | "ready" };

/** Eğitimi bekleyenler (karar #49): eğitimi gereken, hiç ataması olmamış aktif personel. */
export async function waitingForTraining(actor: Actor): Promise<WaitingPerson[]> {
  assertCan(actor, "assignments.manage");
  const published = db()
    .select({ positionId: positionCardVersions.positionId })
    .from(positionCardVersions)
    .where(eq(positionCardVersions.status, "published"));
  const rows = await db()
    .select({ userId: personnel.userId, fullName: personnel.fullName, sicilNo: personnel.sicilNo, positionId: personnel.positionId, positionName: positions.name })
    .from(personnel)
    .leftJoin(positions, eq(positions.id, personnel.positionId))
    .where(
      and(
        eq(personnel.trainingRequired, true),
        eq(personnel.status, "active"),
        notInArray(personnel.userId, db().select({ id: assignments.userId }).from(assignments)),
      ),
    )
    .orderBy(asc(personnel.fullName));
  const withCard = new Set((await published).map((p) => p.positionId));
  return rows.map((r) => ({
    userId: r.userId,
    fullName: r.fullName,
    sicilNo: r.sicilNo,
    positionName: r.positionName,
    reason: !r.positionId ? "no_position" : withCard.has(r.positionId) ? "ready" : "no_published_card",
  }));
}

/** Pratik eğitmen adayları: aktif eğitmen ve bölüm sorumluları. */
export async function trainerCandidates(actor: Actor): Promise<{ userId: string; name: string; sicilNo: string }[]> {
  assertCan(actor, "assignments.manage");
  return db()
    .selectDistinct({ userId: personnel.userId, name: personnel.fullName, sicilNo: personnel.sicilNo })
    .from(personnel)
    .innerJoin(userRoles, eq(userRoles.userId, personnel.userId))
    .where(and(eq(personnel.status, "active"), or(eq(userRoles.role, "trainer"), eq(userRoles.role, "section_manager"))))
    .orderBy(asc(personnel.fullName));
}

// ---------------------------------------------------------------------------
// İK işlemleri
// ---------------------------------------------------------------------------

async function assertTrainer(conn: DbOrTx, trainerUserId: string, traineeId: string) {
  if (trainerUserId === traineeId) throw new ValidationError("trainer_is_trainee");
  const roles = await conn.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, trainerUserId));
  const [p] = await conn.select({ status: personnel.status }).from(personnel).where(eq(personnel.userId, trainerUserId));
  if (p?.status !== "active" || !roles.some((r) => r.role === "trainer" || r.role === "section_manager")) throw new ValidationError("trainer_invalid");
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Eğitimi elle başlatır (karar #56): eğitimi gerekmeyen personel için gerekçe "extra_training". */
export async function startAssignment(actor: Actor, userId: string, input: { trainerUserId: string | null; targetDate: string | null }): Promise<{ id: string }> {
  assertCan(actor, "assignments.manage");
  assertUser(actor);
  assertNotSelf(actor, userId);
  if (input.targetDate && !DATE.test(input.targetDate)) throw new ValidationError("invalid_input");
  return withActor(actor, async (tx) => {
    const [person] = await tx.select().from(personnel).where(eq(personnel.userId, userId)).limit(1);
    if (!person) throw new NotFoundError("person");
    if (person.status !== "active") throw new ValidationError("person_inactive");
    if (!person.positionId) throw new ValidationError("person_no_position");
    const [open] = await tx.select({ id: assignments.id }).from(assignments).where(and(eq(assignments.userId, userId), inArray(assignments.status, [...OPEN_STATUSES]))).limit(1);
    if (open) throw new ValidationError("assignment_exists");
    if (input.trainerUserId) await assertTrainer(tx, input.trainerUserId, userId);
    const [previous] = await tx.select({ id: assignments.id }).from(assignments).where(eq(assignments.userId, userId)).limit(1);
    const id = await createAssignment(tx, {
      userId,
      reason: person.trainingRequired && !previous ? "new_hire" : "extra_training",
      createdBy: actor.userId,
      trainerUserId: input.trainerUserId,
      targetDate: input.targetDate,
    });
    if (!id) throw new ValidationError("no_published_card");
    return { id };
  });
}

/** Eğitmen ve hedef tarih (FG-3.2). Eğitmen seçilince pratik modüllerin kilidi açılabilir. */
export async function updateAssignment(actor: Actor, assignmentId: string, input: { trainerUserId: string | null; targetDate: string | null }): Promise<void> {
  assertCan(actor, "assignments.manage");
  assertUser(actor);
  if (input.targetDate && !DATE.test(input.targetDate)) throw new ValidationError("invalid_input");
  await withActor(actor, async (tx) => {
    const [a] = await tx.select().from(assignments).where(eq(assignments.id, assignmentId)).limit(1).for("update");
    if (!a) throw new NotFoundError("assignment");
    if (!(OPEN_STATUSES as readonly string[]).includes(a.status)) throw new ValidationError("assignment_closed");
    if (input.trainerUserId) await assertTrainer(tx, input.trainerUserId, a.userId);
    await tx.update(assignments).set({ trainerUserId: input.trainerUserId, targetDate: input.targetDate }).where(eq(assignments.id, a.id));
    await refreshAssignment(tx, a.id);
    if (input.trainerUserId && input.trainerUserId !== a.trainerUserId) await notifyTrainer(tx, a.id, input.trainerUserId, a.userId);
  });
}

export async function cancelAssignment(actor: Actor, assignmentId: string, reason: string): Promise<void> {
  assertCan(actor, "assignments.manage");
  assertUser(actor);
  const text = reason.trim();
  if (text.length < 3 || text.length > 1000) throw new ValidationError("cancel_reason_required");
  await withActor(actor, async (tx) => {
    const [a] = await tx.select().from(assignments).where(eq(assignments.id, assignmentId)).limit(1).for("update");
    if (!a) throw new NotFoundError("assignment");
    if (!(OPEN_STATUSES as readonly string[]).includes(a.status)) throw new ValidationError("assignment_closed");
    await tx.update(assignments).set({ status: "cancelled", cancelReason: text, cancelledAt: new Date(), cancelledBy: actor.userId }).where(eq(assignments.id, a.id));
  });
}
