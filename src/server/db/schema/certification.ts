import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { mediaAssets } from "./content";
import { assignmentModules, assignments } from "./learning";
import { orgUnits, positions } from "./org";
import { createdAt, id, tstz, updatedAt } from "./_shared";

/**
 * İşe başlama onayı, karar kayıtları, sertifikalar ve yetkinlik veri modeli (FG-7, SPEC 3.1, iş paketi 1.7).
 * Kararlar ve sertifikalar değiştirilemez; sertifikada yalnızca PDF bağlantısı ve iptal alanları bir kez yazılır.
 */

// ---- İşe başlama onayı (FG-7.1) ----

export const readinessDecision = pgEnum("readiness_decision", ["approved", "rejected"]);

export const readinessDecisions = pgTable(
  "readiness_decisions",
  {
    id: id(),
    assignmentId: uuid()
      .notNull()
      .references(() => assignments.id, { onDelete: "restrict" }),
    decision: readinessDecision().notNull(),
    comment: text(),
    /** Retle tekrar açılan atama modülleri (karar #75). */
    reopenModuleIds: uuid().array().notNull().default([]),
    decidedBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    decidedAt: tstz("decided_at").notNull().defaultNow(),
  },
  (t) => [index("readiness_decisions_assignment_idx").on(t.assignmentId)],
);

// ---- Tüm haklar bitince insan kararı (SPEC 3.1) ----

export const processDecision = pgEnum("process_decision", ["extra_attempt", "extra_training", "end_process"]);

export const decisionRecords = pgTable(
  "decision_records",
  {
    id: id(),
    assignmentId: uuid()
      .notNull()
      .references(() => assignments.id, { onDelete: "restrict" }),
    decision: processDecision().notNull(),
    reason: text().notNull(),
    /** Ek hak verilen sınav modülü (atama modülü). */
    examModuleId: uuid().references(() => assignmentModules.id, { onDelete: "restrict" }),
    extraAttempts: integer(),
    reopenModuleIds: uuid().array().notNull().default([]),
    decidedBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    decidedAt: tstz("decided_at").notNull().defaultNow(),
  },
  (t) => [index("decision_records_assignment_idx").on(t.assignmentId)],
);

// ---- Sertifika ve katılım belgesi (FG-7.2) ----

export const certificateKind = pgEnum("certificate_kind", ["position_competency", "attendance"]);
export const certificateStatus = pgEnum("certificate_status", ["valid", "revoked"]);

/** Belge içeriği düzenlendiği anda dondurulur: PDF ve doğrulama sayfası bu kopyadan üretilir. */
export type CertificateSnapshot = {
  fullName: string;
  sicilNo: string | null;
  positionName: string | null;
  unitName: string | null;
  /** Belgenin konusu (pozisyon adı ya da modül adı). */
  scope: string;
  modules: { title: string; kind: string; durationMin: number; completedAt: string | null; via: string | null; trainerName: string | null; isOhs: boolean }[];
  theoryScore: number | null;
  practicalScore: number | null;
  approverName: string | null;
  signatories: { name: string; title: string; signatureAssetId: string | null }[];
};

export const certificates = pgTable(
  "certificates",
  {
    id: id(),
    /** Belge numarası için sıra (JA-YYYY-000123). */
    serialNo: integer().generatedAlwaysAsIdentity(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: certificateKind().notNull(),
    assignmentId: uuid().references(() => assignments.id, { onDelete: "restrict" }),
    assignmentModuleId: uuid().references(() => assignmentModules.id, { onDelete: "restrict" }),
    positionId: uuid().references(() => positions.id, { onDelete: "restrict" }),
    title: text().notNull(),
    snapshot: jsonb().$type<CertificateSnapshot>().notNull(),
    issuedAt: tstz("issued_at").notNull().defaultNow(),
    /** Boşsa süresiz. "Süresi dolmuş" durumu saklanmaz, bu tarihten hesaplanır (karar #78). */
    expiresAt: tstz("expires_at"),
    /** Doğrulama bağlantısı (128 bit rastgele, base64url). */
    verifyToken: text().notNull().unique(),
    pdfAssetId: uuid().references(() => mediaAssets.id, { onDelete: "restrict" }),
    approvedBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    /** Boşsa sistem tarafından otomatik düzenlendi (İSG modülü katılım belgesi; karar #77). */
    issuedBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    status: certificateStatus().notNull().default("valid"),
    revokedReason: text(),
    revokedBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    /** Kilit: iptalden sonra hiçbir alan değişmez. */
    revokedAt: tstz("revoked_at"),
  },
  (t) => [index("certificates_user_idx").on(t.userId), index("certificates_assignment_idx").on(t.assignmentId)],
);

// ---- Yetkinlik (FG-7.4; veri modeli Faz 1, ekran Faz 3 — karar #82) ----

export const competencyKind = pgEnum("competency_kind", ["machine", "task"]);

/**
 * Yetkinlik tanımı (FG-7.4, karar #218): makine ya da iş. `orgUnitId` boşsa bütün birimlerde geçerli (yalnızca İSG
 * uzmanı tanımlar). `validityMonths` boşsa süresiz. Silinmez, arşivlenir.
 */
export const competencies = pgTable(
  "competencies",
  {
    id: id(),
    name: text().notNull(),
    kind: competencyKind().notNull(),
    description: text(),
    orgUnitId: uuid().references(() => orgUnits.id, { onDelete: "restrict" }),
    validityMonths: integer(),
    createdBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    archivedAt: tstz("archived_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("competencies_org_unit_idx").on(t.orgUnitId),
    check("competencies_validity_check", sql`${t.validityMonths} is null or ${t.validityMonths} between 1 and 240`),
  ],
);

/** training: işe başlama onayında pratik görevlerden; manual: bölüm sorumlusu gerekçeyle (karar #219). */
export const competencyGrantSource = pgEnum("competency_grant_source", ["training", "manual"]);

export const competencyGrants = pgTable(
  "competency_grants",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    competencyId: uuid()
      .notNull()
      .references(() => competencies.id, { onDelete: "restrict" }),
    certificateId: uuid().references(() => certificates.id, { onDelete: "restrict" }),
    validUntil: tstz("valid_until"),
    source: competencyGrantSource().notNull().default("training"),
    /** Elle verilişte gerekçe (zorunlu). */
    reason: text(),
    grantedBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    /** Geri alma: bir kez, gerekçeli (kilit `revoked_at`). */
    revokedAt: tstz("revoked_at"),
    revokedBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    revokeReason: text(),
    createdAt: createdAt(),
  },
  (t) => [index("competency_grants_user_idx").on(t.userId), index("competency_grants_competency_idx").on(t.competencyId, t.userId)],
);

