import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgEnum, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { VISIT_STATUSES } from "@/server/state/visits";
import { users } from "./auth";
import { mediaAssets } from "./content";
import { legalTexts } from "./legal";
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
    /** Kendi kaydında boş olabilir; güvenlik girişte ev sahibini atar (karar #139). */
    hostUserId: uuid().references(() => users.id, { onDelete: "restrict" }),
    /** Kendi kaydında ziyaretçinin yazdığı ev sahibi adı. */
    hostNameText: text(),
    plannedDate: date({ mode: "string" }).notNull(),
    /** 6 haneli ziyaret kodu (kiosk girişi, karar #138). */
    code: text().notNull(),
    selfRegistered: boolean().notNull().default(false),
    status: visitStatus().notNull().default("planned"),
    note: text(),
    cancelReason: text(),
    cancelledAt: tstz("cancelled_at"),
    cancelledBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    /** Kendi kaydında boş (sistem). */
    createdBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    // Bilgilendirme (iş paketi 2.3a): görülen paket sürümü, dil ve zamanlar
    briefingId: uuid().references(() => visitorBriefings.id, { onDelete: "restrict" }),
    briefingLocale: text(),
    briefingStartedAt: tstz("briefing_started_at"),
    briefingCompletedAt: tstz("briefing_completed_at"),
    quizScore: integer(),
    // Kapı (iş paketi 2.3b, kararlar #147–155): giriş sonrası yalnızca çıkış alanları değişir, çıkıştan sonra donar
    badgeNo: text(),
    ppeIssued: jsonb().$type<string[]>(),
    checkedInAt: tstz("checked_in_at"),
    checkedInBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    checkedOutAt: tstz("checked_out_at"),
    checkedOutBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    badgeReturned: boolean(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("visits_date_idx").on(t.plannedDate),
    uniqueIndex("visits_open_code_unique").on(t.code).where(sql`${t.status} in ('planned', 'briefed')`),
    check("visits_host_check", sql`${t.hostUserId} is not null or ${t.hostNameText} is not null`),
    index("visits_host_idx").on(t.hostUserId, t.plannedDate),
    index("visits_visitor_idx").on(t.visitorId),
    check("visits_cancel_reason_check", sql`${t.status} <> 'cancelled' or ${t.cancelReason} is not null`),
  ],
);

// ---- Ziyaretçi oturumu ve bilgilendirme kayıtları (iş paketi 2.3a, kararlar #137–141) ----

export const visitSessionChannel = pgEnum("visit_session_channel", ["link", "kiosk", "self"]);

/** Ziyaretçinin hesabı yoktur; bağlantı/kiosk/kendi kaydı tek ziyarete bağlı süreli bir belirteç açar. */
export const visitSessions = pgTable(
  "visit_sessions",
  {
    id: id(),
    visitId: uuid()
      .notNull()
      .references(() => visits.id, { onDelete: "cascade" }),
    channel: visitSessionChannel().notNull(),
    tokenHash: text().notNull().unique(),
    expiresAt: tstz("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("visit_sessions_visit_idx").on(t.visitId)],
);

/** Kontrol sorusu denemesi: çekilen sorular ve şık sırası başta yazılır, teslimden sonra değiştirilemez. */
export type VisitQuizItem = { questionId: string; optionOrder: number[]; answer: number | null; correct: boolean | null };

export const visitQuizAttempts = pgTable(
  "visit_quiz_attempts",
  {
    id: id(),
    visitId: uuid()
      .notNull()
      .references(() => visits.id, { onDelete: "restrict" }),
    briefingId: uuid()
      .notNull()
      .references(() => visitorBriefings.id, { onDelete: "restrict" }),
    items: jsonb().$type<VisitQuizItem[]>().notNull(),
    score: integer(),
    passed: boolean(),
    startedAt: createdAt(),
    submittedAt: tstz("submitted_at"),
  },
  (t) => [index("visit_quiz_attempts_visit_idx").on(t.visitId)],
);

/** Ziyaretçi onayı (kurallar ve KVKK metni, seçilen dilde yayındaki sürüm). Değiştirilemez. */
export const visitorConsents = pgTable(
  "visitor_consents",
  {
    id: id(),
    visitId: uuid()
      .notNull()
      .references(() => visits.id, { onDelete: "restrict" }),
    legalTextId: uuid()
      .notNull()
      .references(() => legalTexts.id, { onDelete: "restrict" }),
    acceptedAt: createdAt(),
    ip: text(),
    userAgent: text(),
  },
  (t) => [unique("visitor_consents_visit_text_unique").on(t.visitId, t.legalTextId)],
);

/** Ziyaretçi imzası (parmakla). Görsel depoda `visitor-signatures/` altında; kayıt değiştirilemez. */
export const visitorSignatures = pgTable("visitor_signatures", {
  id: id(),
  visitId: uuid()
    .notNull()
    .unique()
    .references(() => visits.id, { onDelete: "restrict" }),
  visitorId: uuid()
    .notNull()
    .references(() => visitors.id, { onDelete: "restrict" }),
  subjectHash: text().notNull(),
  /** Anonimleştirmede silinir (karar #134). */
  imageKey: text(),
  signedAt: createdAt(),
  ip: text(),
  userAgent: text(),
});

// ---- Taşeron geçerliliği ve kara liste reddi (iş paketi 2.3b) ----

/** Bilgilendirmeyi geçen taşeron çalışanının geçerliliği (karar #152). Değiştirilemez; yeni geçerlilik yeni satırdır. */
export const contractorClearances = pgTable(
  "contractor_clearances",
  {
    id: id(),
    visitorId: uuid()
      .notNull()
      .references(() => visitors.id, { onDelete: "restrict" }),
    visitId: uuid()
      .notNull()
      .unique()
      .references(() => visits.id, { onDelete: "restrict" }),
    validUntil: date({ mode: "string" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("contractor_clearances_visitor_idx").on(t.visitorId, t.validUntil)],
);

/** Kara liste nedeniyle reddedilen giriş denemesi (karar #151). Değiştirilemez. */
export const visitDenials = pgTable(
  "visit_denials",
  {
    id: id(),
    visitId: uuid()
      .notNull()
      .references(() => visits.id, { onDelete: "restrict" }),
    blacklistEntryId: uuid()
      .notNull()
      .references(() => blacklistEntries.id, { onDelete: "restrict" }),
    deniedBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    deniedAt: createdAt(),
  },
  (t) => [index("visit_denials_visit_idx").on(t.visitId)],
);

// ---- Tahliye yoklaması (FG-8.1, iş paketi 2.4, kararlar #156–163) ----

export const rollcallKind = pgEnum("rollcall_kind", ["drill", "real"]);

/** Yoklama: aynı anda tek açık yoklama (serviste kilitle). Bitince (ended_at) donar. */
export const evacuationRollcalls = pgTable("evacuation_rollcalls", {
  id: id(),
  kind: rollcallKind().notNull(),
  startedBy: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  startedAt: createdAt(),
  endedBy: uuid().references(() => users.id, { onDelete: "restrict" }),
  endedAt: tstz("ended_at"),
});

/** Yoklamadaki kişi (içerideki ziyaret) ve "toplanma alanında" işareti; yoklama açıkken geri alınabilir. */
export const evacuationMarks = pgTable(
  "evacuation_marks",
  {
    id: id(),
    rollcallId: uuid()
      .notNull()
      .references(() => evacuationRollcalls.id, { onDelete: "restrict" }),
    visitId: uuid()
      .notNull()
      .references(() => visits.id, { onDelete: "restrict" }),
    addedAt: createdAt(),
    safeAt: tstz("safe_at"),
    safeBy: uuid().references(() => users.id, { onDelete: "restrict" }),
  },
  (t) => [unique("evacuation_marks_rollcall_visit_unique").on(t.rollcallId, t.visitId)],
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
