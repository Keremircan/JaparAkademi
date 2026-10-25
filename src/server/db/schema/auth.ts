/**
 * Better Auth tabloları. Alan adları Better Auth'un model alanlarıyla birebir aynı olmalıdır
 * (adapter TS anahtarlarını kullanır); sütunlar snake_case'e çevrilir.
 */
import { boolean, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, tstz, updatedAt } from "./_shared";

export const users = pgTable("users", {
  id: id(),
  name: text().notNull(),
  // Better Auth zorunlu tutar; kişinin gerçek e-postası personnel.email'dedir.
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  // username = sicil no (username eklentisi)
  username: text().unique(),
  displayUsername: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable("sessions", {
  id: id(),
  expiresAt: tstz("expires_at").notNull(),
  token: text().notNull().unique(),
  ipAddress: text(),
  userAgent: text(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Ortak cihaz oturumu: işlemsizlik süresi dolunca sonlandırılır
  sharedDevice: boolean().notNull().default(false),
  lastSeenAt: tstz("last_seen_at").notNull().defaultNow(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const accounts = pgTable("accounts", {
  id: id(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: tstz("access_token_expires_at"),
  refreshTokenExpiresAt: tstz("refresh_token_expires_at"),
  scope: text(),
  password: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("accounts_user_idx").on(t.userId)]);

export const verifications = pgTable("verifications", {
  id: id(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: tstz("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("verifications_identifier_idx").on(t.identifier)]);
