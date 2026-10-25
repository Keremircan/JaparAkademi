/**
 * PWA ikonlarını üretir (public/icons). Şimdilik geçici "JA" monogramıdır;
 * logonun vektörel hâli geldiğinde (SPEC Bölüm 18) bu betik güncellenip yeniden çalıştırılır.
 * Kullanım: npm run icons
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT = path.join(process.cwd(), "public", "icons");

function monogram(size: number, { maskable }: { maskable: boolean }) {
  // Maskable ikonda içerik ortadaki %80'lik güvenli alanda kalmalı
  const radius = maskable ? 0 : Math.round(size * 0.18);
  const fontSize = Math.round(size * (maskable ? 0.36 : 0.44));
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#111111"/>
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}"
        letter-spacing="${Math.round(size * 0.01)}" fill="#ffffff">JA</text>
</svg>`);
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const targets = [
    { file: "icon-192.png", size: 192, maskable: false },
    { file: "icon-512.png", size: 512, maskable: false },
    { file: "icon-maskable-512.png", size: 512, maskable: true },
    { file: "apple-touch-icon.png", size: 180, maskable: true },
  ];
  for (const t of targets) {
    await sharp(monogram(t.size, { maskable: t.maskable })).png().toFile(path.join(OUT, t.file));
    console.log(`✓ ${t.file}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
