import { sql } from "drizzle-orm";
import {
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
import { commonTarget, contents, contentVersionStatus } from "./content";
import { orgUnits, positions } from "./org";
import { createdAt, id, tstz, updatedAt } from "./_shared";

/**
 * Pozisyon kartı ve eğitim planı (SPEC Bölüm 5, 4.3, FG-3.1).
 * Kart sürümlüdür; plan kart sürümüyle birlikte sürümlenir (karar #44). Yayınlanan kart, planı ve
 * plan modülleri değiştirilemez. Modüller sürümsüzdür; değişiklik yeni atamalara yansır (karar #45).
 */

// ---- Pozisyon kartı ----

export const positionCardVersions = pgTable(
  "position_card_versions",
  {
    id: id(),
    positionId: uuid()
      .notNull()
      .references(() => positions.id, { onDelete: "restrict" }),
    version: integer().notNull(),
    /** İçerikle aynı akış: draft → section_review → (İSG) ohs_review → published; rejected */
    status: contentVersionStatus().notNull().default("draft"),
    /** 2–12. bölümler (Zod şeması: services/positions/card-schema.ts). Künye yayında kopyalanır. */
    sections: jsonb().notNull().default({}),
    /** 9. bölüm (İSG) önceki yayına göre değişti mi; ilk sürümde her zaman true. Gönderimde hesaplanır. */
    ohsSectionChanged: boolean().notNull().default(true),
    changeNote: text(),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    submittedBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    submittedAt: tstz("submitted_at"),
    /** Kilit: dolunca sürüm değiştirilemez. */
    publishedAt: tstz("published_at"),
  },
  (t) => [
    unique("position_card_versions_position_version_unique").on(t.positionId, t.version),
    index("position_card_versions_status_idx").on(t.status),
  ],
);

/** "Gözden geçirdim" kayıtları: değişiklik yapmadan güncelliği onaylar (değiştirilemez). */
export const positionCardReviews = pgTable(
  "position_card_reviews",
  {
    id: id(),
    cardVersionId: uuid()
      .notNull()
      .references(() => positionCardVersions.id, { onDelete: "restrict" }),
    note: text(),
    reviewedBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reviewedAt: tstz("reviewed_at").notNull().defaultNow(),
  },
  (t) => [index("position_card_reviews_version_idx").on(t.cardVersionId)],
);

// ---- Modül kütüphanesi ----

export const moduleKind = pgEnum("module_kind", ["theory", "practice", "theory_exam", "practice_exam"]);

export const modules = pgTable(
  "modules",
  {
    id: id(),
    kind: moduleKind().notNull(),
    title: text().notNull(),
    description: text(),
    durationMin: integer().notNull(),
    isOhs: boolean().notNull().default(false),
    /** Uzaktan (çevrim içi) verilebilir mi; İSG modüllerinde yalnızca İSG uzmanı değiştirir. */
    remoteAllowed: boolean().notNull().default(true),
    /** Geçerlilik (ay); boşsa süresiz. */
    validityMonths: integer(),
    /** Sahip birim; boşsa ortak modül (her plana yaka tipine göre otomatik eklenir — karar #46). */
    ownerOrgUnitId: uuid().references(() => orgUnits.id, { onDelete: "restrict" }),
    commonTarget: commonTarget(),
    /** Ortak modüllerin sırası. */
    commonSortOrder: integer(),
    /** Doluysa bu modül o pozisyonun "Pozisyon kartı" modülüdür (karar #47). */
    cardPositionId: uuid()
      .unique()
      .references(() => positions.id, { onDelete: "restrict" }),
    archivedAt: tstz("archived_at"),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("modules_owner_idx").on(t.ownerOrgUnitId),
    check("modules_duration_check", sql`${t.durationMin} > 0 and ${t.durationMin} <= 100000`),
    check("modules_validity_check", sql`${t.validityMonths} is null or ${t.validityMonths} between 1 and 240`),
    check(
      "modules_common_check",
      sql`(${t.ownerOrgUnitId} is null) = (${t.commonTarget} is not null) and (${t.cardPositionId} is null or ${t.ownerOrgUnitId} is not null)`,
    ),
  ],
);

/** Teorik modülün içerikleri (atama anında yayındaki sürüm sabitlenir — 1.4). */
export const moduleContents = pgTable(
  "module_contents",
  {
    moduleId: uuid()
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    contentId: uuid()
      .notNull()
      .references(() => contents.id, { onDelete: "restrict" }),
    sortOrder: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.moduleId, t.contentId] }), index("module_contents_content_idx").on(t.contentId)],
);

/** Pratik görevler (FG-5.1). Kullanılmış görev silinmez, arşivlenir. */
export const practiceTasks = pgTable(
  "practice_tasks",
  {
    id: id(),
    moduleId: uuid()
      .notNull()
      .references(() => modules.id, { onDelete: "restrict" }),
    title: text().notNull(),
    description: text(),
    isCritical: boolean().notNull().default(false),
    sortOrder: integer().notNull(),
    archivedAt: tstz("archived_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("practice_tasks_module_idx").on(t.moduleId)],
);

// ---- Eğitim planı (kart sürümüyle birlikte) ----

export type PlanOverrides = { videoWatchRatio?: number };

export type PlanModuleSettings = {
  questionCount?: number;
  durationMin?: number;
  passScore?: number;
  maxAttempts?: number;
  cooldownHours?: number;
  proctorRequired?: boolean;
};

export const trainingPlans = pgTable("training_plans", {
  id: id(),
  cardVersionId: uuid()
    .notNull()
    .unique()
    .references(() => positionCardVersions.id, { onDelete: "cascade" }),
  /** Plan bazında parametre değerleri (boş = genel parametre). */
  overrides: jsonb().$type<PlanOverrides>().notNull().default({}),
});

export const planModules = pgTable(
  "plan_modules",
  {
    planId: uuid()
      .notNull()
      .references(() => trainingPlans.id, { onDelete: "cascade" }),
    moduleId: uuid()
      .notNull()
      .references(() => modules.id, { onDelete: "restrict" }),
    sortOrder: integer().notNull(),
    isRequired: boolean().notNull().default(true),
    /** Ön koşullar (plandaki önceki modüller). */
    prerequisiteModuleIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    /** Sınav modülleri için plan bazında ayarlar (boş alan = genel parametre). */
    settings: jsonb().$type<PlanModuleSettings>().notNull().default({}),
  },
  (t) => [primaryKey({ columns: [t.planId, t.moduleId] }), index("plan_modules_module_idx").on(t.moduleId)],
);
