import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env } from "@/server/env";

/**
 * Toplu WhatsApp listesindeki davet bağlantısının geçici şifreli saklanması (karar #201).
 * AES-256-GCM; anahtar `BETTER_AUTH_SECRET`'tan HKDF ile türetilir. Biçim: base64(iv | tag | şifreli).
 */
function key(): Buffer {
  return Buffer.from(hkdfSync("sha256", env().BETTER_AUTH_SECRET, "japar-akademi", "invite-link:v1", 32));
}

export function encryptInviteLink(url: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(url, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

/** Çözülemezse (anahtar değişti, bozuk veri) null. */
export function decryptInviteLink(value: string): string | null {
  try {
    const raw = Buffer.from(value, "base64");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
