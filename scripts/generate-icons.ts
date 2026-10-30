/**
 * Sekme ve uygulama ikonlarını JAPAR Academy logosundan üretir (public/brand/japar-academy-logo.jpg).
 *  - public/icons/icon-192.png, icon-512.png       : PWA ikonu (manifest, "any")
 *  - public/icons/icon-maskable-512.png             : Android uyarlanabilir ikon (logo güvenli alanda)
 *  - public/icons/apple-touch-icon.png             : iPhone ana ekran ikonu (180×180; kök düzende bağlı)
 *  - src/app/favicon.ico                            : tarayıcı sekmesi (16, 32, 48 px). Küçük boyda ince çizgiler
 *    kaybolduğu için "ACADEMY" satırı çıkarılır ve harfler kalınlaştırılır.
 * Logo değişirse dosyayı değiştirip yeniden çalıştırın. Kullanım: npm run icons
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, "public", "brand", "japar-academy-logo.jpg");
const ICONS = path.join(ROOT, "public", "icons");
const APP = path.join(ROOT, "src", "app");
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

/** Beyaz kenar boşlukları kırpılmış logo. */
async function trimmedLogo(): Promise<Buffer> {
  return sharp(SOURCE).flatten({ background: WHITE }).trim({ background: "#ffffff", threshold: 30 }).png().toBuffer();
}

/** Beyaz kare üzerinde ortalanmış logo; logo genişliği karenin `widthRatio` kadarı. */
async function squareIcon(logo: Buffer, size: number, widthRatio: number): Promise<Buffer> {
  const width = Math.round(size * widthRatio);
  const resized = await sharp(logo).resize({ width, kernel: "lanczos3" }).png().toBuffer();
  const { height = 0 } = await sharp(resized).metadata();
  return sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .composite([{ input: resized, left: Math.round((size - width) / 2), top: Math.round((size - height) / 2) }])
    .png()
    .toBuffer();
}

/** Sekme ikonu: yalnızca "JAPAR" (ACADEMY satırı kırpılır), çizgiler kalınlaştırılır (büyük boyda bulanıklaştır + eşik). */
async function faviconImage(logo: Buffer, size: number, bold: number): Promise<Buffer> {
  const { width = 0, height = 0 } = await sharp(logo).metadata();
  // ACADEMY satırı logonun alt ~%12'sinde
  const word = await sharp(logo).extract({ left: 0, top: 0, width, height: Math.round(height * 0.875) }).png().toBuffer();
  const w = Math.round(size * 0.98);
  const thick = await sharp(word).resize({ width: w * 8 }).blur(bold).threshold(235).png().toBuffer();
  return squareIcon(thick, size, 0.98);
}

/** PNG görüntülerden ICO dosyası (PNG gömülü ICO; bütün güncel tarayıcılar destekler). */
function ico(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries: Buffer[] = [];
  let offset = 6 + images.length * 16;
  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

async function write(file: string, data: Buffer) {
  await fs.writeFile(file, data);
  console.log(`✓ ${path.relative(ROOT, file)}`);
}

async function main() {
  await fs.mkdir(ICONS, { recursive: true });
  const logo = await trimmedLogo();

  await write(path.join(ICONS, "icon-192.png"), await squareIcon(logo, 192, 0.86));
  await write(path.join(ICONS, "icon-512.png"), await squareIcon(logo, 512, 0.86));
  // Uyarlanabilir ikonda içerik ortadaki daireye (çap %80) sığmalı
  await write(path.join(ICONS, "icon-maskable-512.png"), await squareIcon(logo, 512, 0.7));
  await write(path.join(ICONS, "apple-touch-icon.png"), await squareIcon(logo, 180, 0.8));

  const favicon = await Promise.all(
    [
      { size: 16, bold: 6 },
      { size: 32, bold: 5 },
      { size: 48, bold: 4 },
    ].map(async ({ size, bold }) => ({ size, png: await faviconImage(logo, size, bold) })),
  );
  await write(path.join(APP, "favicon.ico"), ico(favicon));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
