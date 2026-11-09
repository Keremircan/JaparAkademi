/**
 * Vardiya türleri (karar #291). Vardiya saat aralığı olarak saklanır: "23:00-07:00".
 * Liste `org.shift_types` parametresindedir; pozisyon bu listeden bir ya da birden çok vardiya seçer.
 * İstemci ve sunucu ortak kullanır.
 */

/** Saklanan biçim: SS:DD-SS:DD (başlangıç ve bitiş farklı; bitiş ertesi güne düşebilir). */
export const SHIFT_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Parametrenin varsayılanı: JAPAR'daki dört vardiya. */
export const DEFAULT_SHIFT_TYPES = ["23:00-07:00", "07:00-15:00", "15:00-23:00", "08:00-18:00"];

/** Listede en çok kaç vardiya olabilir (ekran ve doğrulama sınırı). */
export const MAX_SHIFT_TYPES = 12;

const LOOSE = /^(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})$/;

/** "8.00 – 18.00", "08:00 - 18:00" gibi yazımları "08:00-18:00" biçimine çevirir; geçersizse null. */
export function normalizeShift(raw: string): string | null {
  const m = LOOSE.exec(raw.trim());
  if (!m) return null;
  const [sh, sm, eh, em] = [m[1]!, m[2]!, m[3]!, m[4]!].map(Number) as [number, number, number, number];
  if (sh > 23 || eh > 23 || sm > 59 || em > 59) return null;
  if (sh === eh && sm === em) return null;
  const hhmm = (h: number, min: number) => `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  return `${hhmm(sh, sm)}-${hhmm(eh, em)}`;
}

/** Ekranda gösterim: "23:00 – 07:00". */
export function shiftLabel(shift: string): string {
  return shift.replace("-", " – ");
}

/** Pozisyon kartı künyesinde tek satır: "23:00 – 07:00, 07:00 – 15:00"; vardiya yoksa null. */
export function formatShifts(shifts: readonly string[]): string | null {
  return shifts.length > 0 ? shifts.map(shiftLabel).join(", ") : null;
}

/** Tekrarları atar; önce listedeki sıra, listede olmayanlar (eski kayıtlar) sona. */
export function orderShifts(shifts: readonly string[], list: readonly string[]): string[] {
  const unique = [...new Set(shifts)];
  const rank = (s: string) => {
    const i = list.indexOf(s);
    return i < 0 ? list.length : i;
  };
  return unique.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map(({ s }) => s);
}
