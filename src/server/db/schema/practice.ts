import { index, integer, jsonb, pgEnum, pgTable, text, unique, uuid, boolean } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { mediaAssets } from "./content";
import { assignmentModules } from "./learning";
import { practiceTasks } from "./training";
import { createdAt, id, tstz, updatedAt } from "./_shared";

/**
 * Pratik eğitim ve pratik sınav (FG-5, FG-6.2, iş paketi 1.6).
 * İşaretlemeler yalnızca eklenir (değiştirilemez); görevin güncel seviyesi son kayıttır.
 * Pratik sınav formu: taslak → eğitmen imzası (kriterler kilitlenir) → bölüm sorumlusu imzası ya da geri gönderme.
 */

// ---- İşaretleme (FG-5.2) ----

export const practiceLevel = pgEnum("practice_level", ["demonstrated", "supervised", "independent"]);
export const markDirection = pgEnum("mark_direction", ["up", "down"]);
/** exam_fail: pratik sınavda kalma (karar #72); readiness: işe başlama reddi/ek eğitim kararı (karar #75). */
export const markSource = pgEnum("mark_source", ["trainer", "exam_fail", "readiness"]);

export const practiceMarks = pgTable(
  "practice_marks",
  {
    id: id(),
    assignmentModuleId: uuid()
      .notNull()
      .references(() => assignmentModules.id, { onDelete: "restrict" }),
    practiceTaskId: uuid()
      .notNull()
      .references(() => practiceTasks.id, { onDelete: "restrict" }),
    level: practiceLevel().notNull(),
    direction: markDirection().notNull(),
    /** Seviye düşürmede gerekçe zorunlu (FG-5.2). */
    note: text(),
    photoAssetIds: uuid().array().notNull().default([]),
    source: markSource().notNull().default("trainer"),
    /** Pratik sınavda kalınca otomatik düşürme (karar #72): ilgili form. */
    examResultId: uuid().references(() => practicalExamResults.id, { onDelete: "restrict" }),
    markedBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    markedAt: tstz("marked_at").notNull().defaultNow(),
  },
  (t) => [index("practice_marks_module_task_idx").on(t.assignmentModuleId, t.practiceTaskId, t.markedAt)],
);

// ---- İmza (SPEC Bölüm 7) ----

export const signatureRole = pgEnum("signature_role", ["trainee", "trainer", "manager"]);

export const signatures = pgTable(
  "signatures",
  {
    id: id(),
    signerUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** İmzanın alındığı oturumun sahibi (kursiyer eğitmenin cihazında imzalar; karar #71). */
    capturedBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    subjectType: text().notNull(),
    subjectId: uuid().notNull(),
    role: signatureRole().notNull(),
    /** İmzalanan kaydın SHA-256 özeti (kanonik JSON). */
    subjectHash: text().notNull(),
    imageAssetId: uuid()
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
    signedAt: tstz("signed_at").notNull().defaultNow(),
    ip: text(),
    userAgent: text(),
  },
  (t) => [index("signatures_subject_idx").on(t.subjectType, t.subjectId)],
);

// ---- Pratik sınav formu (FG-6.2) ----

export const practicalExamStatus = pgEnum("practical_exam_status", ["draft", "awaiting_second_signature", "final", "returned"]);
export const practicalFailReason = pgEnum("practical_fail_reason", ["score", "critical"]);

export type PracticalCriterion = {
  taskId: string;
  title: string;
  isCritical: boolean;
  result: "pass" | "fail" | null;
  note: string | null;
};

export const practicalExamResults = pgTable(
  "practical_exam_results",
  {
    id: id(),
    assignmentModuleId: uuid()
      .notNull()
      .references(() => assignmentModules.id, { onDelete: "restrict" }),
    attemptNo: integer().notNull(),
    status: practicalExamStatus().notNull().default("draft"),
    /** Kriterler: sınavdan önceki pratik modüllerin sabit görevleri (karar #69), başlıkları kopyalanır. */
    criteria: jsonb().$type<PracticalCriterion[]>().notNull(),
    passScore: integer().notNull(),
    score: integer(),
    passed: boolean(),
    failReason: practicalFailReason(),
    photoAssetIds: uuid().array().notNull().default([]),
    note: text(),
    evaluatorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    traineeSignatureId: uuid().references(() => signatures.id, { onDelete: "restrict" }),
    trainerSignatureId: uuid().references(() => signatures.id, { onDelete: "restrict" }),
    /** 1. imza zamanı: bundan sonra kriterler değişmez. */
    submittedAt: tstz("submitted_at"),
    managerUserId: uuid().references(() => users.id, { onDelete: "restrict" }),
    managerSignatureId: uuid().references(() => signatures.id, { onDelete: "restrict" }),
    returnReason: text(),
    /** Kilit: 2. imza ya da geri gönderme. */
    finalizedAt: tstz("finalized_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("practical_exam_results_attempt_unique").on(t.assignmentModuleId, t.attemptNo), index("practical_exam_results_status_idx").on(t.status)],
);
