// Örnek veri komutları (karar #296): src/server/sample-data/cli.ts'i dist/sample-data.mjs'e paketler ve çalıştırır.
// Neden paket: tsx CommonJS kipinde @react-pdf'i yükleyemez (bkz. scripts/build-worker.mjs).
//   node --env-file-if-exists=.env scripts/sample-data/run.mjs load --owner <sicil> [--check]
//   node --env-file-if-exists=.env scripts/sample-data/run.mjs purge --check | --yes
// Sunucuda: docs/runbooks/sample-data.md
import { spawn } from "node:child_process";
import path from "node:path";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "../..");
const outfile = path.join(root, "dist/sample-data.mjs");

await build({
  entryPoints: [path.join(root, "src/server/sample-data/cli.ts")],
  outfile,
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  packages: "external",
  tsconfig: path.join(root, "tsconfig.json"),
  // "server-only" Next dışında hata fırlatır; komut sunucu tarafıdır (sunucu imajında tests/ klasörü yok)
  plugins: [
    {
      name: "server-only",
      setup(b) {
        b.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" }));
        b.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "export {};", loader: "js" }));
      },
    },
  ],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  sourcemap: true,
  logLevel: "warning",
});

const child = spawn(process.execPath, ["--enable-source-maps", outfile, ...process.argv.slice(2)], { stdio: "inherit", cwd: root });
child.on("exit", (code) => process.exit(code ?? 1));
