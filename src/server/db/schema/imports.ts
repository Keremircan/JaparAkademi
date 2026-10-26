import { index, integer, jsonb, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { createdAt, id, tstz } from "./_shared";

/**
 * Excel personel aktarımı (SPEC 4.1, FG-1.4).
 * Yükleme → satır doğrulama (validated) → onay (committed). Onaylanmamış aktarımlar
 * worker tarafından 24 saat sonra silinir (kişisel veri içerir).
 */
export const importMode = pgEnum("import_mode", ["existing_staff", "new_hires"]);
export const importBatchStatus = pgEnum("import_batch_status", ["validated", "committed", "cancelled"]);
export const importRowStatus = pgEnum("import_row_status", ["valid", "error", "created", "updated", "unchanged"]);

export const importBatches = pgTable("import_batches", {
  id: id(),
  fileName: text().notNull(),
  fileSize: integer().notNull(),
  mode: importMode().notNull(),
  status: importBatchStatus().notNull().default("validated"),
  totalRows: integer().notNull(),
  validRows: integer().notNull(),
  errorRows: integer().notNull(),
  createdBy: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  committedBy: uuid().references(() => users.id, { onDelete: "restrict" }),
  committedAt: tstz("committed_at"),
  createdCount: integer(),
  updatedCount: integer(),
});

/**
 * Aktarım satırı. `data` normalleştirilmiş değerleri içerir; TC yalnızca şifreli/maskeli/HMAC hâliyle tutulur.
 * Onaylanınca (committed_at dolu) değiştirilemez.
 */
export const importRows = pgTable(
  "import_rows",
  {
    id: id(),
    batchId: uuid()
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    rowNumber: integer().notNull(),
    sicilNo: text(),
    data: jsonb().notNull(),
    errors: jsonb().$type<string[]>().notNull().default([]),
    status: importRowStatus().notNull(),
    userId: uuid().references(() => users.id, { onDelete: "restrict" }),
    committedAt: tstz("committed_at"),
  },
  (t) => [unique("import_rows_batch_row_unique").on(t.batchId, t.rowNumber), index("import_rows_batch_idx").on(t.batchId)],
);
