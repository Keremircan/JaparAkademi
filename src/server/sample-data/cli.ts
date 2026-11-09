import { closeDb } from "@/server/db/client";
import { stopJobSender } from "@/server/jobs/send";
import { deleteObjects, deletePrefix } from "@/server/storage/client";
import { loadSampleData, type LoadReport } from "./load";
import { purgeSampleData, type PurgeReport } from "./purge";

/**
 * Örnek veri komutları (karar #296). `scripts/sample-data/run.mjs` bu dosyayı esbuild ile paketleyip çalıştırır.
 *   load --owner <sicil> [--check] [--position <kod>]   örnek veriyi yükler (--check: yalnızca ön kontrol)
 *   purge --check | --yes                               örnek veriyi temizler (--check: yalnızca rapor)
 */

const USAGE = [
  "Kullanım:",
  "  node scripts/sample-data/run.mjs load --owner <sicil> [--check] [--position <kod>]",
  "  node scripts/sample-data/run.mjs purge --check | --yes",
].join("\n");

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function printLoad(r: LoadReport, check: boolean) {
  if (r.problems.length) {
    console.log("\nYÜKLENEMEZ:");
    for (const p of r.problems) console.log(`  ✗ ${p}`);
  } else if (check) {
    console.log("\nÖn kontrol geçti; yükleme yapılabilir (--check olmadan çalıştırın).");
  }
  if (r.notes.length) {
    console.log("\nNotlar:");
    for (const n of r.notes) console.log(`  • ${n}`);
  }
  const tables = Object.entries(r.created);
  if (tables.length) {
    console.log("\nTemizleme listesine yazılan kök kayıtlar:");
    for (const [t, n] of tables) console.log(`  ${t.padEnd(28)} ${n}`);
  }
}

function printPurge(r: PurgeReport) {
  console.log(r.dryRun ? "\nDENEME — hiçbir şey silinmedi.\n" : "\nTemizlendi.\n");
  console.log(`Kök kayıt: ${r.roots}`);
  const tables = Object.entries(r.deleted);
  if (tables.length === 0) console.log("Silinecek kayıt yok.");
  for (const [t, n] of tables) console.log(`  ${t.padEnd(36)} ${n}`);
  if (r.settingsReverted.length) {
    console.log("\nParametre listelerinden çıkarılan öğeler:");
    for (const s of r.settingsReverted) console.log(`  ${s.key}: ${JSON.stringify(s.item)}`);
  }
  console.log(`\nDepodan silinecek dosya klasörü: ${r.mediaPrefixes.length}, tek dosya: ${r.storageKeys.length}`);
  if (r.kept.length) {
    console.log("\nKORUNAN (gerçek kayıtlarla bağlantılı, silinmedi):");
    for (const k of r.kept) console.log(`  ${k.table} ${k.id}\n    → ${k.reason}`);
  }
}

async function load(args: string[]): Promise<number> {
  const owner = arg(args, "--owner");
  if (!owner) {
    console.error(USAGE);
    return 1;
  }
  const check = args.includes("--check");
  const started = Date.now();
  const report = await loadSampleData({
    ownerSicil: owner,
    positionCode: arg(args, "--position"),
    check,
    log: (line) => console.log(`[${Math.round((Date.now() - started) / 1000)} sn] ${line}`),
  });
  printLoad(report, check);
  return report.ok ? 0 : 1;
}

async function purge(args: string[]): Promise<number> {
  const dryRun = args.includes("--check");
  if (!dryRun && !args.includes("--yes")) {
    console.error(USAGE);
    return 1;
  }
  const ownerUrl = process.env.DATABASE_OWNER_URL;
  if (!ownerUrl) {
    console.error("DATABASE_OWNER_URL tanımlı değil (tablo sahibi bağlantısı gerekir).");
    return 1;
  }
  const report = await purgeSampleData({
    ownerUrl,
    dryRun,
    log: (line) => console.log(line),
    deleteObjects: async (keys, prefixes) => {
      if (keys.length) await deleteObjects(keys);
      for (const p of prefixes) await deletePrefix(p);
    },
  });
  printPurge(report);
  return 0;
}

async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "load") return load(args);
  if (command === "purge") return purge(args);
  console.error(USAGE);
  return 1;
}

main()
  .then((code) => (process.exitCode = code))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopJobSender().catch(() => {});
    await closeDb().catch(() => {});
    process.exit();
  });
