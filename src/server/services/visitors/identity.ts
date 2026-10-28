import { protectNationalId, protectPassport } from "@/server/crypto/national-id";
import { ValidationError } from "@/server/errors";

/**
 * Ziyaretçi kimlik no (karar #132): TC (algoritma kontrollü) ya da pasaport (ülke + numara).
 * Şifreli + HMAC + maskeli saklanır; işlemler yalnızca crypto/national-id üzerinden.
 */
export type VisitorIdInput = { idKind: "tc" | "passport"; idNumber: string; idCountry?: string | null };

export type ProtectedVisitorId = {
  idKind: "tc" | "passport";
  idCountry: string | null;
  enc: string;
  hmac: string;
  masked: string;
};

export function protectVisitorId(input: VisitorIdInput): ProtectedVisitorId {
  if (input.idKind === "tc") {
    const p = protectNationalId(input.idNumber);
    if (!p) throw new ValidationError("national_id_invalid");
    return { idKind: "tc", idCountry: null, ...p };
  }
  const country = (input.idCountry ?? "").trim().toUpperCase();
  const p = protectPassport(country, input.idNumber);
  if (!p) throw new ValidationError("passport_invalid");
  return { idKind: "passport", idCountry: country, ...p };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()-]{7,20}$/;

/** Boş metni null'a çevirir; e-posta küçük harfe. Biçim hatasında ValidationError. */
export function cleanContact(input: { phone?: string | null; email?: string | null }): { phone: string | null; email: string | null } {
  const phone = input.phone?.trim() || null;
  const email = input.email?.trim().toLowerCase() || null;
  if (phone && !PHONE.test(phone)) throw new ValidationError("phone_invalid");
  if (email && !EMAIL.test(email)) throw new ValidationError("email_invalid");
  return { phone, email };
}
