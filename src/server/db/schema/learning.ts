import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { contents, contentVersions, mediaAssets } from "./content";
import { positions } from "./org";
import { moduleKind, modules, positionCardVersions, trainingPlans, type PlanModuleSettings } from "./training";
import { createdAt, id, tstz, updatedAt } from "./_shared";

/**
 * Atama ve teorik eğitim (SPEC 4.3, 4.4, iş paketi 1.4).
 * Atama anında plan sabitlenir: modüller (ayar kopyasıyla), içerik sürümleri, kart sürümü ve görev listesi.
 * Böylece plan, modül veya içerik sonradan değişse de süren atama etkilenmez.
 */

export const assignmentReason = pgEnum("assignment_reason", ["new_hire", "position_change", "recertification", "extra_training"]);
export const assignmentStatus = pgEnum("assignment_status", ["active", "awaiting_readiness", "awaiting_decision", "completed", "cancelled"]);

export const assignments = pgTable(
  "assignments",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    positionId: uuid()
      .notNull()
      .references(() => positions.id, { onDelete: "restrict" }),
    cardVersionId: uuid()
      .notNull()
      .references(() => positionCardVersions.id, { onDelete: "restrict" }),
    planId: uuid()
      .notNull()
      .references(() => trainingPlans.id, { onDelete: "restrict" }),
    reason: assignmentReason().notNull(),
    /** Pratik eğitmen (planda pratik modül varsa İK seçer; seçilene kadar pratik modüller kilitli). */
    trainerUserId: uuid().references(() => users.id, { onDelete: "restrict" }),
    startDate: date({ mode: "string" }).notNull(),
    targetDate: date({ mode: "string" }),
    status: assignmentStatus().notNull().default("active"),
    cancelReason: text(),
    cancelledAt: tstz("cancelled_at"),
    cancelledBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    createdBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("assignments_user_idx").on(t.userId),
    index("assignments_trainer_idx").on(t.trainerUserId),
    // Kişinin aynı anda tek açık ataması olur
    uniqueIndex("assignments_one_open_per_user").on(t.userId).where(sql`${t.status} in ('active', 'awaiting_readiness', 'awaiting_decision')`),
    check("assignments_cancel_check", sql`(${t.status} = 'cancelled') = (${t.cancelledAt} is not null)`),
  ],
);

export const assignmentModuleStatus = pgEnum("assignment_module_status", [
  "locked",
  "available",
  "in_progress",
  "completed",
  "review_required",
  "waived",
]);
export const completedVia = pgEnum("completed_via", ["online", "classroom", "carried_over"]);

/** Atamadaki modül (modül ayarları atama anında kopyalanır). */
export const assignmentModules = pgTable(
  "assignment_modules",
  {
    id: id(),
    assignmentId: uuid()
      .notNull()
      .references(() => assignments.id, { onDelete: "restrict" }),
    moduleId: uuid()
      .notNull()
      .references(() => modules.id, { onDelete: "restrict" }),
    sortOrder: integer().notNull(),
    /** Ortak modül mü (plan başına otomatik eklenen) */
    isCommon: boolean().notNull().default(false),
    kind: moduleKind().notNull(),
    title: text().notNull(),
    durationMin: integer().notNull(),
    isOhs: boolean().notNull(),
    remoteAllowed: boolean().notNull(),
    validityMonths: integer(),
    isRequired: boolean().notNull(),
    prerequisiteModuleIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    settings: jsonb().$type<PlanModuleSettings>().notNull().default({}),
    /** Pratik modülde atama anındaki görevler (1.6). */
    pinnedTaskIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    status: assignmentModuleStatus().notNull().default("locked"),
    /** Tekrar turu: sınavda kalınca "tekrar gerekli" olan modül yeni turda adımları yeniden açar (karar #63). */
    round: integer().notNull().default(0),
    unlockedAt: tstz("unlocked_at"),
    startedAt: tstz("started_at"),
    completedAt: tstz("completed_at"),
    completedVia: completedVia(),
    /** Devreden modülde kaynağı (FG-3.3) */
    carriedFromId: uuid(),
    /** Geçerlilik bitişi (completed_at + geçerlilik ayı) */
    expiresAt: tstz("expires_at"),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("assignment_modules_assignment_module_unique").on(t.assignmentId, t.moduleId),
    index("assignment_modules_module_idx").on(t.moduleId),
    check("assignment_modules_completed_check", sql`(${t.status} = 'completed') = (${t.completedAt} is not null)`),
  ],
);

export const assignmentItemKind = pgEnum("assignment_item_kind", ["content", "card_section"]);

/**
 * Teorik modülün sabitlenmiş adımları ve ilerlemesi (SPEC'teki content_progress).
 * İçerik adımı: atama anında yayındaki içerik sürümü. Kart adımı: kartın bir bölümü.
 * "Okudum, anladım" (acknowledged_at) kilittir: sonrasında değişmez.
 */
export const assignmentItems = pgTable(
  "assignment_items",
  {
    id: id(),
    assignmentModuleId: uuid()
      .notNull()
      .references(() => assignmentModules.id, { onDelete: "restrict" }),
    sortOrder: integer().notNull(),
    /** Modülün hangi turuna ait (assignment_modules.round) */
    round: integer().notNull().default(0),
    kind: assignmentItemKind().notNull(),
    contentId: uuid().references(() => contents.id, { onDelete: "restrict" }),
    contentVersionId: uuid().references(() => contentVersions.id, { onDelete: "restrict" }),
    cardVersionId: uuid().references(() => positionCardVersions.id, { onDelete: "restrict" }),
    sectionKey: text(),
    startedAt: tstz("started_at"),
    /** İzlenen video aralıkları (saniye) [[başlangıç, bitiş], …] */
    watchedRanges: jsonb().$type<[number, number][]>().notNull().default([]),
    /** Video: izlenen benzersiz oran; PDF: ulaşılan sayfa oranı */
    progressRatio: real().notNull().default(0),
    reachedEndAt: tstz("reached_end_at"),
    acknowledgedAt: tstz("acknowledged_at"),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("assignment_items_module_idx").on(t.assignmentModuleId),
    index("assignment_items_content_version_idx").on(t.contentVersionId),
    check(
      "assignment_items_kind_check",
      sql`(${t.kind} = 'content' and ${t.contentVersionId} is not null) or (${t.kind} = 'card_section' and ${t.cardVersionId} is not null and ${t.sectionKey} is not null)`,
    ),
  ],
);

// ---- Ara değerlendirme (FG-4.3) ----

export const quizQuestionType = pgEnum("quiz_question_type", ["single_choice", "true_false"]);

/** Teorik modülün ara değerlendirme soruları (sınav bankasından ayrı; not etkisi yok). */
export const quizQuestions = pgTable(
  "quiz_questions",
  {
    id: id(),
    moduleId: uuid()
      .notNull()
      .references(() => modules.id, { onDelete: "restrict" }),
    sortOrder: integer().notNull(),
    type: quizQuestionType().notNull(),
    stem: text().notNull(),
    options: jsonb().$type<string[]>().notNull(),
    correctIndex: integer().notNull(),
    explanation: text(),
    archivedAt: tstz("archived_at"),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("quiz_questions_module_idx").on(t.moduleId)],
);

export type QuizSnapshot = { stem: string; options: string[]; correctIndex: number; explanation: string | null };

/** Ara değerlendirme cevabı: soru ve şıkların o anki metniyle birlikte saklanır (değiştirilemez). */
export const quizResponses = pgTable(
  "quiz_responses",
  {
    id: id(),
    assignmentModuleId: uuid()
      .notNull()
      .references(() => assignmentModules.id, { onDelete: "restrict" }),
    quizQuestionId: uuid()
      .notNull()
      .references(() => quizQuestions.id, { onDelete: "restrict" }),
    snapshot: jsonb().$type<QuizSnapshot>().notNull(),
    answerIndex: integer().notNull(),
    isCorrect: boolean().notNull(),
    answeredAt: tstz("answered_at").notNull().defaultNow(),
  },
  (t) => [index("quiz_responses_module_idx").on(t.assignmentModuleId)],
);

// ---- Okuma görevleri (FG-2.2 / SPEC 3.4) ----

export const rereadTasks = pgTable(
  "reread_tasks",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    contentId: uuid()
      .notNull()
      .references(() => contents.id, { onDelete: "restrict" }),
    contentVersionId: uuid()
      .notNull()
      .references(() => contentVersions.id, { onDelete: "restrict" }),
    dueDate: date({ mode: "string" }).notNull(),
    createdAt: createdAt(),
    acknowledgedAt: tstz("acknowledged_at"),
  },
  (t) => [unique("reread_tasks_user_version_unique").on(t.userId, t.contentVersionId), index("reread_tasks_user_idx").on(t.userId)],
);

// ---- Sınıf eğitimi (FG-4.4) ----

export const classroomStatus = pgEnum("classroom_status", ["draft", "submitted", "approved", "rejected"]);

export const classroomSessions = pgTable(
  "classroom_sessions",
  {
    id: id(),
    moduleId: uuid()
      .notNull()
      .references(() => modules.id, { onDelete: "restrict" }),
    /** Eğitimi veren */
    trainerUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    sessionDate: date({ mode: "string" }).notNull(),
    durationMin: integer().notNull(),
    location: text().notNull(),
    /** Islak imzalı katılım formunun taranmış hâli */
    scannedFormAssetId: uuid().references(() => mediaAssets.id, { onDelete: "restrict" }),
    notes: text(),
    status: classroomStatus().notNull().default("draft"),
    recordedBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    submittedAt: tstz("submitted_at"),
    /** Kilit: onaylanınca değiştirilemez. */
    approvedAt: tstz("approved_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("classroom_sessions_module_idx").on(t.moduleId),
    check("classroom_sessions_duration_check", sql`${t.durationMin} > 0 and ${t.durationMin} <= 1440`),
  ],
);

export const classroomAttendees = pgTable(
  "classroom_attendees",
  {
    sessionId: uuid()
      .notNull()
      .references(() => classroomSessions.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.userId] }), index("classroom_attendees_user_idx").on(t.userId)],
);

// ---- Ortak cihazlar (FG-4.1) ----

export const deviceKind = pgEnum("device_kind", ["shared_pc", "kiosk"]);

export const devices = pgTable("devices", {
  id: id(),
  kind: deviceKind().notNull().default("shared_pc"),
  name: text().notNull(),
  /** Cihaz çerezindeki belirtecin SHA-256 özeti */
  tokenHash: text().notNull().unique(),
  registeredBy: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  lastSeenAt: tstz("last_seen_at"),
  revokedAt: tstz("revoked_at"),
  revokedBy: uuid().references(() => users.id, { onDelete: "restrict" }),
});
