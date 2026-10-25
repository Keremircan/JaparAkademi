import { defineConfig, devices } from "@playwright/test";
import { config as loadDotenv } from "dotenv";

loadDotenv({ quiet: true });

const PORT = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${PORT}`;
const isCI = !!process.env.CI;

/**
 * Uçtan uca testler (SPEC 13.2): mobil (Pixel 7) ve masaüstü.
 * Yerelde çalışan geliştirme sunucusu yeniden kullanılır; CI'da production build başlatılır.
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: isCI ? `npm run start -- --port ${PORT}` : "npm run dev",
    url: `${baseURL}/api/health`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
