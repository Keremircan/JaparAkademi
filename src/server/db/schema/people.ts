import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgEnum, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { ROLES } from "@/server/authz/roles";
import { users } from "./auth";
import { orgUnits, positions } from "./org";
import { createdAt, id, tstz, updatedAt } from "./_shared";

export const personnelStatus = pgEnum("personnel_status", ["active", "passive", "terminated"]);
export const appRole = pgEnum("app_role", ROLES);
export const employmentType = pgEnum("employment_type", ["employee", "intern"]);
export const personnelSource = pgEnum("personnel_source", ["excel", "manual", "hr_sync"]);

/**
 * Personel kaydı (SPEC 12.1).
 * TC kimlik no: national_id_enc (AES-256-GCM, "v<anahtar sürümü>:<base64>"), national_id_hmac (eşleştirme),
 * national_id_masked (ekranda gösterilen). Tam TC yalnızca İK'ya çözülür ve her görüntüleme data_access_log'a yazılır.
 */
export const personnel = pgTable(
  "personnel",
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: "restrict" }),
    sicilNo: text().notNull().unique(),
    fullName: text().notNull(),
    nationalIdEnc: text(),
    nationalIdHmac: text().unique(),
    nationalIdMasked: text(),
    phone: text(),
    email: text(),
    /** Boş olabilir (ör. BT personeli); pozisyonsuz personele eğitim atanamaz. */
    positionId: uuid().references(() => positions.id, { onDelete: "restrict" }),
    employmentType: employmentType().notNull().default("employee"),
    hireDate: date({ mode: "string" }),
    endDate: date({ mode: "string" }),
    status: personnelStatus().notNull().default("active"),
    source: personnelSource().notNull().default("manual"),
    /** Yeni işe giren (true) → 1.4'te eğitim planı atanır; mevcut personel (false) → atanmaz. */
    trainingRequired: boolean().notNull().default(false),
    mustChangePassword: boolean().notNull().default(true),
    failedLoginCount: integer().notNull().default(0),
    lockedUntil: tstz("locked_until"),
    lastLoginAt: tstz("last_login_at"),
    passwordChangedAt: tstz("password_changed_at"),
    /** Davet etkinleştirildi ya da ilk şifre değiştirildi (karar #187). Boşsa hesap davet bekliyor. */
    activatedAt: tstz("activated_at"),
    /** Saklama süresi dolunca anonimleştirildi (SPEC 12.3, iş paketi 2.1). */
    anonymizedAt: tstz("anonymized_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("personnel_position_idx").on(t.positionId),
    index("personnel_status_idx").on(t.status),
    check("personnel_terminated_end_date_check", sql`${t.status} <> 'terminated' or ${t.endDate} is not null`),
  ],
);

export const loginAttemptResult = pgEnum("login_attempt_result", [
  "success",
  "unknown_user",
  "bad_password",
  "locked",
  "inactive",
  "rate_limited",
  // Hesap etkinleştirme (iş paketi 2.6b): hatalı/geçersiz kod ve başarılı etkinleştirme
  "bad_invite",
  "activated",
]);

/** Giriş denemeleri: hesap kilidi ve IP sınırı bu kayıtlardan hesaplanır. Append-only. */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: id(),
    at: tstz("at").notNull().defaultNow(),
    sicilInput: text().notNull(),
    userId: uuid().references(() => users.id, { onDelete: "restrict" }),
    ip: text(),
    userAgent: text(),
    result: loginAttemptResult().notNull(),
  },
  (t) => [
    index("login_attempts_ip_idx").on(t.ip, t.at),
    index("login_attempts_user_idx").on(t.userId, t.at),
  ],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: appRole().notNull(),
    grantedBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    grantedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

/**
 * Bölüm sorumlusu kapsamı (SPEC 2.2): atanan org düğümü ve altındaki tüm düğümler.
 */
export const roleScopes = pgTable(
  "role_scopes",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: appRole().notNull(),
    orgUnitId: uuid()
      .notNull()
      .references(() => orgUnits.id, { onDelete: "restrict" }),
    grantedBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    grantedAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.role, t.orgUnitId] }),
    check("role_scopes_role_check", sql`${t.role} = 'section_manager'`),
  ],
);

/** Hassas veri görüntüleme kaydı (ör. tam TC). Append-only; uygulama seviyesinde yazılır. */
export const dataAccessLog = pgTable(
  "data_access_log",
  {
    id: id(),
    at: tstz("at").notNull().defaultNow(),
    actorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    subjectUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    field: text().notNull(),
    requestId: text(),
  },
  (t) => [index("data_access_log_subject_idx").on(t.subjectUserId, t.at)],
);

export const inviteChannel = pgEnum("invite_channel", ["email", "whatsapp", "print"]);
export const inviteBatchMode = pgEnum("invite_batch_mode", ["smart", "email", "whatsapp", "print"]);

/** Toplu davet işlemi (karar #201): Davetler ekranında birlikte oluşturulan davetler. */
export const invitationBatches = pgTable(
  "invitation_batches",
  {
    id: id(),
    mode: inviteBatchMode().notNull(),
    total: integer().notNull(),
    emailCount: integer().notNull().default(0),
    whatsappCount: integer().notNull().default(0),
    printCount: integer().notNull().default(0),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [index("invitation_batches_created_idx").on(t.createdAt)],
);

/**
 * Hesaba davet (kararlar #185–187). Token yalnızca SHA-256 özetiyle, basılı kanalın 8 haneli kodu
 * HMAC ile saklanır. Tek kullanımlık ve süreli; yeni davet açılınca kişinin eski davetleri iptal edilir.
 */
export const accountInvitations = pgTable(
  "account_invitations",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    channel: inviteChannel().notNull(),
    batchId: uuid().references(() => invitationBatches.id, { onDelete: "restrict" }),
    tokenHash: text().notNull().unique(),
    codeHash: text(),
    expiresAt: tstz("expires_at").notNull(),
    usedAt: tstz("used_at"),
    revokedAt: tstz("revoked_at"),
    failedAttempts: integer().notNull().default(0),
    /** Toplu WhatsApp listesini yeniden açmak için şifreli bağlantı; kullanılınca/iptalde/süre dolunca silinir (karar #201). */
    linkEnc: text(),
    /** İK'nın "WhatsApp'ta gönder"e bastığı an (mesajın gittiğini garanti etmez). */
    sharedAt: tstz("shared_at"),
    createdBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_invitations_user_idx").on(t.userId, t.createdAt), index("account_invitations_batch_idx").on(t.batchId)],
);

/**
 * Üst yöneticinin (owner) kendi rolü olmadan yaptığı mesleki işlemler (karar #196): İSG onayı,
 * pratik sınav imzası, işe başlama kararı vb. Append-only, değiştirilemez.
 */
export const ownerActions = pgTable(
  "owner_actions",
  {
    id: id(),
    at: tstz("at").notNull().defaultNow(),
    actorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    permission: text().notNull(),
    subjectType: text().notNull(),
    subjectId: uuid().notNull(),
  },
  (t) => [index("owner_actions_actor_idx").on(t.actorId, t.at)],
);
