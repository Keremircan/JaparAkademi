import { index, integer, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { createdAt, id, tstz } from "./_shared";

/**
 * KVKK aydınlatma metinleri ve onaylar (SPEC 13.3).
 * Metin taslakken düzenlenebilir; yayınlanınca (published_at dolu) değiştirilemez.
 * Yeni sürüm yayınlanınca kullanıcılar bir sonraki girişte yeniden onaylar.
 */
export const legalTextKind = pgEnum("legal_text_kind", ["kvkk_personnel", "kvkk_visitor", "visitor_rules"]);

export const legalTexts = pgTable(
  "legal_texts",
  {
    id: id(),
    kind: legalTextKind().notNull(),
    locale: text().notNull().default("tr"),
    version: integer().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    publishedAt: tstz("published_at"),
    createdBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [unique("legal_texts_kind_locale_version_unique").on(t.kind, t.locale, t.version)],
);

/** Kullanıcı onayı. Değiştirilemez. */
export const consents = pgTable(
  "consents",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    legalTextId: uuid()
      .notNull()
      .references(() => legalTexts.id, { onDelete: "restrict" }),
    acceptedAt: tstz("accepted_at").notNull().defaultNow(),
    ip: text(),
    userAgent: text(),
  },
  (t) => [
    unique("consents_user_text_unique").on(t.userId, t.legalTextId),
    index("consents_user_idx").on(t.userId),
  ],
);
