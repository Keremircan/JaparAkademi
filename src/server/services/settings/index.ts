import { eq, inArray, sql } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { hasAnyRole } from "@/server/authz/policy";
import { db, type DbOrTx } from "@/server/db/client";
import { settings, users } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { logger } from "@/server/logger";
import { SETTINGS_CATALOG, SETTING_GROUPS, type SettingGroup, type SettingInput } from "./catalog";
import { isSettingKey, SETTINGS, type SettingKey, type SettingValue } from "./registry";

export { SETTINGS, type SettingKey, type SettingValue } from "./registry";
export { SETTING_GROUPS, type SettingGroup, type SettingInput } from "./catalog";

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
  changeNote: string | null = null,
): Promise<void> {
  const def = SETTINGS[key];
  // Yetki parametrenin kendi rol listesidir (managedBy): ör. İSG parametreleri İSG uzmanı, imza yetkilileri İK
  if (actor.kind === "user" && !hasAnyRole(actor, def.managedBy)) throw new ForbiddenError("settings.manage");

  const parsed = def.schema.safeParse(value);
  if (!parsed.success) throw new ValidationError("invalid_setting", parsed.error.issues);

  // jsonb sütunu boş olamaz: null değer (ör. ayarlanmamış tehlike sınıfı) JSON null olarak yazılır
  const stored = parsed.data === null ? sql`'null'::jsonb` : (parsed.data as object);
  await withActor(actor, async (tx) => {
    await tx
      .insert(settings)
      .values({
        key,
        value: stored,
        updatedBy: actor.kind === "user" ? actor.userId : null,
        changeNote,
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: stored,
          updatedBy: actor.kind === "user" ? actor.userId : null,
          changeNote,
          updatedAt: new Date(),
        },
      });
  });
}

// ---- Parametreler ekranı (iş paketi 2.1) ----

export type SettingRow = {
  key: SettingKey;
  group: SettingGroup;
  input: SettingInput;
  value: unknown;
  defaultValue: unknown;
  isDefault: boolean;
  requireNote: boolean;
  updatedAt: Date | null;
  updatedByName: string | null;
  changeNote: string | null;
};

function managesSetting(actor: Actor, key: SettingKey): boolean {
  return hasAnyRole(actor, SETTINGS[key].managedBy);
}

/** Kişinin yönettiği parametreler, gruplara göre sıralı (karar #117). Kimse başkasının parametresini görmez. */
export async function listSettingsFor(actor: Actor): Promise<SettingRow[]> {
  const keys = (Object.keys(SETTINGS_CATALOG) as SettingKey[]).filter((k) => managesSetting(actor, k));
  if (keys.length === 0) throw new ForbiddenError("settings.manage");
  const rows = await db()
    .select({ key: settings.key, value: settings.value, updatedAt: settings.updatedAt, changeNote: settings.changeNote, updatedByName: users.name })
    .from(settings)
    .leftJoin(users, eq(users.id, settings.updatedBy))
    .where(inArray(settings.key, keys));
  const stored = new Map(rows.map((r) => [r.key, r]));
  const order = (k: SettingKey) => SETTING_GROUPS.indexOf(SETTINGS_CATALOG[k]!.group);
  return keys
    .map((key, i) => ({ key, i }))
    .sort((a, b) => order(a.key) - order(b.key) || a.i - b.i)
    .map(({ key }) => {
      const entry = SETTINGS_CATALOG[key]!;
      const row = stored.get(key);
      const value = row ? parseStored(key, row.value) : SETTINGS[key].default;
      return {
        key,
        group: entry.group,
        input: entry.input,
        value,
        defaultValue: SETTINGS[key].default,
        isDefault: JSON.stringify(value) === JSON.stringify(SETTINGS[key].default),
        requireNote: entry.requireNote ?? false,
        updatedAt: row?.updatedAt ?? null,
        updatedByName: row?.updatedByName ?? null,
        changeNote: row?.changeNote ?? null,
      };
    });
}

/**
 * Ekrandan parametre değiştirme. Yalnızca katalogdaki ve salt okunur olmayan parametreler;
 * `reset` varsayılan değere döndürür. Saklama sürelerinde gerekçe zorunludur (karar #118).
 */
export async function updateSettingFromScreen(
  actor: Actor,
  input: { key: string; value?: unknown; reset?: boolean; note?: string | null },
): Promise<void> {
  if (!isSettingKey(input.key)) throw new NotFoundError("setting");
  const key = input.key;
  const entry = SETTINGS_CATALOG[key];
  if (!entry) throw new NotFoundError("setting");
  if (!managesSetting(actor, key)) throw new ForbiddenError("settings.manage");
  if (entry.input.kind === "readonly") throw new ValidationError("setting_readonly");
  const note = input.note?.trim() || null;
  if (entry.requireNote && (!note || note.length < 10)) throw new ValidationError("setting_note_required");
  const value = input.reset ? SETTINGS[key].default : input.value;
  await setSetting(actor, key, value as SettingValue<typeof key>, note);
}
