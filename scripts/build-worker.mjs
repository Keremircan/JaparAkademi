// Worker'ı tek ESM dosyasına derler (dist/worker.mjs). npm paketleri dışarıda kalır ve Node tarafından ESM olarak yüklenir.
// Neden: tsx CommonJS kipinde @react-pdf alt modüllerini çözemiyor (ERR_PACKAGE_PATH_NOT_EXPORTED); Next ve Vitest ESM kullanır.
//   node scripts/build-worker.mjs            → derle
//   node scripts/build-worker.mjs --watch    → derle, değişiklikte yeniden derle ve worker'ı yeniden başlat (geliştirme)
import { spawn } from "node:child_process";
import path from "node:path";
import { context, build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const outfile = path.join(root, "dist/worker.mjs");

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: [path.join(root, "src/worker/index.ts")],
  outfile,
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  packages: "external",
  tsconfig: path.join(root, "tsconfig.json"),
  // "server-only" Next dışında hata fırlatır; worker sunucu tarafıdır
  alias: { "server-only": path.join(root, "tests/support/empty.ts") },
  // Paketlenmiş ESM içinde CommonJS kalıntıları için require
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  sourcemap: true,
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  let child;
  const restart = () => {
    child?.kill();
    child = spawn(process.execPath, ["--enable-source-maps", "--env-file-if-exists=.env", outfile], { stdio: "inherit", cwd: root });
  };
  const ctx = await context({
    ...options,
    plugins: [{ name: "restart", setup: (b) => b.onEnd((r) => r.errors.length === 0 && restart()) }],
  });
  await ctx.watch();
} else {
  await build(options);
}
