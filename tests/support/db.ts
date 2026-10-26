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

/** public şemasındaki tüm tabloları boşaltır (migration kayıtları ve pgboss hariç). */
export async function truncateAll() {
  const sql = owner();
  const rows = await sql<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'public'
  `;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await sql.unsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
