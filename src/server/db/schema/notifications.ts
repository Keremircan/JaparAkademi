import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { createdAt, id, tstz, updatedAt } from "./_shared";

/**
 * Bildirimler (SPEC 10.2, iş paketi 1.8a). Uygulama içi bildirim her zaman yazılır; e-posta `email_outbox`
 * üzerinden worker ile gönderilir. Metin gösterimde mesaj dosyasından üretilir (yalnızca tür + parametre saklanır).
 */

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Olay türü (ör. `readiness_pending`); metin `notifications.kinds.<tür>` mesajından gelir. */
    kind: text().notNull(),
    /** Aynı konu için okunmamış tek bildirim tutulur (karar #90). */
    subjectKey: text().notNull(),
    params: jsonb().$type<Record<string, string | number>>().notNull().default({}),
    /** Tıklanınca gidilecek uygulama içi yol (yetki o ekranda yeniden kontrol edilir). */
    link: text().notNull(),
    readAt: tstz("read_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("notifications_unread_subject_unique").on(t.userId, t.kind, t.subjectKey).where(sql`${t.readAt} is null`),
  ],
);

export const emailStatus = pgEnum("email_status", ["pending", "sent", "failed", "skipped"]);

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: id(),
    notificationId: uuid().references(() => notifications.id, { onDelete: "set null" }),
    /** Şifre sıfırlama gibi bildirimsiz e-postalar için tür. */
    kind: text().notNull(),
    toAddress: text().notNull(),
    subject: text().notNull(),
    bodyText: text().notNull(),
    bodyHtml: text().notNull(),
    status: emailStatus().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    lastError: text(),
    nextAttemptAt: tstz("next_attempt_at").notNull().defaultNow(),
    sentAt: tstz("sent_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("email_outbox_pending_idx").on(t.status, t.nextAttemptAt)],
);

// ---- E-postayla şifre sıfırlama (SPEC 11.4, karar #88) ----

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Bağlantıdaki token'ın SHA-256 özeti (token saklanmaz). */
    tokenHash: text().notNull().unique(),
    expiresAt: tstz("expires_at").notNull(),
    usedAt: tstz("used_at"),
    ip: text(),
    createdAt: createdAt(),
  },
  (t) => [index("password_reset_tokens_user_idx").on(t.userId, t.createdAt)],
);
