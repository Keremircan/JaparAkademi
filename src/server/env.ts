import { z } from "zod";

/**
 * Sunucu ortam değişkenleri. İlk erişimde doğrulanır; eksik veya hatalı değer varsa
 * uygulama açıklayıcı bir hatayla durur. Build sırasında okunmaz.
 */
const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\//, "postgres:// ile başlamalı");

const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_URL: z.url(),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  DATABASE_URL: postgresUrl,
  BETTER_AUTH_SECRET: z.string().min(32, "en az 32 karakter olmalı"),
  S3_ENDPOINT: z.url(),
  /** Tarayıcının eriştiği depolama adresi (ters vekil arkasında); boşsa S3_ENDPOINT. */
  S3_PUBLIC_ENDPOINT: z.preprocess((v) => (v === "" ? undefined : v), z.url().optional()),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET_PRIVATE: z.string().min(3),
  NATIONAL_ID_ENC_KEYS: z
    .string()
    .regex(/^\d+:[A-Za-z0-9+/=]+(,\d+:[A-Za-z0-9+/=]+)*$/, '"<sürüm>:<base64>" biçiminde olmalı'),
  NATIONAL_ID_HMAC_KEY: z.string().min(32),
  /** E-posta: geliştirme/testte "log" (gönderilmez, loga yazılır); canlı ortamda "graph" (karar #87; worker uyarır). */
  MAIL_TRANSPORT: z.enum(["log", "graph"]).default("log"),
  GRAPH_TENANT_ID: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  GRAPH_CLIENT_ID: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  GRAPH_CLIENT_SECRET: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  /** Gönderen posta kutusu (M365 kiracısında Mail.Send izni verilmiş adres). */
  MAIL_FROM: z.preprocess((v) => (v === "" ? undefined : v), z.email().optional()),
}).refine(
  (e) => e.MAIL_TRANSPORT !== "graph" || (!!e.GRAPH_TENANT_ID && !!e.GRAPH_CLIENT_ID && !!e.GRAPH_CLIENT_SECRET && !!e.MAIL_FROM),
  { message: "MAIL_TRANSPORT=graph için GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET ve MAIL_FROM zorunlu", path: ["MAIL_TRANSPORT"] },
);

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function parseEnv<T extends z.ZodType>(
  schema: T,
  source: NodeJS.ProcessEnv = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Geçersiz ortam değişkenleri (.env dosyasını .env.example ile karşılaştır):\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

export function env(): ServerEnv {
  cached ??= parseEnv(serverEnvSchema);
  return cached;
}

export { postgresUrl };
