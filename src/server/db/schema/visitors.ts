import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, pgEnum, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { VISIT_STATUSES } from "@/server/state/visits";
import { users } from "./auth";
import { mediaAssets } from "./content";
import { createdAt, id, tstz, updatedAt } from "./_shared";

/**
 * Ziyaretçi İSG modülü temeli (SPEC Bölüm 8, iş paketi 2.2). Stajyer ziyaretçi değildir (personel, `intern`).
 * Tip ayarları (soru sayısı, geçme notu, geçerlilik) `visitor.types` parametresindedir (karar #126).
 */
export const VISITOR_TYPES = ["office", "site", "contractor"] as const;
export const visitorType = pgEnum("visitor_type", VISITOR_TYPES);

// ---- Bilgilendirme paketleri (karar #127): tip başına sürümlü, TR + EN ----

export const visitorBriefings = pgTable(
  "visitor_briefings",
  {
    id: id(),
    visitorType: visitorType().notNull(),
    version: integer().notNull(),
    /** Yayın anı (kilit): yayınlanan sürüm ve kartları/soruları değiştirilemez. Güncel = en son yayınlanan. */
    publishedAt: tstz("published_at"),
    publishedBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("visitor_briefings_type_version_unique").on(t.visitorType, t.version),
    // Tip başına aynı anda tek taslak
    uniqueIndex("visitor_briefings_one_draft").on(t.visitorType).where(sql`${t.publishedAt} is null`),
  ],
);

export const visitorBriefingCards = pgTable(
  "visitor_briefing_cards",
  {
    id: id(),
    briefingId: uuid()
      .notNull()
      .references(() => visitorBriefings.id, { onDelete: "cascade" }),
    sortOrder: integer().notNull(),
    titleTr: text().notNull(),
    bodyTr: text().notNull(),
    titleEn: text().notNull(),
    bodyEn: text().notNull(),
    /** İsteğe bağlı görsel ya da video (video izlenmeden geçilemez, 2.3). */
    mediaAssetId: uuid().references(() => mediaAssets.id, { onDelete: "restrict" }),
  },
  (t) => [index("visitor_briefing_cards_briefing_idx").on(t.briefingId, t.sortOrder)],
);

export const visitorBriefingQuestions = pgTable(
  "visitor_briefing_questions",
  {
    id: id(),
    briefingId: uuid()
      .notNull()
      .references(() => visitorBriefings.id, { onDelete: "cascade" }),
    sortOrder: integer().notNull(),
    stemTr: text().notNull(),
    stemEn: text().notNull(),
    optionsTr: jsonb().$type<string[]>().notNull(),
    optionsEn: jsonb().$type<string[]>().notNull(),
    correctIndex: integer().notNull(),
  },
  (t) => [index("visitor_briefing_questions_briefing_idx").on(t.briefingId, t.sortOrder)],
);

// ---- Taşeron firma kartı (FG-8.3) ----

export const contractorCompanies = pgTable(
  "contractor_companies",
  {
    id: id(),
    name: text().notNull(),
    taxNo: text(),
    responsibleName: text(),
    phone: text(),
    email: text(),
    contractEnd: date({ mode: "string" }),
    archivedAt: tstz("archived_at"),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("contractor_companies_tax_no_unique").on(t.taxNo).where(sql`${t.taxNo} is not null`)],
);

// ---- Ziyaretçi ve ziyaret ----

export const visitorIdKind = pgEnum("visitor_id_kind", ["tc", "passport"]);

/** Aynı kimlik no = aynı ziyaretçi (HMAC ile eşleşir, karar #132). Kimlik no yoksa her ziyaret yeni kayıt açar. */
export const visitors = pgTable(
  "visitors",
  {
    id: id(),
    fullName: text().notNull(),
    companyName: text(),
    contractorCompanyId: uuid().references(() => contractorCompanies.id, { onDelete: "restrict" }),
    phone: text(),
    email: text(),
    idKind: visitorIdKind(),
    idCountry: text(),
    nationalIdEnc: text(),
    nationalIdHmac: text().unique(),
    nationalIdMasked: text(),
    anonymizedAt: tstz("anonymized_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("visitors_company_idx").on(t.contractorCompanyId)],
);

export const visitStatus = pgEnum("visit_status", VISIT_STATUSES);

export const visits = pgTable(
  "visits",
  {
    id: id(),
    visitorId: uuid()
      .notNull()
      .references(() => visitors.id, { onDelete: "restrict" }),
    visitorType: visitorType().notNull(),
    hostUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    plannedDate: date({ mode: "string" }).notNull(),
    status: visitStatus().notNull().default("planned"),
    note: text(),
    cancelReason: text(),
    cancelledAt: tstz("cancelled_at"),
    cancelledBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("visits_date_idx").on(t.plannedDate),
    index("visits_host_idx").on(t.hostUserId, t.plannedDate),
    index("visits_visitor_idx").on(t.visitorId),
    check("visits_cancel_reason_check", sql`${t.status} <> 'cancelled' or ${t.cancelReason} is not null`),
  ],
);

// ---- Kara liste (FG-8.4): yalnızca eklenir; kaldırma gerekçeli kilit alanlarıyla ----

export const blacklistEntries = pgTable(
  "blacklist_entries",
  {
    id: id(),
    nationalIdHmac: text(),
    nationalIdMasked: text(),
    fullNameSnapshot: text().notNull(),
    reason: text().notNull(),
    /** Boşsa süresiz. */
    endsAt: date({ mode: "string" }),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    liftedReason: text(),
    liftedBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    liftedAt: tstz("lifted_at"),
    anonymizedAt: tstz("anonymized_at"),
  },
  (t) => [index("blacklist_entries_hmac_idx").on(t.nationalIdHmac)],
);
