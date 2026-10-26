import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, notInArray } from "drizzle-orm";
import type { Tx } from "@/server/db/client";
import {
  assignmentItems,
  assignmentModules,
  assignments,
  contents,
  contentVersions,
  moduleContents,
  modules,
  personnel,
  planModules,
  positionCardVersions,
  positions,
  practiceTasks,
  quizQuestions,
  quizResponses,
  rereadTasks,
  trainingPlans,
} from "@/server/db/schema";
import { addDays, defaultTargetDate, maxDate, todayIn } from "@/lib/dates";
import { getSettings } from "@/server/services/settings";
import { CARD_SECTION_KEYS, parseCardSections } from "@/server/services/positions/card-schema";
import { allRequiredDone, isDone, unlockable, type ModuleKind } from "@/server/state/assignment";
import { commonModulesFor } from "../modules";

/**
 * Atama motoru: servislerin transaction'ı içinde çalışan iç işlemler (yetki kontrolü çağıranda).
 * Kural kaynakları: SPEC 3.1–3.4, FG-3.2–3.4, kararlar #49–#52.
 */

export const OPEN_STATUSES = ["active", "awaiting_readiness", "awaiting_decision"] as const;

async function timezone() {
  return (await getSettings(["org.timezone"]))["org.timezone"];
}

export async function today(): Promise<string> {
  return todayIn(await timezone());
}

/** Pozisyonun yayındaki kart sürümü ve planı. */
async function publishedPlan(tx: Tx, positionId: string) {
  const [row] = await tx
    .select({ cardVersionId: positionCardVersions.id, planId: trainingPlans.id, sections: positionCardVersions.sections })
    .from(positionCardVersions)
    .innerJoin(trainingPlans, eq(trainingPlans.cardVersionId, positionCardVersions.id))
    .where(and(eq(positionCardVersions.positionId, positionId), eq(positionCardVersions.status, "published")))
    .orderBy(desc(positionCardVersions.version))
    .limit(1);
  return row ?? null;
}

/** Kartın kursiyere okunacak bölümleri: künye + dolu bölümler (karar #47). */
function cardSectionKeys(sections: unknown): string[] {
  const parsed = parseCardSections(sections);
  const s = parsed.success ? parsed.data : null;
  const keys: string[] = ["identity"];
  if (!s) return keys;
  for (const k of CARD_SECTION_KEYS) {
    const v = s[k];
    const filled =
      typeof v === "string" ? v.trim().length > 0 : Array.isArray(v) ? v.length > 0 : k === "workflow" ? s.workflow.steps.length > 0 : k === "ohs" ? true : false;
    if (filled) keys.push(k);
  }
  return keys;
}

export type CreateAssignmentInput = {
  userId: string;
  reason: "new_hire" | "position_change" | "recertification" | "extra_training";
  createdBy: string | null;
  trainerUserId?: string | null;
  targetDate?: string | null;
};

/**
 * Atama oluşturur: ortak modüller (yaka tipine göre, sırayla) + planın modülleri; modül ayarları, içerik
 * sürümleri, kart sürümü ve görevler sabitlenir. Daha önce tamamlanmış ve geçerli aynı modüller devreder (FG-3.3).
 * Pozisyonun yayında kartı yoksa null döner (kişi "eğitimi bekleyenler" listesinde kalır).
 */
export async function createAssignment(tx: Tx, input: CreateAssignmentInput): Promise<string | null> {
  const [person] = await tx
    .select({ positionId: personnel.positionId, hireDate: personnel.hireDate, status: personnel.status, collarType: positions.collarType })
    .from(personnel)
    .leftJoin(positions, eq(positions.id, personnel.positionId))
    .where(eq(personnel.userId, input.userId))
    .limit(1);
  if (!person?.positionId || !person.collarType || person.status !== "active") return null;
  const plan = await publishedPlan(tx, person.positionId);
  if (!plan) return null;

  const common = await commonModulesFor(person.collarType, tx);
  const commonFull = common.length ? await tx.select().from(modules).where(inArray(modules.id, common.map((c) => c.id))) : [];
  const planRows = await tx
    .select({ pm: planModules, m: modules })
    .from(planModules)
    .innerJoin(modules, eq(modules.id, planModules.moduleId))
    .where(eq(planModules.planId, plan.planId))
    .orderBy(asc(planModules.sortOrder));

  // Ortak modüller sırayla; zorunlu ortaklar bitmeden ilk plan modülü açılmaz (karar #51)
  const requiredCommon: string[] = [];
  let prevCommon: string | null = null;
  type Row = { moduleId: string; isCommon: boolean; isRequired: boolean; prereqs: string[]; settings: object; m: typeof modules.$inferSelect };
  const rows: Row[] = [];
  for (const c of common) {
    const m = commonFull.find((x) => x.id === c.id)!;
    rows.push({ moduleId: m.id, isCommon: true, isRequired: true, prereqs: prevCommon ? [prevCommon] : [], settings: {}, m });
    prevCommon = m.id;
    requiredCommon.push(m.id);
  }
  for (const [i, { pm, m }] of planRows.entries()) {
    if (rows.some((r) => r.moduleId === m.id)) continue;
    const prereqs = i === 0 ? [...new Set([...pm.prerequisiteModuleIds, ...requiredCommon])] : pm.prerequisiteModuleIds;
    rows.push({ moduleId: m.id, isCommon: false, isRequired: pm.isRequired, prereqs, settings: pm.settings, m });
  }

  const settings = await getSettings(["org.timezone", "assignment.daily_training_minutes"]);
  const start = maxDate(todayIn(settings["org.timezone"]), person.hireDate);
  const totalMinutes = rows.reduce((a, r) => a + r.m.durationMin, 0);
  const targetDate = input.targetDate ?? defaultTargetDate(start, totalMinutes, settings["assignment.daily_training_minutes"]);

  const [assignment] = await tx
    .insert(assignments)
    .values({
      userId: input.userId,
      positionId: person.positionId,
      cardVersionId: plan.cardVersionId,
      planId: plan.planId,
      reason: input.reason,
      trainerUserId: input.trainerUserId ?? null,
      startDate: start,
      targetDate,
      createdBy: input.createdBy,
    })
    .returning({ id: assignments.id });
  const assignmentId = assignment!.id;

  // Devreden modüller: kişinin daha önce tamamladığı, geçerliliği süren aynı modüller (FG-3.3)
  const now = new Date();
  const previous = await tx
    .select({ id: assignmentModules.id, moduleId: assignmentModules.moduleId, completedAt: assignmentModules.completedAt, expiresAt: assignmentModules.expiresAt })
    .from(assignmentModules)
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .where(and(eq(assignments.userId, input.userId), ne(assignments.id, assignmentId), eq(assignmentModules.status, "completed")))
    .orderBy(desc(assignmentModules.completedAt));
  const carry = new Map<string, (typeof previous)[number]>();
  for (const p of previous) if (!carry.has(p.moduleId) && (!p.expiresAt || p.expiresAt > now)) carry.set(p.moduleId, p);

  for (const [i, r] of rows.entries()) {
    const from = carry.get(r.moduleId);
    const tasks =
      r.m.kind === "practice"
        ? await tx.select({ id: practiceTasks.id }).from(practiceTasks).where(and(eq(practiceTasks.moduleId, r.m.id), isNull(practiceTasks.archivedAt))).orderBy(asc(practiceTasks.sortOrder))
        : [];
    const [am] = await tx
      .insert(assignmentModules)
      .values({
        assignmentId,
        moduleId: r.moduleId,
        sortOrder: i,
        isCommon: r.isCommon,
        kind: r.m.kind,
        title: r.m.title,
        durationMin: r.m.durationMin,
        isOhs: r.m.isOhs,
        remoteAllowed: r.m.remoteAllowed,
        validityMonths: r.m.validityMonths,
        isRequired: r.isRequired,
        prerequisiteModuleIds: r.prereqs,
        settings: r.settings,
        pinnedTaskIds: tasks.map((t) => t.id),
        ...(from
          ? { status: "completed" as const, completedAt: from.completedAt, completedVia: "carried_over" as const, carriedFromId: from.id, expiresAt: from.expiresAt }
          : {}),
      })
      .returning({ id: assignmentModules.id });
    if (r.m.kind === "theory" && !from) await pinItems(tx, am!.id, r.m, plan);
  }
  await refreshAssignment(tx, assignmentId);
  return assignmentId;
}

/** Teorik modülün adımlarını sabitler: kart modülünde kart bölümleri, diğerlerinde yayındaki içerik sürümleri. */
async function pinItems(tx: Tx, assignmentModuleId: string, m: typeof modules.$inferSelect, plan: { cardVersionId: string; sections: unknown }) {
  if (m.cardPositionId) {
    const keys = cardSectionKeys(plan.sections);
    await tx.insert(assignmentItems).values(keys.map((sectionKey, i) => ({ assignmentModuleId, sortOrder: i, kind: "card_section" as const, cardVersionId: plan.cardVersionId, sectionKey })));
    return;
  }
  const rows = await tx
    .select({ contentId: contents.id, versionId: contents.currentPublishedVersionId })
    .from(moduleContents)
    .innerJoin(contents, eq(contents.id, moduleContents.contentId))
    .where(and(eq(moduleContents.moduleId, m.id), isNull(contents.archivedAt), isNotNull(contents.currentPublishedVersionId)))
    .orderBy(asc(moduleContents.sortOrder));
  if (rows.length) {
    await tx
      .insert(assignmentItems)
      .values(rows.map((r, i) => ({ assignmentModuleId, sortOrder: i, kind: "content" as const, contentId: r.contentId, contentVersionId: r.versionId! })));
  }
}

/** Kilit açma ve atama durumu (her ilerleme olayından sonra çağrılır). */
export async function refreshAssignment(tx: Tx, assignmentId: string): Promise<void> {
  const [a] = await tx.select().from(assignments).where(eq(assignments.id, assignmentId)).limit(1);
  if (!a || a.status === "cancelled" || a.status === "completed") return;
  const mods = await tx.select().from(assignmentModules).where(eq(assignmentModules.assignmentId, assignmentId));
  const toUnlock = unlockable(mods, !!a.trainerUserId);
  if (toUnlock.length) {
    await tx.update(assignmentModules).set({ status: "available", unlockedAt: new Date() }).where(inArray(assignmentModules.id, toUnlock));
  }
  // Tüm zorunlu modüller bitince işe başlama onayı beklenir (1.7)
  if (a.status === "active" && allRequiredDone(mods)) {
    await tx.update(assignments).set({ status: "awaiting_readiness" }).where(eq(assignments.id, assignmentId));
  }
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export async function completeModule(tx: Tx, assignmentModuleId: string, via: "online" | "classroom"): Promise<void> {
  const [am] = await tx.select().from(assignmentModules).where(eq(assignmentModules.id, assignmentModuleId)).limit(1);
  if (!am || isDone(am.status)) return;
  const now = new Date();
  await tx
    .update(assignmentModules)
    .set({
      status: "completed",
      completedAt: now,
      completedVia: via,
      startedAt: am.startedAt ?? now,
      expiresAt: am.validityMonths ? addMonths(now, am.validityMonths) : null,
    })
    .where(eq(assignmentModules.id, am.id));
  await refreshAssignment(tx, am.assignmentId);
}

/**
 * Teorik modülü çevrim içi tamamlamayı dener: tüm adımlar "okudum, anladım" ve ara değerlendirme cevaplanmış.
 * "Uzaktan verilemez" modül çevrim içi tamamlanmaz; yalnızca sınıf eğitimi kaydıyla (FG-4.4).
 */
export async function tryCompleteTheory(tx: Tx, assignmentModuleId: string): Promise<boolean> {
  const [am] = await tx.select().from(assignmentModules).where(eq(assignmentModules.id, assignmentModuleId)).limit(1);
  if (!am || am.kind !== "theory" || isDone(am.status) || !am.remoteAllowed) return false;
  const items = await tx.select({ ack: assignmentItems.acknowledgedAt }).from(assignmentItems).where(eq(assignmentItems.assignmentModuleId, am.id));
  if (items.some((i) => !i.ack)) return false;
  if (!(await quizComplete(tx, am.id, am.moduleId))) return false;
  await completeModule(tx, am.id, "online");
  return true;
}

/** Modülün etkin ara değerlendirme soruları cevaplandı mı. */
export async function quizComplete(tx: Tx, assignmentModuleId: string, moduleId: string): Promise<boolean> {
  const questions = await tx.select({ id: quizQuestions.id }).from(quizQuestions).where(and(eq(quizQuestions.moduleId, moduleId), isNull(quizQuestions.archivedAt)));
  if (questions.length === 0) return true;
  const answered = await tx
    .selectDistinct({ id: quizResponses.quizQuestionId })
    .from(quizResponses)
    .where(and(eq(quizResponses.assignmentModuleId, assignmentModuleId), inArray(quizResponses.quizQuestionId, questions.map((q) => q.id))));
  return answered.length === questions.length;
}

/**
 * Personel kaydı/güncellemesinden sonra atamayı eşitler (karar #49):
 *  - Açık atamanın pozisyonu değiştiyse eski atama iptal (position_change), yeni pozisyonun planı atanır.
 *  - Açık ataması olmayan, eğitimi gereken (training_required) ve hiç ataması olmamış kişiye plan atanır.
 */
export async function syncAssignmentForPerson(tx: Tx, userId: string, actorUserId: string | null): Promise<void> {
  const [person] = await tx
    .select({ positionId: personnel.positionId, trainingRequired: personnel.trainingRequired, status: personnel.status })
    .from(personnel)
    .where(eq(personnel.userId, userId))
    .limit(1);
  if (!person || person.status !== "active") return;
  const [open] = await tx
    .select()
    .from(assignments)
    .where(and(eq(assignments.userId, userId), inArray(assignments.status, [...OPEN_STATUSES])))
    .limit(1);

  if (open) {
    if (!person.positionId || open.positionId === person.positionId) return;
    if (!(await publishedPlan(tx, person.positionId))) return;
    await tx
      .update(assignments)
      .set({ status: "cancelled", cancelReason: "position_change", cancelledAt: new Date(), cancelledBy: actorUserId })
      .where(eq(assignments.id, open.id));
    await createAssignment(tx, { userId, reason: "position_change", createdBy: actorUserId, trainerUserId: null });
    return;
  }
  if (!person.trainingRequired || !person.positionId) return;
  const [any] = await tx.select({ id: assignments.id }).from(assignments).where(eq(assignments.userId, userId)).limit(1);
  if (any) return;
  await createAssignment(tx, { userId, reason: "new_hire", createdBy: actorUserId });
}

/** Kart yayınlanınca bu pozisyonda eğitim bekleyenlere plan atanır. */
export async function assignWaitingForPosition(tx: Tx, positionId: string, actorUserId: string | null): Promise<number> {
  const waiting = await tx
    .select({ userId: personnel.userId })
    .from(personnel)
    .where(
      and(
        eq(personnel.positionId, positionId),
        eq(personnel.trainingRequired, true),
        eq(personnel.status, "active"),
        notInArray(personnel.userId, tx.select({ id: assignments.userId }).from(assignments)),
      ),
    );
  for (const w of waiting) await createAssignment(tx, { userId: w.userId, reason: "new_hire", createdBy: actorUserId });
  return waiting.length;
}

/**
 * "Tekrar oku" işaretli sürüm yayınlanınca (FG-2.2): önceki sürümü onaylamış herkese okuma görevi.
 */
export async function createRereadTasks(tx: Tx, contentId: string, versionId: string): Promise<number> {
  const dueDays = (await getSettings(["reread.due_days"]))["reread.due_days"];
  const due = addDays(await today(), dueDays);
  const prior = tx
    .select({ id: contentVersions.id })
    .from(contentVersions)
    .where(and(eq(contentVersions.contentId, contentId), ne(contentVersions.id, versionId)));
  const fromItems = await tx
    .selectDistinct({ userId: assignments.userId })
    .from(assignmentItems)
    .innerJoin(assignmentModules, eq(assignmentModules.id, assignmentItems.assignmentModuleId))
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .where(and(inArray(assignmentItems.contentVersionId, prior), isNotNull(assignmentItems.acknowledgedAt)));
  const fromTasks = await tx
    .selectDistinct({ userId: rereadTasks.userId })
    .from(rereadTasks)
    .where(and(eq(rereadTasks.contentId, contentId), isNotNull(rereadTasks.acknowledgedAt)));
  const users = [...new Set([...fromItems, ...fromTasks].map((r) => r.userId))];
  if (users.length === 0) return 0;
  const active = await tx.select({ userId: personnel.userId }).from(personnel).where(and(inArray(personnel.userId, users), eq(personnel.status, "active")));
  if (active.length === 0) return 0;
  await tx
    .insert(rereadTasks)
    .values(active.map((u) => ({ userId: u.userId, contentId, contentVersionId: versionId, dueDate: due })))
    .onConflictDoNothing();
  return active.length;
}

export type { ModuleKind };
