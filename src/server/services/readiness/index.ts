import { and, asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Actor, UserActor } from "@/server/authz/actor";
import { assertCan, assertUser, hasRole } from "@/server/authz/policy";
import { recordOwnerAction } from "@/server/services/owner-actions";
import { isPersonInScope } from "@/server/authz/scope";
import { db, type DbOrTx, type Tx } from "@/server/db/client";
import {
  assignmentModules,
  assignments,
  attemptGrants,
  decisionRecords,
  examAttempts,
  orgUnits,
  positions,
  practicalExamResults,
  practiceMarks,
  readinessDecisions,
  users,
} from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import type { ModuleKind, ModuleStatus } from "@/server/state/assignment";
import { attemptsLeft } from "@/server/state/exam";
import { currentLevels } from "@/server/state/practice";
import { refreshAssignment, reopenModule } from "../assignments/engine";
import { issuePositionCertificate } from "../certificates";
import { planDefaults } from "../positions/plan-settings";
import { resolveNotifications } from "../notifications";
import { getSettings } from "../settings";

/**
 * İşe başlama onayı (FG-7.1, Ekran 9) ve tüm haklar bitince insan kararı (SPEC 3.1).
 *  - Onay/ret: kişiyi kapsamında tutan bölüm sorumlusu (karar #74). Ret: gerekçe + tekrar açılacak modüller (karar #75).
 *  - Karar: İK veya kapsamdaki bölüm sorumlusu; ek hak / ek eğitim / süreci sonlandır, gerekçeyle (karar #76).
 *  - Kimse kendi atamasına karar veremez. Kararlar değiştirilemez.
 */

type AssignmentRow = typeof assignments.$inferSelect;
type ModuleRow = typeof assignmentModules.$inferSelect;

const MAX_TEXT = 2000;

async function canDecideReadiness(actor: UserActor, a: AssignmentRow, conn: DbOrTx = db()): Promise<boolean> {
  if (actor.userId === a.userId) return false;
  return hasRole(actor, "section_manager") && (await isPersonInScope(actor, a.userId, conn));
}

async function canDecideProcess(actor: UserActor, a: AssignmentRow, conn: DbOrTx = db()): Promise<boolean> {
  if (actor.userId === a.userId) return false;
  if (hasRole(actor, "hr")) return true;
  return hasRole(actor, "section_manager") && (await isPersonInScope(actor, a.userId, conn));
}

async function canView(actor: UserActor, a: AssignmentRow, conn: DbOrTx = db()): Promise<boolean> {
  return (await canDecideReadiness(actor, a, conn)) || (await canDecideProcess(actor, a, conn));
}

function cleanText(text: string | null | undefined, required: boolean): string | null {
  const t = text?.trim() ?? "";
  if (required && t.length < 3) throw new ValidationError("reject_comment_required");
  if (t.length > MAX_TEXT) throw new ValidationError("comment_too_long");
  return t || null;
}

// ---------------------------------------------------------------------------
// Sınav hakları (tekrar açmada ve ek hak kararında)
// ---------------------------------------------------------------------------

async function examLeft(tx: DbOrTx, am: ModuleRow): Promise<number> {
  const defaults = await planDefaults();
  const s = am.settings as { maxAttempts?: number };
  const [g] = await tx
    .select({ n: sql<number>`coalesce(sum(${attemptGrants.extraAttempts}), 0)::int` })
    .from(attemptGrants)
    .where(eq(attemptGrants.assignmentModuleId, am.id));
  if (am.kind === "theory_exam") {
    const [u] = await tx.select({ n: sql<number>`count(*)::int` }).from(examAttempts).where(eq(examAttempts.assignmentModuleId, am.id));
    return attemptsLeft(s.maxAttempts ?? defaults.theory_exam.maxAttempts, Number(g?.n ?? 0), Number(u?.n ?? 0));
  }
  const [u] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(practicalExamResults)
    .where(and(eq(practicalExamResults.assignmentModuleId, am.id), eq(practicalExamResults.status, "final")));
  return attemptsLeft(s.maxAttempts ?? defaults.practice_exam.maxAttempts, Number(g?.n ?? 0), Number(u?.n ?? 0));
}

const isExam = (kind: ModuleKind) => kind === "theory_exam" || kind === "practice_exam";

/**
 * Seçilen tamamlanmış modülleri tekrar açar (karar #75):
 *  teorik → yeni tur; pratik → bütün görevler "gözetiminde yaptı"ya düşer; sınav → yeniden açılır, hakkı kalmadıysa +1 hak.
 */
async function reopenForReview(tx: Tx, actor: UserActor, a: AssignmentRow, moduleIds: string[], reason: string): Promise<void> {
  const mods = await tx.select().from(assignmentModules).where(eq(assignmentModules.assignmentId, a.id));
  const chosen = [...new Set(moduleIds)].map((id) => mods.find((m) => m.id === id));
  if (chosen.length === 0 || chosen.some((m) => !m || m.status !== "completed")) throw new ValidationError("reopen_modules_invalid");
  for (const m of chosen as ModuleRow[]) {
    if (m.kind === "theory") {
      await reopenModule(tx, m.id);
      continue;
    }
    const reset = { status: "review_required" as const, completedAt: null, completedVia: null, expiresAt: null };
    if (m.kind === "practice") {
      const marks = await tx
        .select({ practiceTaskId: practiceMarks.practiceTaskId, level: practiceMarks.level })
        .from(practiceMarks)
        .where(eq(practiceMarks.assignmentModuleId, m.id))
        .orderBy(asc(practiceMarks.markedAt), asc(practiceMarks.id));
      const levels = currentLevels(marks);
      const down = m.pinnedTaskIds.filter((t) => levels.get(t) === "independent");
      if (down.length) {
        await tx.insert(practiceMarks).values(
          down.map((t) => ({ assignmentModuleId: m.id, practiceTaskId: t, level: "supervised" as const, direction: "down" as const, note: reason, source: "readiness" as const, markedBy: actor.userId })),
        );
      }
      await tx.update(assignmentModules).set(reset).where(eq(assignmentModules.id, m.id));
      continue;
    }
    // Sınav: ön koşulları tamamsa yeniden açılır (refresh); hakkı kalmadıysa gerekçeli +1 hak
    await tx.update(assignmentModules).set({ status: "locked", unlockedAt: null, completedAt: null, completedVia: null, expiresAt: null }).where(eq(assignmentModules.id, m.id));
    if ((await examLeft(tx, m)) <= 0) await tx.insert(attemptGrants).values({ assignmentModuleId: m.id, extraAttempts: 1, reason, grantedBy: actor.userId });
  }
}

// ---------------------------------------------------------------------------
// Kuyruklar
// ---------------------------------------------------------------------------

export type PendingPerson = { assignmentId: string; userId: string; name: string; sicilNo: string | null; positionName: string; unitName: string; since: Date };

async function pending(actor: UserActor, status: "awaiting_readiness" | "awaiting_decision", check: (a: AssignmentRow) => Promise<boolean>): Promise<PendingPerson[]> {
  const rows = await db()
    .select({ a: assignments, name: users.name, sicilNo: users.username, positionName: positions.name, unitName: orgUnits.name })
    .from(assignments)
    .innerJoin(users, eq(users.id, assignments.userId))
    .innerJoin(positions, eq(positions.id, assignments.positionId))
    .innerJoin(orgUnits, eq(orgUnits.id, positions.orgUnitId))
    .where(eq(assignments.status, status))
    .orderBy(asc(assignments.updatedAt));
  const out: PendingPerson[] = [];
  for (const r of rows) {
    if (await check(r.a)) out.push({ assignmentId: r.a.id, userId: r.a.userId, name: r.name, sicilNo: r.sicilNo, positionName: r.positionName, unitName: r.unitName, since: r.a.updatedAt });
  }
  return out;
}

/** İşe başlama onayı bekleyenler (bölüm sorumlusu, kapsamı). */
export async function readinessQueue(actor: Actor): Promise<PendingPerson[]> {
  assertUser(actor);
  if (!hasRole(actor, "section_manager")) return [];
  return pending(actor, "awaiting_readiness", (a) => canDecideReadiness(actor, a));
}

/** Tüm haklarda başarısız, karar bekleyenler (İK ve kapsamdaki bölüm sorumlusu). */
export async function decisionQueue(actor: Actor): Promise<PendingPerson[]> {
  assertUser(actor);
  if (!hasRole(actor, "section_manager") && !hasRole(actor, "hr")) return [];
  return pending(actor, "awaiting_decision", (a) => canDecideProcess(actor, a));
}

// ---------------------------------------------------------------------------
// İnceleme ekranı (Ekran 9)
// ---------------------------------------------------------------------------

export type ReviewModule = {
  id: string;
  title: string;
  kind: ModuleKind;
  status: ModuleStatus;
  isOhs: boolean;
  durationMin: number;
  completedAt: Date | null;
  completedVia: "online" | "classroom" | "carried_over" | null;
  expiresAt: Date | null;
  attemptsLeft: number | null;
};

export type ReadinessReview = {
  assignmentId: string;
  status: AssignmentRow["status"];
  /** Tekrar eğitiminde onay ekranı "Tekrar eğitimi onayı" olarak gösterilir (karar #169). */
  reason: AssignmentRow["reason"];
  person: { userId: string; name: string; sicilNo: string | null; positionName: string; unitName: string; trainerName: string | null };
  startDate: string;
  modules: ReviewModule[];
  history: {
    id: string;
    type: "readiness" | "process";
    decision: "approved" | "rejected" | "extra_attempt" | "extra_training" | "end_process";
    text: string | null;
    byName: string;
    at: Date;
    moduleTitles: string[];
  }[];
  can: { readiness: boolean; process: boolean };
};

export async function readinessReview(actor: Actor, assignmentId: string): Promise<ReadinessReview> {
  assertUser(actor);
  const trainer = alias(users, "trainer");
  const [row] = await db()
    .select({ a: assignments, name: users.name, sicilNo: users.username, positionName: positions.name, unitName: orgUnits.name, trainerName: trainer.name })
    .from(assignments)
    .innerJoin(users, eq(users.id, assignments.userId))
    .innerJoin(positions, eq(positions.id, assignments.positionId))
    .innerJoin(orgUnits, eq(orgUnits.id, positions.orgUnitId))
    .leftJoin(trainer, eq(trainer.id, assignments.trainerUserId))
    .where(eq(assignments.id, assignmentId))
    .limit(1);
  if (!row || !(await canView(actor, row.a))) throw new NotFoundError("assignment");
  const mods = await db().select().from(assignmentModules).where(eq(assignmentModules.assignmentId, assignmentId)).orderBy(asc(assignmentModules.sortOrder));
  const modules: ReviewModule[] = [];
  for (const m of mods) {
    modules.push({
      id: m.id,
      title: m.title,
      kind: m.kind,
      status: m.status,
      isOhs: m.isOhs,
      durationMin: m.durationMin,
      completedAt: m.completedAt,
      completedVia: m.completedVia,
      expiresAt: m.expiresAt,
      attemptsLeft: isExam(m.kind) ? await examLeft(db(), m) : null,
    });
  }
  const decider = alias(users, "decider");
  const rd = await db()
    .select({ d: readinessDecisions, byName: decider.name })
    .from(readinessDecisions)
    .innerJoin(decider, eq(decider.id, readinessDecisions.decidedBy))
    .where(eq(readinessDecisions.assignmentId, assignmentId));
  const pd = await db()
    .select({ d: decisionRecords, byName: decider.name })
    .from(decisionRecords)
    .innerJoin(decider, eq(decider.id, decisionRecords.decidedBy))
    .where(eq(decisionRecords.assignmentId, assignmentId));
  const titles = (ids: string[]) => ids.map((id) => mods.find((m) => m.id === id)?.title ?? "—");
  const history: ReadinessReview["history"] = [
    ...rd.map((x) => ({ id: x.d.id, type: "readiness" as const, decision: x.d.decision, text: x.d.comment, byName: x.byName, at: x.d.decidedAt, moduleTitles: titles(x.d.reopenModuleIds) })),
    ...pd.map((x) => ({
      id: x.d.id,
      type: "process" as const,
      decision: x.d.decision,
      text: x.d.reason,
      byName: x.byName,
      at: x.d.decidedAt,
      moduleTitles: titles([...(x.d.examModuleId ? [x.d.examModuleId] : []), ...x.d.reopenModuleIds]),
    })),
  ].sort((p, q) => q.at.getTime() - p.at.getTime());
  return {
    assignmentId: row.a.id,
    status: row.a.status,
    person: { userId: row.a.userId, name: row.name, sicilNo: row.sicilNo, positionName: row.positionName, unitName: row.unitName, trainerName: row.trainerName },
    startDate: row.a.startDate,
    reason: row.a.reason,
    modules,
    history,
    can: {
      readiness: row.a.status === "awaiting_readiness" && (await canDecideReadiness(actor, row.a)),
      process: row.a.status === "awaiting_decision" && (await canDecideProcess(actor, row.a)),
    },
  };
}

async function lockAssignment(tx: Tx, id: string): Promise<AssignmentRow> {
  const [a] = await tx.select().from(assignments).where(eq(assignments.id, id)).limit(1).for("update");
  if (!a) throw new NotFoundError("assignment");
  return a;
}

// ---------------------------------------------------------------------------
// İşe başlama onayı / ret (FG-7.1)
// ---------------------------------------------------------------------------

/** Onay: atama tamamlanır ve pozisyon yetkinlik sertifikası düzenlenir. */
export async function approveReadiness(actor: Actor, assignmentId: string, comment: string | null): Promise<{ certificateId: string }> {
  assertUser(actor);
  assertCan(actor, "readiness.decide");
  return withActor(actor, async (tx) => {
    const a = await lockAssignment(tx, assignmentId);
    if (a.userId === actor.userId) throw new ForbiddenError("self_action");
    if (!(await canDecideReadiness(actor, a, tx))) throw new ForbiddenError("readiness.decide");
    await recordOwnerAction(tx, actor, "readiness.decide", { type: "assignment", id: a.id });
    if (a.status !== "awaiting_readiness") throw new ValidationError("readiness_not_pending");
    await tx.insert(readinessDecisions).values({ assignmentId: a.id, decision: "approved", comment: cleanText(comment, false), decidedBy: actor.userId });
    await resolveNotifications(tx, `readiness:${a.id}`);
    await tx.update(assignments).set({ status: "completed" }).where(eq(assignments.id, a.id));
    return { certificateId: await issuePositionCertificate(tx, { assignmentId: a.id, approvedBy: actor.userId }) };
  });
}

/** Ret: gerekçe zorunlu; seçilen modüller tekrar açılır ve atama yeniden süreç içine döner (karar #75). */
export async function rejectReadiness(actor: Actor, assignmentId: string, input: { comment: string; reopenModuleIds: string[] }): Promise<void> {
  assertUser(actor);
  assertCan(actor, "readiness.decide");
  const comment = cleanText(input.comment, true)!;
  await withActor(actor, async (tx) => {
    const a = await lockAssignment(tx, assignmentId);
    if (a.userId === actor.userId) throw new ForbiddenError("self_action");
    if (!(await canDecideReadiness(actor, a, tx))) throw new ForbiddenError("readiness.decide");
    await recordOwnerAction(tx, actor, "readiness.decide", { type: "assignment", id: a.id });
    if (a.status !== "awaiting_readiness") throw new ValidationError("readiness_not_pending");
    await reopenForReview(tx, actor, a, input.reopenModuleIds, comment);
    await resolveNotifications(tx, `readiness:${a.id}`);
    await tx.insert(readinessDecisions).values({ assignmentId: a.id, decision: "rejected", comment, reopenModuleIds: [...new Set(input.reopenModuleIds)], decidedBy: actor.userId });
    await tx.update(assignments).set({ status: "active" }).where(eq(assignments.id, a.id));
    await refreshAssignment(tx, a.id);
  });
}

// ---------------------------------------------------------------------------
// Tüm haklar bitince karar (SPEC 3.1)
// ---------------------------------------------------------------------------

export type ProcessDecisionInput =
  | { decision: "extra_attempt"; reason: string; examModuleId: string; extraAttempts: number | null }
  | { decision: "extra_training"; reason: string; reopenModuleIds: string[] }
  | { decision: "end_process"; reason: string };

export async function decideProcess(actor: Actor, assignmentId: string, input: ProcessDecisionInput): Promise<void> {
  assertUser(actor);
  assertCan(actor, "process.decide");
  const reason = cleanText(input.reason, true)!;
  const defaults = await getSettings(["decision.extra_attempts_default"]);
  await withActor(actor, async (tx) => {
    const a = await lockAssignment(tx, assignmentId);
    if (a.userId === actor.userId) throw new ForbiddenError("self_action");
    if (!(await canDecideProcess(actor, a, tx))) throw new ForbiddenError("process.decide");
    await recordOwnerAction(tx, actor, "process.decide", { type: "assignment", id: a.id });
    if (a.status !== "awaiting_decision") throw new ValidationError("decision_not_pending");
    const mods = await tx.select().from(assignmentModules).where(eq(assignmentModules.assignmentId, a.id));
    await resolveNotifications(tx, `decision:${a.id}`);

    if (input.decision === "end_process") {
      await tx.insert(decisionRecords).values({ assignmentId: a.id, decision: "end_process", reason, decidedBy: actor.userId });
      // Personel kaydına dokunulmaz; işten çıkarma gibi kararlar sistem dışındadır
      await tx.update(assignments).set({ status: "cancelled", cancelReason: reason, cancelledAt: new Date(), cancelledBy: actor.userId }).where(eq(assignments.id, a.id));
      return;
    }

    if (input.decision === "extra_attempt") {
      const exam = mods.find((m) => m.id === input.examModuleId);
      if (!exam || !isExam(exam.kind) || exam.status === "completed") throw new ValidationError("decision_exam_invalid");
      const n = input.extraAttempts ?? defaults["decision.extra_attempts_default"];
      if (!Number.isInteger(n) || n < 1 || n > 10) throw new ValidationError("invalid_input");
      await tx.insert(attemptGrants).values({ assignmentModuleId: exam.id, extraAttempts: n, reason, grantedBy: actor.userId });
      await tx.insert(decisionRecords).values({ assignmentId: a.id, decision: "extra_attempt", reason, examModuleId: exam.id, extraAttempts: n, decidedBy: actor.userId });
    } else {
      await reopenForReview(tx, actor, a, input.reopenModuleIds, reason);
      // Hakkı biten (kalınan) sınavlara +1 hak
      for (const m of mods.filter((x) => isExam(x.kind) && x.status !== "completed" && !input.reopenModuleIds.includes(x.id))) {
        if ((await examLeft(tx, m)) <= 0) await tx.insert(attemptGrants).values({ assignmentModuleId: m.id, extraAttempts: 1, reason, grantedBy: actor.userId });
      }
      await tx.insert(decisionRecords).values({ assignmentId: a.id, decision: "extra_training", reason, reopenModuleIds: [...new Set(input.reopenModuleIds)], decidedBy: actor.userId });
    }
    await tx.update(assignments).set({ status: "active" }).where(eq(assignments.id, a.id));
    await refreshAssignment(tx, a.id);
  });
}

/** Kişinin son karar kaydı (kursiyere "karar bekleniyor" / "süreç sonlandı" bilgisi için). */
export async function lastDecisionFor(assignmentId: string) {
  const [d] = await db().select().from(decisionRecords).where(eq(decisionRecords.assignmentId, assignmentId)).orderBy(desc(decisionRecords.decidedAt)).limit(1);
  return d ?? null;
}

