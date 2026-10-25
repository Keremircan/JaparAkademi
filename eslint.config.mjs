import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Değişmez kural: veriye yalnızca src/server/services üzerinden erişilir.
    // Arayüz katmanı (app, features, components) veritabanı modüllerini doğrudan içe aktaramaz.
    files: ["src/app/**/*.{ts,tsx}", "src/features/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/db", "@/server/db/*", "drizzle-orm", "drizzle-orm/*", "postgres"],
              message: "Veritabanına yalnızca src/server/services üzerinden erişin (CLAUDE.md: Yetki tek yerde).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/db/schema/**/*.ts"],
    rules: {
      // Şema dosyaları rol listesini paylaşır; başka sunucu modülü içe aktarılmamalı
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/server/services/*", "@/server/auth/*"], message: "Şema dosyaları servis/auth modüllerine bağımlı olmamalı." }] },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    ".tmp/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
