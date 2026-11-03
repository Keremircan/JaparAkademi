import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgEnum, pgTable, primaryKey, smallint, text, unique, uuid } from "drizzle-orm/pg-core";
import type { ScheduleItem } from "@/lib/schedules";
import { users } from "./auth";
import { positions } from "./org";
import { createdAt, id, updatedAt } from "./_shared";

export const scheduleKind = pgEnum("schedule_kind", ["daily", "weekly"]);

/**
 * Pozisyonun çalışma programı (iş paketi 3.9, kararlar #251–254). Bir pozisyonda vardiya başına birden çok program
 * olabilir (ör. Gündüz, Gece). Yalnızca yol gösterir. Her kayıtta sürüm artar; kişisel kopyalar hangi sürüme göre
 * olduğunu tutar (güncellemede karar istenir).
 */
export const workSchedules = pgTable(
  "work_schedules",
  {
    id: id(),
    positionId: uuid()
      .notNull()
      .references(() => positions.id, { onDelete: "restrict" }),
    name: text().notNull(),
    kind: scheduleKind().notNull(),
    /** Programın geçerli olduğu günler (ISO 1–7); vardiyanın başladığı gün. Haftalıkta madde bulunan günler. */
    days: smallint().array().notNull(),
    /** Vardiya başlangıcı "SS:DD": maddeler bu saatten itibaren sıralanır (gece yarısını geçen vardiya, karar #254). */
    startTime: text().notNull().default("00:00"),
    items: jsonb().$type<ScheduleItem[]>().notNull(),
    version: integer().notNull().default(1),
    updatedBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Pozisyona göre arama bu benzersizlik indeksini kullanır (ilk sütun position_id)
    unique("work_schedules_position_name_unique").on(t.positionId, t.name),
    check("work_schedules_start_time_check", sql`${t.startTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    check("work_schedules_version_check", sql`${t.version} >= 1`),
  ],
);

/** Birden çok programı olan pozisyonda kişinin seçtiği vardiya programı (karar #252). Pozisyon değişince silinir. */
export const scheduleChoices = pgTable(
  "schedule_choices",
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: "restrict" }),
    scheduleId: uuid()
      .notNull()
      .references(() => workSchedules.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("schedule_choices_schedule_idx").on(t.scheduleId)],
);

/**
 * Kişinin programa yaptığı değişiklikler (kendi kopyası, karar #253); vardiya programı başına ayrı tutulur.
 * İK görebilir (karar #255). İçerik denetim kaydında maskelenir; anonimleştirmede silinir.
 */
export const personalSchedules = pgTable(
  "personal_schedules",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    scheduleId: uuid()
      .notNull()
      .references(() => workSchedules.id, { onDelete: "cascade" }),
    items: jsonb().$type<ScheduleItem[]>().notNull(),
    /** Kopyanın alındığı ya da kişinin en son "Kendi programımı koru" dediği program sürümü. */
    baseVersion: integer().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.scheduleId] }), index("personal_schedules_schedule_idx").on(t.scheduleId)],
);
