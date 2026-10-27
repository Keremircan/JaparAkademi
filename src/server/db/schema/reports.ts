import { index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { id, tstz } from "./_shared";

/**
 * Rapor dışa aktarma kaydı (SPEC 10.1: "her dışa aktarma denetim kaydına yazılır", karar #97).
 * Yalnızca eklenir; kim, hangi rapor, hangi filtreler, kaç satır, hangi biçim.
 */
export const reportExports = pgTable(
  "report_exports",
  {
    id: id(),
    actorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    report: text().notNull(),
    format: text().notNull(),
    filters: jsonb().$type<Record<string, string | null>>().notNull(),
    rowCount: integer().notNull(),
    at: tstz("at").notNull().defaultNow(),
  },
  (t) => [index("report_exports_actor_idx").on(t.actorId, t.at)],
);
