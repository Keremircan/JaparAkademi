import { COMMON_PASSWORDS } from "./common-passwords";

export type PasswordIssue =
  | "too_short"
  | "too_long"
  | "common"
  | "contains_sicil"
  | "repeated"
  | "sequential";

export const PASSWORD_MAX_LENGTH = 128;

const SEQUENCES = [
  "0123456789",
  "9876543210",
  "abcçdefgğhıijklmnoöprsştuüvyz",
  "abcdefghijklmnopqrstuvwxyz",
  "qwertyuıopğü",
  "qwertyuiop",
  "asdfghjklşi",
  "asdfghjkl",
  "zxcvbnmöç",
  "zxcvbnm",
];

function isSequential(value: string): boolean {
  if (value.length < 4) return false;
  return SEQUENCES.some((seq) => seq.includes(value));
}

/**
 * Şifre politikası (SPEC 11.4). Yalnızca rakamdan oluşan şifrelere izin verilir
 * (düşük okuryazarlık), ancak en kısa uzunluk parametreyle belirlenir (varsayılan 8).
 */
export function checkPassword(
  password: string,
  opts: { minLength: number; sicilNo?: string },
): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  const lower = password.toLocaleLowerCase("tr-TR");

  if (password.length < opts.minLength) issues.push("too_short");
  if (password.length > PASSWORD_MAX_LENGTH) issues.push("too_long");
  if (COMMON_PASSWORDS.has(lower)) issues.push("common");
  if (opts.sicilNo && opts.sicilNo.length >= 3 && lower.includes(opts.sicilNo.toLocaleLowerCase("tr-TR"))) {
    issues.push("contains_sicil");
  }
  if (password.length > 0 && new Set(lower).size <= 2) issues.push("repeated");
  if (isSequential(lower)) issues.push("sequential");

  return issues;
}
