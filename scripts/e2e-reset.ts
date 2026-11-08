/**
 * Uçtan uca testlerin veritabanını ve dosya deposunu sıfırlar. Playwright her çalıştırmada, test sunucusunu
 * açmadan önce bunu çalıştırır (playwright.config.ts → webServer). Geliştirme verisine dokunmaz: yalnızca adı
 * `_e2e` ile biten veritabanını ve `-e2e` ile biten depoyu boşaltır (`src/server/test-targets.ts`).
 *
 * Kullanım: npm run e2e:reset
 */
import { migrateDatabase } from "../src/server/db/migrate";
import { resetDatabase } from "../src/server/db/reset";
import { emptyTestBucket } from "../src/server/storage/empty-test-bucket";
import { assertTestTarget, databaseName, E2E_BUCKET_SUFFIX, E2E_DATABASE_SUFFIX, e2eTarget } from "../src/server/test-targets";

const E2E_DATABASE_SETUP =
  "docker compose -f docker/compose.yml exec -T postgres psql -U postgres -f /docker-entrypoint-initdb.d/02-e2e-database.sql";

async function main() {
  const t = e2eTarget(process.env);
  assertTestTarget("database", databaseName(t.databaseOwnerUrl), E2E_DATABASE_SUFFIX);
  assertTestTarget("database", databaseName(t.databaseUrl), E2E_DATABASE_SUFFIX);

  try {
    await resetDatabase(t.databaseOwnerUrl);
  } catch (err) {
    // 3D000: veritabanı yok (bu kurulumdan önce oluşturulmuş Docker volume'u)
    if ((err as { code?: string }).code === "3D000") {
      throw new Error(`${databaseName(t.databaseOwnerUrl)} veritabanı yok. Bir kez oluşturun:\n  ${E2E_DATABASE_SETUP}`);
    }
    throw err;
  }
  await migrateDatabase({ ownerUrl: t.databaseOwnerUrl, appUrl: t.databaseUrl });
  const files = await emptyTestBucket(process.env, t.bucket, E2E_BUCKET_SUFFIX);
  console.log(`✓ E2E veritabanı (${databaseName(t.databaseUrl)}) ve deposu (${t.bucket}) sıfırlandı; ${files} dosya silindi`);
}

main().catch((err) => {
  console.error("✗ E2E sıfırlama başarısız:", err instanceof Error ? err.message : err);
  process.exit(1);
});
