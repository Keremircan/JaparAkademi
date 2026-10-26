import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins/username";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db/client";
import { accounts, sessions, users, verifications } from "@/server/db/schema";
import { env } from "@/server/env";
import { AUTH_COOKIE_PREFIX } from "./constants";

/**
 * Better Auth yapılandırması.
 * - Giriş: sicil no (username eklentisi) + şifre. Açık kayıt kapalı.
 * - HTTP rotası (/api/auth) AÇILMAZ: giriş, çıkış ve şifre değiştirme sunucu tarafında
 *   src/server/services/auth.ts üzerinden yapılır (kilit ve IP sınırı orada uygulanır).
 * - Telemetri kapalı (veri yurt dışına gönderilmez).
 */
export const SICIL_PATTERN = /^[0-9A-Za-z-]{1,32}$/;

/** Hesap e-postası olarak kullanılan, gerçek olmayan adres. Gerçek e-posta personnel tablosundadır. */
export function syntheticEmail(sicilNo: string): string {
  return `${sicilNo.toLowerCase()}@personel.invalid`;
}


function createAuth() {
  const e = env();
  return betterAuth({
    appName: "JAPAR Akademi",
    baseURL: e.APP_URL,
    secret: e.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db(), {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      // Mutlak üst sınır. Asıl süre kayan işlemsizlik süresidir (session.personal_days /
      // session.shared_idle_min) ve services/auth.ts'te last_seen_at ile uygulanır.
      // Better Auth'un kendi yenilemesi kapalı: RSC içinde çerez yazılamadığı için çerez/DB tutarsızlığı yaratır.
      expiresIn: 60 * 60 * 24 * 365,
      disableSessionRefresh: true,
    },
    rateLimit: { enabled: false },
    advanced: {
      cookiePrefix: AUTH_COOKIE_PREFIX,
      useSecureCookies: e.APP_URL.startsWith("https://"),
      database: { generateId: () => uuidv7() },
    },
    telemetry: { enabled: false },
    // Başarısız girişler login_attempts tablosuna yazılır; Better Auth'un kendi uyarılarına gerek yok
    logger: { level: "error" },
    plugins: [
      username({
        minUsernameLength: 1,
        maxUsernameLength: 32,
        usernameValidator: (value) => SICIL_PATTERN.test(value),
        usernameNormalization: (value) => value.trim(),
        displayUsername: false,
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __akademiAuth?: Auth };

/** Better Auth örneği ilk kullanımda oluşturulur (build sırasında ortam değişkeni gerekmez). */
export function getAuth(): Auth {
  globalForAuth.__akademiAuth ??= createAuth();
  return globalForAuth.__akademiAuth;
}

/** Testler için: veritabanı bağlantısı değiştiğinde örneği sıfırlar. */
export function resetAuth() {
  globalForAuth.__akademiAuth = undefined;
}
