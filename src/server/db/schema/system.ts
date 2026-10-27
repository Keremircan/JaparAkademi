import { bigint, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { createdAt, id, tstz, updatedAt } from "./_shared";

/** Parametreler (SPEC Bölüm 14). Değerler src/server/settings/registry.ts'teki Zod şemalarıyla doğrulanır. */
export const settings = pgTable("settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedBy: uuid().references(() => users.id, { onDelete: "restrict" }),
  /** Son değişikliğin gerekçesi (saklama sürelerinde zorunlu); denetim kaydına da yazılır. */
  changeNote: text(),
  updatedAt: updatedAt(),
});

/**
 * Değiştirilemez kayıtlarda düzeltme: hedef kayıt değişmez, düzeltme bu tabloya yazılır.
 * Bu tablonun kendisi de değiştirilemezdir.
 */
export const corrections = pgTable(
  "corrections",
  {
    id: id(),
    targetTable: text().notNull(),
    targetId: text().notNull(),
    field: text().notNull(),
    oldValue: jsonb(),
    newValue: jsonb(),
    reason: text().notNull(),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [index("corrections_target_idx").on(t.targetTable, t.targetId)],
);

/**
 * Denetim kaydı: audit_trigger() tarafından yazılır, append-only.
 * Uygulama kullanıcısı yalnızca okuyabilir.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    at: tstz("at").notNull().defaultNow(),
    actorId: uuid(),
    requestId: text(),
    tableName: text().notNull(),
    recordId: text(),
    action: text().notNull(),
    oldData: jsonb(),
    newData: jsonb(),
  },
  (t) => [
    index("audit_log_record_idx").on(t.tableName, t.recordId),
    index("audit_log_actor_idx").on(t.actorId, t.at),
    index("audit_log_at_idx").on(t.at),
  ],
);
