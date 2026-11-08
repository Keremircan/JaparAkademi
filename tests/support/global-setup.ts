import { loadEnv } from "vite";
import { migrateDatabase } from "../../src/server/db/migrate";
import { resetDatabase } from "../../src/server/db/reset";
import { emptyTestBucket } from "../../src/server/storage/empty-test-bucket";
import { TEST_BUCKET_SUFFIX, testBucket } from "../../src/server/test-targets";

/**
 * Entegrasyon testlerinden önce test veritabanını sıfırlar, tüm migration'ları uygular ve test dosya deposunu
 * boşaltır (bir kez). Testler geliştirme veritabanına ve deposuna yazmaz (`src/server/test-targets.ts`).
 */
export default async function setup() {
  const env = { ...loadEnv("test", process.cwd(), ""), ...process.env };
  const ownerUrl = env.TEST_DATABASE_OWNER_URL;
  const appUrl = env.TEST_DATABASE_URL;
  if (!ownerUrl || !appUrl) {
    throw new Error("TEST_DATABASE_URL ve TEST_DATABASE_OWNER_URL tanımlı olmalı (.env.example)");
  }
  if (!new URL(ownerUrl).pathname.endsWith("_test")) {
    throw new Error("Entegrasyon testleri yalnızca adı _test ile biten veritabanında çalışır");
  }
  await resetDatabase(ownerUrl);
  await migrateDatabase({ ownerUrl, appUrl });
  await emptyTestBucket(env, testBucket(env), TEST_BUCKET_SUFFIX);
}
