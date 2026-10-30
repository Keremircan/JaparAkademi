import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { mediaAssets } from "./content";
import { assignmentModules } from "./learning";
import { orgUnits } from "./org";
import { modules } from "./training";
import { createdAt, id, tstz, updatedAt } from "./_shared";
import type { HotspotPoint, HotspotRegion, MatchingPair, QuestionTranslations } from "@/lib/questions";

/**
 * Soru bankası ve teorik sınav (SPEC Bölüm 6, FG-6.1, iş paketi 1.5).
 * Soru sürümlüdür: sınavda kullanılmış sürüm değiştirilemez, düzenleme yeni sürüm açar (karar #61).
 * Teslim edilen deneme ve cevapları değiştirilemez.
 */

// ---- Soru bankası ----

export const questions = pgTable(
  "questions",
  {
    id: id(),
    /** Sahip birim; boşsa ortak İSG sorusu (karar #58: ortak soru yalnızca İSG sorusu olabilir). */
    ownerOrgUnitId: uuid().references(() => orgUnits.id, { onDelete: "restrict" }),
    isOhs: boolean().notNull().default(false),
    /** Sınavlarda kullanılan (aktif) sürüm; yeni sürüm onay beklerken önceki sürüm kullanılmaya devam eder. */
    currentVersionId: uuid().references((): AnyPgColumn => questionVersions.id, { onDelete: "restrict" }),
    archivedAt: tstz("archived_at"),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("questions_owner_idx").on(t.ownerOrgUnitId),
    check("questions_common_ohs_check", sql`${t.ownerOrgUnitId} is not null or ${t.isOhs}`),
  ],
);

export const questionType = pgEnum("question_type", ["single_choice", "true_false", "matching", "hotspot"]);

/** Deneme cevabı (yeni tipler; karar #205): eşleştirmede sol → sağ özgün indeks, işaretlemede dokunulan nokta. */
export type ExamAnswer = { pairs: (number | null)[] } | { point: HotspotPoint };
export const questionVersionStatus = pgEnum("question_version_status", ["ohs_review", "active", "rejected", "retired"]);

export const questionVersions = pgTable(
  "question_versions",
  {
    id: id(),
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    version: integer().notNull(),
    type: questionType().notNull(),
    stem: text().notNull(),
    mediaAssetId: uuid().references(() => mediaAssets.id, { onDelete: "restrict" }),
    /** Çoktan seçmeli ve doğru/yanlış şıkları; yeni tiplerde boş dizi. */
    options: jsonb().$type<string[]>().notNull(),
    /** Yalnızca çoktan seçmeli ve doğru/yanlışta (tipe göre kontrol). */
    correctIndex: integer(),
    pairs: jsonb().$type<MatchingPair[]>(),
    regions: jsonb().$type<HotspotRegion[]>(),
    /** İsteğe bağlı çeviriler (karar #207): aynı soru, aynı doğru cevap; yalnızca metinler. */
    translations: jsonb().$type<QuestionTranslations>(),
    explanation: text(),
    topic: text().notNull(),
    difficulty: integer().notNull(),
    isOhsCritical: boolean().notNull().default(false),
    status: questionVersionStatus().notNull(),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("question_versions_question_version_unique").on(t.questionId, t.version),
    index("question_versions_status_idx").on(t.status),
    check("question_versions_difficulty_check", sql`${t.difficulty} between 1 and 3`),
    check(
      "question_versions_type_fields_check",
      // ::text: yeni enum değerleri aynı migration'da kullanılabilsin
      sql`(${t.type}::text in ('single_choice','true_false') and ${t.correctIndex} is not null)
        or (${t.type}::text = 'matching' and ${t.pairs} is not null)
        or (${t.type}::text = 'hotspot' and ${t.regions} is not null and ${t.mediaAssetId} is not null)`,
    ),
  ],
);

/** Soru ↔ teorik modül (havuz: sınavdan önceki teorik modüllerin soruları — karar #59). */
export const questionModules = pgTable(
  "question_modules",
  {
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    moduleId: uuid()
      .notNull()
      .references(() => modules.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.questionId, t.moduleId] }), index("question_modules_module_idx").on(t.moduleId)],
);

// ---- Gözetmen kodu ----

export const proctorSessions = pgTable(
  "proctor_sessions",
  {
    id: id(),
    proctorUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Kodun özeti (HMAC); kodun kendisi saklanmaz. */
    codeHash: text().notNull(),
    location: text(),
    createdAt: createdAt(),
    expiresAt: tstz("expires_at").notNull(),
    revokedAt: tstz("revoked_at"),
  },
  (t) => [index("proctor_sessions_code_idx").on(t.codeHash)],
);

/** Hatalı gözetmen kodu denemeleri (kursiyer başına sınır — karar #62). */
export const proctorCodeFailures = pgTable(
  "proctor_code_failures",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    at: tstz("at").notNull().defaultNow(),
  },
  (t) => [index("proctor_code_failures_user_idx").on(t.userId, t.at)],
);

// ---- Sınav denemesi ----

export const submitReason = pgEnum("exam_submit_reason", ["user", "timeout"]);
export const examFailReason = pgEnum("exam_fail_reason", ["score", "ohs_critical"]);

export const examAttempts = pgTable(
  "exam_attempts",
  {
    id: id(),
    assignmentModuleId: uuid()
      .notNull()
      .references(() => assignmentModules.id, { onDelete: "restrict" }),
    attemptNo: integer().notNull(),
    proctorSessionId: uuid().references(() => proctorSessions.id, { onDelete: "restrict" }),
    proctorUserId: uuid().references(() => users.id, { onDelete: "restrict" }),
    /** Deneme anındaki kurallar (plan + genel parametre) */
    questionCount: integer().notNull(),
    durationMin: integer().notNull(),
    passScore: integer().notNull(),
    startedAt: tstz("started_at").notNull().defaultNow(),
    deadlineAt: tstz("deadline_at").notNull(),
    /** Kilit: teslimden sonra değiştirilemez. */
    submittedAt: tstz("submitted_at"),
    submitReason: submitReason(),
    score: integer(),
    passed: boolean(),
    failReason: examFailReason(),
    ip: text(),
    userAgent: text(),
    ttsUsed: boolean().notNull().default(false),
    tabLeaveCount: integer().notNull().default(0),
  },
  (t) => [
    unique("exam_attempts_module_no_unique").on(t.assignmentModuleId, t.attemptNo),
    check("exam_attempts_result_check", sql`(${t.submittedAt} is null) = (${t.passed} is null)`),
  ],
);

export const examAttemptItems = pgTable(
  "exam_attempt_items",
  {
    id: id(),
    attemptId: uuid()
      .notNull()
      .references(() => examAttempts.id, { onDelete: "restrict" }),
    sortOrder: integer().notNull(),
    questionVersionId: uuid()
      .notNull()
      .references(() => questionVersions.id, { onDelete: "restrict" }),
    /** Şıkların gösterim sırası (özgün sıradaki indeksler) */
    optionOrder: integer().array().notNull(),
    /** Seçilen şıkkın özgün indeksi (çoktan seçmeli, doğru/yanlış) */
    answerIndex: integer(),
    /** Eşleştirme / işaretleme cevabı (karar #205) */
    answer: jsonb().$type<ExamAnswer>(),
    isCorrect: boolean(),
    answeredAt: tstz("answered_at"),
  },
  (t) => [unique("exam_attempt_items_attempt_order_unique").on(t.attemptId, t.sortOrder), index("exam_attempt_items_version_idx").on(t.questionVersionId)],
);

export const examEventKind = pgEnum("exam_event_kind", ["tab_hidden", "tab_visible", "blur", "reconnect"]);

export const examAttemptEvents = pgTable(
  "exam_attempt_events",
  {
    id: id(),
    attemptId: uuid()
      .notNull()
      .references(() => examAttempts.id, { onDelete: "restrict" }),
    kind: examEventKind().notNull(),
    at: tstz("at").notNull().defaultNow(),
  },
  (t) => [index("exam_attempt_events_attempt_idx").on(t.attemptId)],
);

/** Ek hak (1.7'de karar ekranından verilir; hak sayacı bu kayıtlarla artar). Değiştirilemez. */
export const attemptGrants = pgTable("attempt_grants", {
  id: id(),
  assignmentModuleId: uuid()
    .notNull()
    .references(() => assignmentModules.id, { onDelete: "restrict" }),
  extraAttempts: integer().notNull(),
  reason: text().notNull(),
  grantedBy: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  grantedAt: tstz("granted_at").notNull().defaultNow(),
});
