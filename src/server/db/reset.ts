import postgres from "postgres";

/**
 * Veritabanını boşaltır (public, drizzle ve pgboss şemaları). YALNIZCA yerel geliştirme ve testler içindir.
 * Production'da çalışmaması için veritabanı adı ve sunucu kontrol edilir.
 */
export async function resetDatabase(ownerUrl: string) {
  const url = new URL(ownerUrl);
  const dbName = url.pathname.replace(/^\//, "");
  const isLocalHost = ["localhost", "127.0.0.1", "::1", "postgres"].includes(url.hostname);
  if (!isLocalHost || process.env.NODE_ENV === "production") {
    throw new Error(`Veritabanı sıfırlama yalnızca yerel ortamda yapılabilir (${url.hostname}/${dbName})`);
  }

  const sql = postgres(ownerUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(`
      DROP SCHEMA IF EXISTS drizzle CASCADE;
      SET ROLE akademi_app;
      DROP SCHEMA IF EXISTS pgboss CASCADE;
      RESET ROLE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      REVOKE ALL ON SCHEMA public FROM PUBLIC;
    `);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
