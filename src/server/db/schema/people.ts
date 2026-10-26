import { boolean, index, integer, pgEnum, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { ROLES } from "@/server/authz/roles";
import { users } from "./auth";
import { createdAt, id, tstz, updatedAt } from "./_shared";

export const personnelStatus = pgEnum("personnel_status", ["active", "passive", "terminated"]);
export const appRole = pgEnum("app_role", ROLES);

/**
 * Personel kaydı. İş paketi 1.0'da yalnızca giriş için gereken alanlar vardır;
 * pozisyon, TC, iletişim vb. alanlar 1.1'de eklenir.
 */
export const personnel = pgTable("personnel", {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: "restrict" }),
  sicilNo: text().notNull().unique(),
  fullName: text().notNull(),
  status: personnelStatus().notNull().default("active"),
  mustChangePassword: boolean().notNull().default(true),
  failedLoginCount: integer().notNull().default(0),
  lockedUntil: tstz("locked_until"),
  lastLoginAt: tstz("last_login_at"),
  passwordChangedAt: tstz("password_changed_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

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
