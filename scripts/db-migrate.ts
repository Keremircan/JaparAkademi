/**
 * Veritabanı migration'larını uygular:
 *  1. Drizzle migration'ları (tablo sahibi kullanıcıyla)
 *  2. pg-boss kuyruk şeması (uygulama kullanıcısıyla, yalnızca pgboss şemasında)
 *
 * Kullanım: npm run db:migrate            (DATABASE_OWNER_URL / DATABASE_URL)
 *           npm run db:migrate -- --test  (TEST_DATABASE_OWNER_URL / TEST_DATABASE_URL)
 */
import { z } from "zod";
import { migrateDatabase } from "../src/server/db/migrate";
import { parseEnv, postgresUrl } from "../src/server/env";

const isTest = process.argv.includes("--test");
const cfg = parseEnv(
  z.object({
    DATABASE_URL: postgresUrl,
    DATABASE_OWNER_URL: postgresUrl,
    TEST_DATABASE_URL: postgresUrl.optional(),
    TEST_DATABASE_OWNER_URL: postgresUrl.optional(),
  }),
);

const ownerUrl = isTest ? cfg.TEST_DATABASE_OWNER_URL : cfg.DATABASE_OWNER_URL;
const appUrl = isTest ? cfg.TEST_DATABASE_URL : cfg.DATABASE_URL;

if (!ownerUrl || !appUrl) {
  console.error("✗ Test veritabanı adresleri tanımlı değil (TEST_DATABASE_URL, TEST_DATABASE_OWNER_URL)");
  process.exit(1);
}

migrateDatabase({ ownerUrl, appUrl, log: console.log })
  .then(() => console.log("✓ Migration'lar tamamlandı"))
  .catch((err) => {
    console.error("✗ Migration başarısız:", err);
    process.exit(1);
  });
