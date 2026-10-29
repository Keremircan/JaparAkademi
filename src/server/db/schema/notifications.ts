import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sessions, users } from "./auth";
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

// ---- Web push (SPEC 10.2, iş paketi 2.6, kararlar #175–184) ----

/**
 * Bu cihazdaki push aboneliği. Abonelik oturuma bağlıdır: çıkışta, oturum sona erince ya da kişi
 * anonimleştirilince (oturumlar silinir) abonelik de silinir. Ortak cihaz oturumunda abonelik açılmaz.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    /** Push servisinin adresi (tarayıcı + cihaz başına tekil). */
    endpoint: text().notNull().unique(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    /** Kısaltılmış tarayıcı bilgisi (profilde "bu cihaz" gösterimi için). */
    userAgent: text(),
    lastSuccessAt: tstz("last_success_at"),
    failureCount: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

/**
 * Gönderilecek push'lar (bildirim başına bir satır; kişinin bütün cihazlarına gider). Bildirim silinince
 * satır da silinir. Push yalnızca bildirim kimliğini taşır (karar #110, #176).
 */
export const pushOutbox = pgTable(
  "push_outbox",
  {
    id: id(),
    notificationId: uuid()
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: emailStatus().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    lastError: text(),
    nextAttemptAt: tstz("next_attempt_at").notNull().defaultNow(),
    sentAt: tstz("sent_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("push_outbox_pending_idx").on(t.status, t.nextAttemptAt)],
);
