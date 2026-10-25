import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// .env değerleri testlere aktarılır; entegrasyon testleri test veritabanını kullanır.
const fileEnv = loadEnv("test", process.cwd(), "");
const merged = { ...fileEnv, ...process.env };

const alias = {
  "@": path.resolve(import.meta.dirname, "src"),
  // "server-only" Next dışında hata fırlatır; testlerde boş modülle değiştirilir
  "server-only": path.resolve(import.meta.dirname, "tests/support/empty.ts"),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/support/global-setup.ts"],
          setupFiles: ["tests/support/integration-setup.ts"],
          // Testler aynı veritabanını paylaşır
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
          env: {
            ...merged,
            NODE_ENV: "test",
            LOG_LEVEL: "silent",
            DATABASE_URL: merged.TEST_DATABASE_URL ?? "",
            DATABASE_OWNER_URL: merged.TEST_DATABASE_OWNER_URL ?? "",
          },
        },
      },
    ],
  },
});
