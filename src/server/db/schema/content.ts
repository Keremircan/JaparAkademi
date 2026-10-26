import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  customType,
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
import { orgUnits } from "./org";
import { createdAt, id, tstz, updatedAt } from "./_shared";

/**
 * İçerik kütüphanesi (SPEC 4.2, FG-2.1–2.5).
 * İçerik → sürümler (yayınlanınca değiştirilemez) → dil satırları (Faz 1: yalnızca "tr").
 * Eski yayınlanmış sürümler "yerine geçilmiş" sayılır; güncel sürüm contents.current_published_version_id'dir.
 */

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const contentType = pgEnum("content_type", [
  "text",
  "pdf",
  "video",
  "gallery",
  "instruction",
  "checklist",
  "form_template",
]);
export const commonTarget = pgEnum("common_target", ["all", "blue", "white"]);
export const contentVersionStatus = pgEnum("content_version_status", [
  "draft",
  "section_review",
  "ohs_review",
  "published",
  "rejected",
]);

export const contents = pgTable(
  "contents",
  {
    id: id(),
    type: contentType().notNull(),
    /** Sahip birim; boşsa ortak içerik (ör. genel İSG, şirket tanıtımı). */
    ownerOrgUnitId: uuid().references(() => orgUnits.id, { onDelete: "restrict" }),
    isOhs: boolean().notNull().default(false),
    /** Ortak içeriğin hedef kitlesi (FG-1.3); birime ait içerikte boş. */
    commonTarget: commonTarget(),
    currentPublishedVersionId: uuid().references((): AnyPgColumn => contentVersions.id, { onDelete: "restrict" }),
    /** Son sürümün başlığı (liste ve sıralama için). */
    title: text().notNull(),
    /** Türkçe tam metin araması: başlık + metin + etiketler (unaccent + turkish). */
    searchVector: tsvector("search_vector"),
    archivedAt: tstz("archived_at"),
    archivedBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("contents_owner_idx").on(t.ownerOrgUnitId),
    index("contents_search_idx").using("gin", t.searchVector),
    check(
      "contents_common_target_check",
      sql`(${t.ownerOrgUnitId} is null) = (${t.commonTarget} is not null)`,
    ),
  ],
);

export const contentVersions = pgTable(
  "content_versions",
  {
    id: id(),
    contentId: uuid()
      .notNull()
      .references(() => contents.id, { onDelete: "restrict" }),
    version: integer().notNull(),
    status: contentVersionStatus().notNull().default("draft"),
    changeNote: text(),
    /** FG-2.2: yayınlanınca önceki sürümü tamamlayanlara "tekrar oku ve onayla" görevi (1.4). */
    requireReread: boolean().notNull().default(false),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    submittedBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    submittedAt: tstz("submitted_at"),
    /** Kilit: dolunca sürüm değiştirilemez (prevent_mutation). */
    publishedAt: tstz("published_at"),
  },
  (t) => [unique("content_versions_content_version_unique").on(t.contentId, t.version), index("content_versions_status_idx").on(t.status)],
);

/** Dil bazında başlık ve gövde (gövde biçimi içerik tipine göre; Zod şemaları services/content/body.ts). */
export const contentVersionLocales = pgTable(
  "content_version_locales",
  {
    contentVersionId: uuid()
      .notNull()
      .references(() => contentVersions.id, { onDelete: "cascade" }),
    locale: text().notNull(),
    title: text().notNull(),
    body: jsonb().notNull(),
  },
  (t) => [primaryKey({ columns: [t.contentVersionId, t.locale] })],
);

// ---- Medya ----

export const mediaKind = pgEnum("media_kind", ["image", "pdf", "video", "document"]);
export const mediaStatus = pgEnum("media_status", ["pending_upload", "uploaded", "processing", "ready", "failed"]);

export type MediaDerived = {
  /** Görsel: WebP (en fazla 2000 px) ve küçük önizleme */
  webpKey?: string;
  thumbKey?: string;
  /** Video: HLS önekleri ve kapak */
  hlsPrefix?: string;
  renditions?: { name: string; height: number; bandwidth: number }[];
  posterKey?: string;
};

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: id(),
    kind: mediaKind().notNull(),
    status: mediaStatus().notNull().default("pending_upload"),
    objectKey: text().notNull(),
    mime: text().notNull(),
    size: bigint({ mode: "number" }).notNull(),
    originalName: text().notNull(),
    /** Parçalı yükleme kimliği (S3 multipart). */
    uploadId: text(),
    derived: jsonb().$type<MediaDerived>().notNull().default({}),
    durationSec: integer(),
    width: integer(),
    height: integer(),
    pageCount: integer(),
    error: text(),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("media_assets_created_by_idx").on(t.createdBy)],
);

/** Sürümün kullandığı medya (erişim kontrolü ve yayın öncesi "hazır mı" kontrolü için). */
export const contentVersionAssets = pgTable(
  "content_version_assets",
  {
    contentVersionId: uuid()
      .notNull()
      .references(() => contentVersions.id, { onDelete: "cascade" }),
    assetId: uuid()
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.contentVersionId, t.assetId] }), index("content_version_assets_asset_idx").on(t.assetId)],
);

// ---- Etiketler (FG-2.4) ----

export const tagTypes = pgTable("tag_types", {
  id: id(),
  key: text().notNull().unique(),
  sortOrder: integer().notNull().default(0),
});

export const tags = pgTable(
  "tags",
  {
    id: id(),
    tagTypeId: uuid()
      .notNull()
      .references(() => tagTypes.id, { onDelete: "restrict" }),
    name: text().notNull(),
    createdBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [unique("tags_type_name_unique").on(t.tagTypeId, t.name)],
);

export const contentTags = pgTable(
  "content_tags",
  {
    contentId: uuid()
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    tagId: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.contentId, t.tagId] }), index("content_tags_tag_idx").on(t.tagId)],
);

// ---- Onaylar (SPEC 12.1; içerik, pozisyon kartı, soru, sınıf eğitimi) ----

export const approvalSubject = pgEnum("approval_subject", [
  "content_version",
  "position_card_version",
  "question_version",
  "classroom_session",
]);
export const approvalStep = pgEnum("approval_step", ["section", "ohs"]);
export const approvalDecision = pgEnum("approval_decision", ["approved", "rejected", "auto_self"]);

/** Onay/ret kaydı. Değiştirilemez. */
export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    subjectType: approvalSubject().notNull(),
    subjectId: uuid().notNull(),
    step: approvalStep().notNull(),
    decision: approvalDecision().notNull(),
    comment: text(),
    decidedBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    decidedAt: tstz("decided_at").notNull().defaultNow(),
  },
  (t) => [
    index("approvals_subject_idx").on(t.subjectType, t.subjectId),
    check("approvals_reject_comment_check", sql`${t.decision} <> 'rejected' or length(trim(${t.comment})) > 0`),
  ],
);
