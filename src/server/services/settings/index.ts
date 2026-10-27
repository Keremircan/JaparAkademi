import { inArray } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { hasAnyRole } from "@/server/authz/policy";
import { db, type DbOrTx } from "@/server/db/client";
import { settings } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { logger } from "@/server/logger";
import { SETTINGS, type SettingKey, type SettingValue } from "./registry";

export { SETTINGS, type SettingKey, type SettingValue } from "./registry";

function parseStored<K extends SettingKey>(key: K, raw: unknown): SettingValue<K> {
  const def = SETTINGS[key];
  const parsed = def.schema.safeParse(raw);
  if (parsed.success) return parsed.data as SettingValue<K>;
  // Bozuk kayıt uygulamayı durdurmasın; varsayılana dönülür ve loglanır.
  logger.error({ key, issues: parsed.error.issues }, "Geçersiz parametre değeri, varsayılan kullanılıyor");
  return def.default as SettingValue<K>;
}

/** Tek parametre okur. Kayıt yoksa varsayılan döner. */
export async function getSetting<K extends SettingKey>(
  key: K,
  conn: DbOrTx = db(),
): Promise<SettingValue<K>> {
  const values = await getSettings([key], conn);
  return values[key];
}

/** Birden fazla parametreyi tek sorguda okur. */
export async function getSettings<const K extends SettingKey>(
  keys: readonly K[],
  conn: DbOrTx = db(),
): Promise<{ [P in K]: SettingValue<P> }> {
  const rows = await conn
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, keys as unknown as string[]));
  const stored = new Map(rows.map((r) => [r.key, r.value]));

  const result = {} as { [P in K]: SettingValue<P> };
  for (const key of keys) {
    result[key] = (
      stored.has(key) ? parseStored(key, stored.get(key)) : SETTINGS[key].default
    ) as SettingValue<typeof key>;
  }
  return result;
}

/** Parametre yazar. Yalnızca o parametreyi yönetme yetkisi olan roller değiştirebilir. */
export async function setSetting<K extends SettingKey>(
  actor: Actor,
  key: K,
  value: SettingValue<K>,
): Promise<void> {
  const def = SETTINGS[key];
  // Yetki parametrenin kendi rol listesidir (managedBy): ör. İSG parametreleri İSG uzmanı, imza yetkilileri İK
  if (actor.kind === "user" && !hasAnyRole(actor, def.managedBy)) throw new ForbiddenError("settings.manage");

  const parsed = def.schema.safeParse(value);
  if (!parsed.success) throw new ValidationError("invalid_setting", parsed.error.issues);

  await withActor(actor, async (tx) => {
    await tx
      .insert(settings)
      .values({
        key,
        value: parsed.data as object,
        updatedBy: actor.kind === "user" ? actor.userId : null,
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: parsed.data as object,
          updatedBy: actor.kind === "user" ? actor.userId : null,
          updatedAt: new Date(),
        },
      });
  });
}
