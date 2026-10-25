import { defineConfig } from "drizzle-kit";

// Migration'lar tablo sahibi kullanıcıyla (akademi_owner) üretilir ve çalıştırılır.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_OWNER_URL ?? "",
  },
  strict: true,
  verbose: true,
});
