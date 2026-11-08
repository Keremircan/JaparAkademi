import { defineConfig, devices } from "@playwright/test";
import { config as loadDotenv } from "dotenv";
import { e2eEnv, e2eTarget } from "./src/server/test-targets";

loadDotenv({ quiet: true });

// Testler ve test sunucusu ayrı veritabanını ve dosya deposunu kullanır; geliştirme verisine dokunulmaz
const target = e2eTarget(process.env);
const serverEnv = e2eEnv(target);
Object.assign(process.env, serverEnv);

const PORT = target.port;
const baseURL = target.appUrl;
const isCI = !!process.env.CI;

/**
 * Uçtan uca testler (SPEC 13.2): mobil (Pixel 7) ve masaüstü.
 * Her çalıştırmada kendi sunucusu açılır (varsayılan 3100 portu; geliştirme sunucusu kullanılmaz): önce e2e
 * veritabanı ve deposu sıfırlanır (`npm run e2e:reset`), sonra üretim derlemesi başlatılır. CI'da derleme önceki
 * adımda yapılır. Derleme bittikten sonra kaynak dosya düzenlemek testleri etkilemez.
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
    command: `npm run e2e:reset && ${isCI ? "" : "npm run build && "}npm run start -- --port ${PORT}`,
    url: `${baseURL}/api/health`,
    // Sunucu her seferinde sıfırlanmış veritabanıyla yeniden açılır (port doluysa hata verir)
    reuseExistingServer: false,
    timeout: 300_000,
    // Yerelde derleme ayrı klasöre yazılır; geliştirme sunucusunun `.next` önbelleği bozulmaz (CI önceki adımın `.next`'ini kullanır)
    env: isCI ? serverEnv : { ...serverEnv, NEXT_DIST_DIR: ".next-e2e" },
  },
});
