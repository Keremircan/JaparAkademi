import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { env } from "@/server/env";

/**
 * TC kimlik no (KVKK, SPEC 13.3 ve karar #19):
 * - Şifreleme: AES-256-GCM, saklama biçimi "v<sürüm>:<base64(iv|tag|şifreli)>"
 * - Eşleştirme: HMAC-SHA256 (aynı kişiyi tekrar tanımak için; geri çözülemez)
 * - Gösterim: 123******45
 */

/** TC kimlik numarası algoritma kontrolü (11 hane, ilk hane 0 değil, 10. ve 11. hane kontrol haneleri). */
export function isValidNationalId(value: string): boolean {
  if (!/^[1-9]\d{10}$/.test(value)) return false;
  const d = value.split("").map(Number);
  const odd = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!;
  const even = d[1]! + d[3]! + d[5]! + d[7]!;
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  if (d10 !== d[9]) return false;
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return d11 === d[10];
}

/** Boşluk ve ayırıcıları temizler. */
export function normalizeNationalId(value: string): string {
  return value.replace(/[\s.-]/g, "");
}

export function maskNationalId(value: string): string {
  return `${value.slice(0, 3)}******${value.slice(-2)}`;
}

type KeyRing = { current: { version: number; key: Buffer }; all: Map<number, Buffer> };

let ring: KeyRing | undefined;

function keyRing(): KeyRing {
  if (ring) return ring;
  const entries = env()
    .NATIONAL_ID_ENC_KEYS.split(",")
    .map((part) => {
      const [version, b64] = part.split(":");
      const key = Buffer.from(b64 ?? "", "base64");
      if (key.length !== 32) throw new Error(`NATIONAL_ID_ENC_KEYS: sürüm ${version} anahtarı 32 bayt olmalı`);
      return { version: Number(version), key };
    });
  const first = entries[0];
  if (!first) throw new Error("NATIONAL_ID_ENC_KEYS boş");
  ring = { current: first, all: new Map(entries.map((e) => [e.version, e.key])) };
  return ring;
}

export function encryptNationalId(plain: string): string {
  const { version, key } = keyRing().current;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v${version}:${Buffer.concat([iv, tag, enc]).toString("base64")}`;
}

export function decryptNationalId(stored: string): string {
  const match = /^v(\d+):(.+)$/.exec(stored);
  if (!match) throw new Error("Geçersiz şifreli TC biçimi");
  const key = keyRing().all.get(Number(match[1]));
  if (!key) throw new Error(`TC anahtarı bulunamadı (sürüm ${match[1]})`);
  const raw = Buffer.from(match[2]!, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

export function hmacNationalId(plain: string): string {
  return createHmac("sha256", env().NATIONAL_ID_HMAC_KEY).update(plain).digest("hex");
}

/** Kaydedilecek üç alanı birlikte üretir. Geçersiz numarada null döner. */
export function protectNationalId(raw: string): { enc: string; hmac: string; masked: string } | null {
  const value = normalizeNationalId(raw);
  if (!isValidNationalId(value)) return null;
  return { enc: encryptNationalId(value), hmac: hmacNationalId(value), masked: maskNationalId(value) };
}

/** Testler için: anahtar halkasını yeniden okur. */
export function resetNationalIdKeys() {
  ring = undefined;
}
