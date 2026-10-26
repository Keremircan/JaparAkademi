import { loadEnv } from "vite";
import { migrateDatabase } from "../../src/server/db/migrate";
import { resetDatabase } from "../../src/server/db/reset";

/** Entegrasyon testlerinden önce test veritabanını sıfırlar ve tüm migration'ları uygular (bir kez). */
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
}
