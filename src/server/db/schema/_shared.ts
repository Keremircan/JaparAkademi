import { timestamp, uuid } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

/** Birincil anahtar: uygulama tarafında üretilen UUID v7 (zamana göre sıralı). */
export const id = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const tstz = (name: string) => timestamp(name, { withTimezone: true });
