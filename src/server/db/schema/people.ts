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
