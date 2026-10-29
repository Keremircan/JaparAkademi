/**
 * Hesaba davet için saf kurallar (iş paketi 2.6b, kararlar #185–188).
 */

export type InviteChannel = "email" | "whatsapp" | "print";
export const INVITE_CHANNELS = ["email", "whatsapp", "print"] as const satisfies readonly InviteChannel[];

/**
 * Telefonu uluslararası biçime çevirir (`+905321234567`). Türkiye numaraları başında 0, 90 ya da hiç önek
 * olmadan yazılabilir; başka ülke numarası `+` ya da `00` ile başlamalıdır. Çözülemezse null.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (/[^\d\s()+.-]/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  let intl: string;
  if (value.startsWith("+")) intl = digits;
  else if (digits.startsWith("00")) intl = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) intl = `90${digits.slice(1)}`;
  else if (digits.length === 10 && /^[2-5]/.test(digits)) intl = `90${digits}`;
  else if (digits.length === 12 && digits.startsWith("90")) intl = digits;
  else return null;
  if (intl.startsWith("0") || intl.length < 10 || intl.length > 15) return null;
  if (intl.startsWith("90") && intl.length !== 12) return null;
  return `+${intl}`;
}

/** WhatsApp "paylaş" bağlantısı (karar #188): sunucu WhatsApp'a bağlanmaz, İK'nın cihazında açılır. */
export function whatsappShareUrl(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/** Basılı kanalın kodu: 8 rakam, "1234 5678" biçiminde gösterilir. */
export function formatInviteCode(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}

/** Kişinin yazdığı kodu sadeleştirir (boşluk/tire atılır); 8 rakam değilse null. */
export function parseInviteCode(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  return /^\d{8}$/.test(digits) ? digits : null;
}

/** Davet hâlâ kullanılabilir mi? */
export function isInvitationOpen(
  inv: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date; failedAttempts: number },
  now: Date,
  maxAttempts: number,
): boolean {
  return !inv.usedAt && !inv.revokedAt && inv.expiresAt > now && inv.failedAttempts < maxAttempts;
}

/** Kanalın bu kişi için seçilebilir olup olmadığı; değilse nedeni (hata kodu). */
export function channelProblem(
  channel: InviteChannel,
  person: { email: string | null; phone: string | null },
  mailEnabled: boolean,
): "invite_email_missing" | "invite_mail_disabled" | "invite_phone_missing" | null {
  if (channel === "email") {
    if (!mailEnabled) return "invite_mail_disabled";
    if (!person.email) return "invite_email_missing";
  }
  if (channel === "whatsapp" && !normalizePhone(person.phone)) return "invite_phone_missing";
  return null;
}

/** Ekrandaki hesap durumu. */
export type AccountState = "active" | "invite_pending" | "invite_expired" | "not_activated";

export function accountState(input: {
  activatedAt: Date | null;
  latestInvite: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date; failedAttempts: number } | null;
  now: Date;
  maxAttempts: number;
}): AccountState {
  const inv = input.latestInvite;
  if (inv && isInvitationOpen(inv, input.now, input.maxAttempts)) return "invite_pending";
  if (input.activatedAt) return "active";
  return inv ? "invite_expired" : "not_activated";
}
