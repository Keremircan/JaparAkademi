import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { checkStorage } from "@/server/storage/client";

/** Sistem sağlığı: veritabanı ve depolama erişilebilir mi. Kişisel veri içermez. */
export async function checkHealth(): Promise<{ ok: boolean; database: boolean; storage: boolean }> {
  const [database, storage] = await Promise.all([
    db()
      .execute(sql`select 1`)
      .then(() => true)
      .catch(() => false),
    checkStorage(),
  ]);
  return { ok: database && storage, database, storage };
}
