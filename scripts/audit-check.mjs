// Bağımlılık güvenlik taraması (SPEC 13.1, karar #105): üretim bağımlılıklarında yüksek/kritik açık varsa CI düşer.
// Düzeltmesi olmayan ve incelenmiş açıklar audit-allowlist.json'da gerekçesiyle tutulur; listede olmayan her yüksek/kritik açık hatadır.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const allow = JSON.parse(readFileSync(path.join(root, "audit-allowlist.json"), "utf8"));
const allowed = new Set(allow.map((a) => a.advisory));

let out;
try {
  out = execSync("npm audit --omit=dev --json", { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
} catch (err) {
  // npm audit açık bulunca sıfır dışı kodla çıkar; çıktı yine JSON'dur
  out = err.stdout;
}
const report = JSON.parse(out);
const problems = [];
for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
  if (v.severity !== "high" && v.severity !== "critical") continue;
  const advisories = v.via.filter((x) => typeof x === "object");
  // Yalnızca başka pakete bağlı olan (kendi ilanı olmayan) kayıtlar, kök ilan üzerinden değerlendirilir
  for (const a of advisories) {
    const id = a.url?.split("/").pop();
    if (!allowed.has(id)) problems.push(`${v.severity.toUpperCase()} ${name}: ${a.title} (${a.url})`);
  }
}
if (problems.length) {
  console.error("Yüksek/kritik güvenlik açığı (audit-allowlist.json'da değil):\n" + [...new Set(problems)].join("\n"));
  process.exit(1);
}
console.log(`✓ Yüksek/kritik açık yok (${allow.length} incelenmiş istisna)`);
