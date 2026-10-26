import postgres from "postgres";

/**
 * Testler için tablo sahibi bağlantısı: verileri temizlemek ve zaman alanlarını elle ayarlamak için.
 * TRUNCATE satır trigger'larını çalıştırmaz; değiştirilemez tablolar da böylece temizlenebilir.
 */
let ownerSql: postgres.Sql | undefined;

export function owner(): postgres.Sql {
  ownerSql ??= postgres(process.env.DATABASE_OWNER_URL ?? "", { max: 1, onnotice: () => {} });
  return ownerSql;
}

export async function closeOwner() {
  await ownerSql?.end({ timeout: 5 });
  ownerSql = undefined;
}

/** Migration'ın yazdığı sabit referans verisi; testler arasında korunur. */
const REFERENCE_TABLES = new Set(["tag_types"]);

/** public şemasındaki tüm tabloları boşaltır (migration kayıtları, referans tabloları ve pgboss hariç). */
export async function truncateAll() {
  const sql = owner();
  const rows = await sql<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'public'
  `;
  const tables = rows.filter((r) => !REFERENCE_TABLES.has(r.tablename));
  if (tables.length === 0) return;
  const list = tables.map((r) => `"public"."${r.tablename}"`).join(", ");
  await sql.unsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
