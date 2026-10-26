import { and, asc, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertNotSelf, assertUser, can, hasRole } from "@/server/authz/policy";
import { db, type DbOrTx, type Tx } from "@/server/db/client";
import {
  approvals,
  assignmentModules,
  assignments,
  classroomAttendees,
  classroomSessions,
  mediaAssets,
  modules,
  personnel,
  users,
} from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { isDone } from "@/server/state/assignment";
import { completeModule, OPEN_STATUSES } from "./assignments/engine";
import { canApproveOhs, canApproveSection, canViewContent, contentAccessFor, type ContentAccess } from "./content/access";

/**
 * Sınıf eğitimi kaydı (FG-4.4, karar #55). Kayıt: eğitmen, bölüm sorumlusu, İSG uzmanı, İK.
 * Onay: İSG modülünde İSG uzmanı, diğerlerinde kapsamdaki bölüm sorumlusu (ortak modülde İK).
 * Onaylanınca katılımcıların açık atamasındaki ilgili modül "sınıfta" tamamlanır. Onaylı kayıt değiştirilemez.
 */

export type ClassroomStatus = "draft" | "submitted" | "approved" | "rejected";

export type ClassroomInput = {
  moduleId: string;
  trainerUserId: string;
  sessionDate: string;
  durationMin: number;
  location: string;
  notes: string | null;
  scannedFormAssetId: string | null;
  attendeeIds: string[];
};

type SessionRow = typeof classroomSessions.$inferSelect;
type ModuleRow = typeof modules.$inferSelect;

function canApprove(access: ContentAccess, m: ModuleRow): boolean {
  return m.isOhs ? canApproveOhs(access) : canApproveSection(access, m);
}

async function loadSession(conn: DbOrTx, actor: Actor & { kind: "user" }, id: string) {
  const [row] = await conn
    .select({ s: classroomSessions, m: modules })
    .from(classroomSessions)
    .innerJoin(modules, eq(modules.id, classroomSessions.moduleId))
    .where(eq(classroomSessions.id, id))
    .limit(1);
  if (!row) throw new NotFoundError("classroom_session");
  const access = await contentAccessFor(actor, conn);
  const involved = row.s.recordedBy === actor.userId || row.s.trainerUserId === actor.userId;
  if (!involved && !canApprove(access, row.m) && !hasRole(actor, "hr")) throw new NotFoundError("classroom_session");
  return { ...row, access };
}

async function validate(tx: Tx, actor: Actor & { kind: "user" }, input: ClassroomInput) {
  const location = input.location.trim();
  if (location.length < 2 || location.length > 200) throw new ValidationError("location_invalid");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.sessionDate)) throw new ValidationError("invalid_input");
  if (!Number.isInteger(input.durationMin) || input.durationMin < 1 || input.durationMin > 1440) throw new ValidationError("duration_invalid");
  const [m] = await tx.select().from(modules).where(eq(modules.id, input.moduleId)).limit(1);
  const access = await contentAccessFor(actor, tx);
  if (!m || m.archivedAt || m.kind !== "theory" || !canViewContent(access, m)) throw new ValidationError("module_invalid");
  const [t] = await tx.select({ status: personnel.status }).from(personnel).where(eq(personnel.userId, input.trainerUserId));
  if (t?.status !== "active") throw new ValidationError("trainer_invalid");
  const ids = [...new Set(input.attendeeIds)];
  if (ids.length > 500) throw new ValidationError("too_many_items");
  if (ids.includes(input.trainerUserId)) throw new ValidationError("trainer_is_trainee");
  if (ids.length) {
    const found = await tx.select({ id: personnel.userId }).from(personnel).where(and(inArray(personnel.userId, ids), eq(personnel.status, "active")));
    if (found.length !== ids.length) throw new ValidationError("attendee_invalid");
  }
  if (input.scannedFormAssetId) {
    const [a] = await tx.select({ kind: mediaAssets.kind, createdBy: mediaAssets.createdBy }).from(mediaAssets).where(eq(mediaAssets.id, input.scannedFormAssetId));
    if (!a || !["pdf", "image"].includes(a.kind)) throw new ValidationError("asset_invalid");
  }
  return { location, ids, notes: input.notes?.trim() || null };
}

export async function createClassroomSession(actor: Actor, input: ClassroomInput): Promise<{ id: string }> {
  assertUser(actor);
  assertCan(actor, "classroom.record");
  return withActor(actor, async (tx) => {
    const v = await validate(tx, actor, input);
    const [row] = await tx
      .insert(classroomSessions)
      .values({
        moduleId: input.moduleId,
        trainerUserId: input.trainerUserId,
        sessionDate: input.sessionDate,
        durationMin: input.durationMin,
        location: v.location,
        notes: v.notes,
        scannedFormAssetId: input.scannedFormAssetId,
        recordedBy: actor.userId,
      })
      .returning({ id: classroomSessions.id });
    if (v.ids.length) await tx.insert(classroomAttendees).values(v.ids.map((userId) => ({ sessionId: row!.id, userId })));
    return { id: row!.id };
  });
}

export async function updateClassroomSession(actor: Actor, id: string, input: ClassroomInput): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    const { s } = await loadSession(tx, actor, id);
    if (s.recordedBy !== actor.userId) throw new ForbiddenError("classroom.edit");
    if (s.status !== "draft" && s.status !== "rejected") throw new ValidationError("classroom_not_editable");
    const v = await validate(tx, actor, input);
    await tx
      .update(classroomSessions)
      .set({
        moduleId: input.moduleId,
        trainerUserId: input.trainerUserId,
        sessionDate: input.sessionDate,
        durationMin: input.durationMin,
        location: v.location,
        notes: v.notes,
        scannedFormAssetId: input.scannedFormAssetId,
        status: "draft",
      })
      .where(eq(classroomSessions.id, s.id));
    await tx.delete(classroomAttendees).where(eq(classroomAttendees.sessionId, s.id));
    if (v.ids.length) await tx.insert(classroomAttendees).values(v.ids.map((userId) => ({ sessionId: s.id, userId })));
  });
}

export async function submitClassroomSession(actor: Actor, id: string): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    const { s } = await loadSession(tx, actor, id);
    if (s.recordedBy !== actor.userId) throw new ForbiddenError("classroom.edit");
    if (s.status !== "draft") throw new ValidationError("classroom_not_editable");
    if (!s.scannedFormAssetId) throw new ValidationError("scanned_form_required");
    const [a] = await tx.select({ id: classroomAttendees.userId }).from(classroomAttendees).where(eq(classroomAttendees.sessionId, s.id)).limit(1);
    if (!a) throw new ValidationError("attendees_required");
    await tx.update(classroomSessions).set({ status: "submitted", submittedAt: new Date() }).where(eq(classroomSessions.id, s.id));
  });
}

async function pendingForDecision(tx: Tx, actor: Actor & { kind: "user" }, id: string) {
  const row = await loadSession(tx, actor, id);
  if (row.s.status !== "submitted") throw new ValidationError("classroom_not_pending");
  if (!canApprove(row.access, row.m)) throw new ForbiddenError(row.m.isOhs ? "content.approve_ohs" : "content.approve_section");
  // Kimse kendi kaydını onaylayamaz: kaydı tutan ve eğitimi veren onaylayamaz
  assertNotSelf(actor, row.s.recordedBy);
  assertNotSelf(actor, row.s.trainerUserId);
  return row;
}

export async function approveClassroomSession(actor: Actor, id: string): Promise<{ completed: number }> {
  assertUser(actor);
  return withActor(actor, async (tx) => {
    const { s, m } = await pendingForDecision(tx, actor, id);
    const now = new Date();
    await tx.insert(approvals).values({ subjectType: "classroom_session", subjectId: s.id, step: m.isOhs ? "ohs" : "section", decision: "approved", decidedBy: actor.userId });
    await tx.update(classroomSessions).set({ status: "approved", approvedAt: now }).where(eq(classroomSessions.id, s.id));
    // Katılımcıların açık atamasındaki modül sınıfta tamamlanır
    const attendees = await tx.select({ userId: classroomAttendees.userId }).from(classroomAttendees).where(eq(classroomAttendees.sessionId, s.id));
    if (attendees.length === 0) return { completed: 0 };
    const targets = await tx
      .select({ id: assignmentModules.id, status: assignmentModules.status })
      .from(assignmentModules)
      .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
      .where(
        and(
          eq(assignmentModules.moduleId, s.moduleId),
          inArray(assignments.userId, attendees.map((a) => a.userId)),
          inArray(assignments.status, [...OPEN_STATUSES]),
        ),
      );
    let completed = 0;
    for (const t of targets) {
      if (isDone(t.status)) continue;
      await completeModule(tx, t.id, "classroom");
      completed++;
    }
    return { completed };
  });
}

export async function rejectClassroomSession(actor: Actor, id: string, comment: string): Promise<void> {
  assertUser(actor);
  const reason = comment.trim();
  if (reason.length < 3) throw new ValidationError("reject_comment_required");
  if (reason.length > 2000) throw new ValidationError("comment_too_long");
  await withActor(actor, async (tx) => {
    const { s, m } = await pendingForDecision(tx, actor, id);
    await tx.insert(approvals).values({ subjectType: "classroom_session", subjectId: s.id, step: m.isOhs ? "ohs" : "section", decision: "rejected", comment: reason, decidedBy: actor.userId });
    await tx.update(classroomSessions).set({ status: "rejected" }).where(eq(classroomSessions.id, s.id));
  });
}

// ---------------------------------------------------------------------------
// Görünümler
// ---------------------------------------------------------------------------

export type ClassroomListItem = {
  id: string;
  moduleTitle: string;
  isOhs: boolean;
  sessionDate: string;
  location: string;
  status: ClassroomStatus;
  trainerName: string;
  attendeeCount: number;
  mine: boolean;
};

const trainerUser = alias(users, "trainer_user");

/** Kendi kayıtlarım + onayımı bekleyenler. */
export async function listClassroomSessions(actor: Actor): Promise<{ mine: ClassroomListItem[]; pending: ClassroomListItem[] }> {
  assertUser(actor);
  const canRecord = can(actor, "classroom.record");
  const access = await contentAccessFor(actor);
  const rows = await db()
    .select({ s: classroomSessions, m: modules, trainerName: trainerUser.name })
    .from(classroomSessions)
    .innerJoin(modules, eq(modules.id, classroomSessions.moduleId))
    .innerJoin(trainerUser, eq(trainerUser.id, classroomSessions.trainerUserId))
    .where(
      canRecord
        ? or(eq(classroomSessions.recordedBy, actor.userId), eq(classroomSessions.trainerUserId, actor.userId), eq(classroomSessions.status, "submitted"))
        : eq(classroomSessions.status, "submitted"),
    )
    .orderBy(desc(classroomSessions.sessionDate));
  const counts = rows.length
    ? await db()
        .select({ id: classroomAttendees.sessionId, userId: classroomAttendees.userId })
        .from(classroomAttendees)
        .where(inArray(classroomAttendees.sessionId, rows.map((r) => r.s.id)))
    : [];
  const map = (r: (typeof rows)[number]): ClassroomListItem => ({
    id: r.s.id,
    moduleTitle: r.m.title,
    isOhs: r.m.isOhs,
    sessionDate: r.s.sessionDate,
    location: r.s.location,
    status: r.s.status,
    trainerName: r.trainerName,
    attendeeCount: counts.filter((c) => c.id === r.s.id).length,
    mine: r.s.recordedBy === actor.userId || r.s.trainerUserId === actor.userId,
  });
  return {
    mine: rows.filter((r) => r.s.recordedBy === actor.userId || r.s.trainerUserId === actor.userId).map(map),
    pending: rows
      .filter((r) => r.s.status === "submitted" && r.s.recordedBy !== actor.userId && r.s.trainerUserId !== actor.userId && canApprove(access, r.m))
      .map(map),
  };
}

export type ClassroomDetail = {
  id: string;
  module: { id: string; title: string; isOhs: boolean; remoteAllowed: boolean };
  trainerUserId: string;
  trainerName: string;
  sessionDate: string;
  durationMin: number;
  location: string;
  notes: string | null;
  scannedFormAssetId: string | null;
  status: ClassroomStatus;
  recordedByName: string;
  attendees: { userId: string; name: string; sicilNo: string; hasModule: boolean }[];
  decisions: { decision: "approved" | "rejected" | "auto_self"; comment: string | null; decidedByName: string; decidedAt: Date }[];
  can: { edit: boolean; submit: boolean; approve: boolean };
};

export async function getClassroomSession(actor: Actor, id: string): Promise<ClassroomDetail> {
  assertUser(actor);
  const { s, m, access } = await loadSession(db(), actor, id);
  const recorder = alias(users, "recorder");
  const [names] = await db()
    .select({ trainerName: trainerUser.name, recordedByName: recorder.name })
    .from(classroomSessions)
    .innerJoin(trainerUser, eq(trainerUser.id, classroomSessions.trainerUserId))
    .innerJoin(recorder, eq(recorder.id, classroomSessions.recordedBy))
    .where(eq(classroomSessions.id, s.id));
  const attendeeRows = await db()
    .select({ userId: personnel.userId, name: personnel.fullName, sicilNo: personnel.sicilNo })
    .from(classroomAttendees)
    .innerJoin(personnel, eq(personnel.userId, classroomAttendees.userId))
    .where(eq(classroomAttendees.sessionId, s.id))
    .orderBy(asc(personnel.fullName));
  const withModule = attendeeRows.length
    ? await db()
        .selectDistinct({ userId: assignments.userId })
        .from(assignmentModules)
        .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
        .where(and(eq(assignmentModules.moduleId, s.moduleId), inArray(assignments.userId, attendeeRows.map((a) => a.userId))))
    : [];
  const hasModule = new Set(withModule.map((w) => w.userId));
  const decisions = await db()
    .select({ decision: approvals.decision, comment: approvals.comment, decidedByName: users.name, decidedAt: approvals.decidedAt })
    .from(approvals)
    .innerJoin(users, eq(users.id, approvals.decidedBy))
    .where(and(eq(approvals.subjectType, "classroom_session"), eq(approvals.subjectId, s.id)))
    .orderBy(asc(approvals.decidedAt));
  const editable = s.recordedBy === actor.userId && (s.status === "draft" || s.status === "rejected");
  return {
    id: s.id,
    module: { id: m.id, title: m.title, isOhs: m.isOhs, remoteAllowed: m.remoteAllowed },
    trainerUserId: s.trainerUserId,
    trainerName: names?.trainerName ?? "—",
    sessionDate: s.sessionDate,
    durationMin: s.durationMin,
    location: s.location,
    notes: s.notes,
    scannedFormAssetId: s.scannedFormAssetId,
    status: s.status,
    recordedByName: names?.recordedByName ?? "—",
    attendees: attendeeRows.map((a) => ({ ...a, hasModule: hasModule.has(a.userId) })),
    decisions,
    can: {
      edit: editable,
      submit: s.recordedBy === actor.userId && s.status === "draft",
      approve: s.status === "submitted" && canApprove(access, m) && s.recordedBy !== actor.userId && s.trainerUserId !== actor.userId,
    },
  };
}

/** Sınıf eğitimi yapılabilecek teorik modüller. */
export async function classroomModules(actor: Actor) {
  assertCan(actor, "classroom.record");
  const access = await contentAccessFor(actor);
  const rows = await db()
    .select()
    .from(modules)
    .where(and(eq(modules.kind, "theory"), isNull(modules.archivedAt), isNull(modules.cardPositionId)))
    .orderBy(asc(modules.title));
  return rows.filter((m) => canViewContent(access, m)).map((m) => ({ id: m.id, title: m.title, isOhs: m.isOhs, remoteAllowed: m.remoteAllowed, durationMin: m.durationMin }));
}

/** Katılımcı/eğitmen arama: aktif personel (ad veya sicil). */
export async function searchPeople(actor: Actor, q: string): Promise<{ userId: string; name: string; sicilNo: string }[]> {
  assertCan(actor, "classroom.record");
  const term = q.trim().replace(/[%_\\]/g, "\\$&");
  if (term.length < 2) return [];
  return db()
    .select({ userId: personnel.userId, name: personnel.fullName, sicilNo: personnel.sicilNo })
    .from(personnel)
    .where(and(eq(personnel.status, "active"), or(ilike(personnel.fullName, `%${term}%`), ilike(personnel.sicilNo, `${term}%`))))
    .orderBy(asc(personnel.fullName))
    .limit(30);
}

export type { SessionRow };
