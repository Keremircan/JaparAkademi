/**
 * Kişiyi kalıcı silme onayı (karar #265). Üst yönetici "<Ad Soyad> silmeyi onaylıyorum" yazar; sunucu da aynı kuralla
 * denetler. Büyük/küçük harf, Türkçe i/ı/İ/I farkı ve fazla boşluk önemsizdir; diğer harfler (ş, ğ, ü, ö, ç) aynen
 * yazılmalıdır. İstemci ve sunucu ortak kullanır.
 */

export const ERASE_REASON_MIN = 3;
export const ERASE_REASON_MAX = 500;

export function normalizeConfirmation(text: string): string {
  return text
    .normalize("NFC")
    .toLocaleLowerCase("tr")
    .replace(/̇/g, "")
    .replace(/ı/g, "i")
    .replace(/\s+/g, " ")
    .trim();
}

/** Dil metnindeki `{name}` kişinin adıyla doldurulur (ör. "{name} silmeyi onaylıyorum"). */
export function confirmationPhrase(template: string, fullName: string): string {
  return template.replace("{name}", fullName.trim().replace(/\s+/g, " "));
}

export function confirmationMatches(typed: string, expected: string): boolean {
  const value = normalizeConfirmation(typed);
  return value.length > 0 && value === normalizeConfirmation(expected);
}

/** Gerekçe: baştaki/sondaki boşluklar atılır; 3–500 karakter. */
export function cleanEraseReason(reason: string): string | null {
  const value = reason.trim().replace(/\s+/g, " ");
  return value.length >= ERASE_REASON_MIN && value.length <= ERASE_REASON_MAX ? value : null;
}
