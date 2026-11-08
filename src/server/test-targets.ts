/**
 * Testlerin ayrı veritabanı ve dosya deposu. Testler geliştirme verisine hiç yazmaz; kendi hedeflerini her
 * çalıştırmada boşaltır:
 * - Entegrasyon testleri: `TEST_DATABASE_URL` (adı `_test` ile biter) + `<bucket>-test` deposu.
 * - Uçtan uca testler: `<veritabanı>_e2e` + `<bucket>-e2e` deposu, kendi sunucusu (varsayılan 3100 portu).
 * `.env`'de verilmeyen değerler geliştirme ayarlarından türetilir. Saf fonksiyonlardır: Playwright ve Vitest
 * ayarlarından, betiklerden içe aktarılır (ortam doğrulaması yapmaz, sunucu modülü yüklemez).
 */

type Env = Record<string, string | undefined>;

export const TEST_DATABASE_SUFFIX = "_test";
export const E2E_DATABASE_SUFFIX = "_e2e";
export const TEST_BUCKET_SUFFIX = "-test";
export const E2E_BUCKET_SUFFIX = "-e2e";
export const DEFAULT_E2E_PORT = 3100;

function required(env: Env, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`${key} tanımlı olmalı (.env.example)`);
  return value;
}

/** Bağlantı adresindeki veritabanı adı. */
export function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

/** Veritabanı adına sonek ekler; ad zaten bu sonekle bitiyorsa adres aynen döner (tekrar uygulanabilir). */
export function withDatabaseSuffix(url: string, suffix: string): string {
  const u = new URL(url);
  const name = databaseName(url);
  if (name.endsWith(suffix)) return url;
  u.pathname = `/${name}${suffix}`;
  return u.toString();
}

function withBucketSuffix(bucket: string, suffix: string): string {
  return bucket.endsWith(suffix) ? bucket : `${bucket}${suffix}`;
}

/** Entegrasyon testlerinin dosya deposu. */
export function testBucket(env: Env): string {
  return env.TEST_S3_BUCKET || withBucketSuffix(required(env, "S3_BUCKET_PRIVATE"), TEST_BUCKET_SUFFIX);
}

export type E2eTarget = { port: number; appUrl: string; databaseUrl: string; databaseOwnerUrl: string; bucket: string };

/** Uçtan uca testlerin sunucusu, veritabanı ve deposu. */
export function e2eTarget(env: Env): E2eTarget {
  const port = Number(env.E2E_PORT || DEFAULT_E2E_PORT);
  return {
    port,
    appUrl: `http://localhost:${port}`,
    databaseUrl: env.E2E_DATABASE_URL || withDatabaseSuffix(required(env, "DATABASE_URL"), E2E_DATABASE_SUFFIX),
    databaseOwnerUrl: env.E2E_DATABASE_OWNER_URL || withDatabaseSuffix(required(env, "DATABASE_OWNER_URL"), E2E_DATABASE_SUFFIX),
    bucket: env.E2E_S3_BUCKET || withBucketSuffix(required(env, "S3_BUCKET_PRIVATE"), E2E_BUCKET_SUFFIX),
  };
}

/** E2E sunucusunun ve testlerinin ortamı: e2e veritabanı ve deposu; e-posta ve bildirim yalnızca kayda yazılır. */
export function e2eEnv(t: E2eTarget): Record<string, string> {
  return {
    APP_URL: t.appUrl,
    DATABASE_URL: t.databaseUrl,
    DATABASE_OWNER_URL: t.databaseOwnerUrl,
    S3_BUCKET_PRIVATE: t.bucket,
    MAIL_TRANSPORT: "log",
    PUSH_TRANSPORT: "log",
  };
}

/** Boşaltılacak hedefin adı test sonekiyle bitmiyorsa durur: geliştirme verisi yanlışlıkla silinmesin. */
export function assertTestTarget(kind: "database" | "bucket", name: string, suffix: string): void {
  if (!name.endsWith(suffix)) {
    throw new Error(`Test ${kind === "database" ? "veritabanının" : "deposunun"} adı "${suffix}" ile bitmeli (${name}); boşaltılmadı`);
  }
}
