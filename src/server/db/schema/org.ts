import { type AnyPgColumn, boolean, check, index, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";
import { createdAt, id, updatedAt } from "./_shared";

/**
 * Organizasyon ağacı (SPEC 4.1, FG-1.1). İki seviye:
 * departman (kök, üst düğümü yok) → bölüm (üst düğümü bir departman).
 * Pozisyon bir bölüme ya da doğrudan bir departmana bağlanır.
 */
export const orgUnitKind = pgEnum("org_unit_kind", ["department", "section"]);
export const collarType = pgEnum("collar_type", ["blue", "white"]);
export const positionStatus = pgEnum("position_status", ["active", "passive"]);

export const orgUnits = pgTable(
  "org_units",
  {
    id: id(),
    parentId: uuid().references((): AnyPgColumn => orgUnits.id, { onDelete: "restrict" }),
    kind: orgUnitKind().notNull(),
    name: text().notNull(),
    code: text().notNull().unique(),
    /** Görüntüleme amaçlı sorumlu (departman/bölüm amiri). Yetki kapsamı role_scopes'tadır. */
    responsibleUserId: uuid().references(() => users.id, { onDelete: "restrict" }),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("org_units_parent_name_unique").on(t.parentId, t.name).nullsNotDistinct(),
    index("org_units_parent_idx").on(t.parentId),
    check(
      "org_units_kind_parent_check",
      sql`(${t.kind} = 'department' and ${t.parentId} is null) or (${t.kind} = 'section' and ${t.parentId} is not null)`,
    ),
  ],
);

export const positions = pgTable(
  "positions",
  {
    id: id(),
    orgUnitId: uuid()
      .notNull()
      .references(() => orgUnits.id, { onDelete: "restrict" }),
    name: text().notNull(),
    code: text().notNull().unique(),
    supervisorPositionId: uuid().references((): AnyPgColumn => positions.id, { onDelete: "restrict" }),
    deputyPositionId: uuid().references((): AnyPgColumn => positions.id, { onDelete: "restrict" }),
    collarType: collarType().notNull(),
    // Pozisyonda çalışılan vardiyalar (karar #291): "23:00-07:00" biçiminde, org.shift_types listesinden seçilir
    shifts: text().array().notNull().default(sql`'{}'::text[]`),
    status: positionStatus().notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("positions_org_unit_name_unique").on(t.orgUnitId, t.name),
    index("positions_org_unit_idx").on(t.orgUnitId),
    check("positions_shifts_check", sql`array_to_string(${t.shifts}, ',') ~ '^(([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9](,([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9])*)?$'`),
  ],
);
