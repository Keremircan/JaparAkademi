/**
 * YEREL veritabanını sıfırlar ve migration'ları yeniden uygular.
 * Kullanım: npm run db:reset            (geliştirme veritabanı)
 *           npm run db:reset -- --test  (test veritabanı)
 */
import { z } from "zod";
import { migrateDatabase } from "../src/server/db/migrate";
import { resetDatabase } from "../src/server/db/reset";
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

async function main() {
  if (!ownerUrl || !appUrl) throw new Error("Veritabanı adresleri tanımlı değil");
  await resetDatabase(ownerUrl);
  console.log("✓ Veritabanı boşaltıldı");
  await migrateDatabase({ ownerUrl, appUrl, log: console.log });
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
