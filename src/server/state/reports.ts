/**
 * Rapor hesapları (SPEC 10.1, karar #94–95), saf fonksiyonlar.
 */

export type HazardClass = "low" | "medium" | "high";

/** Tehlike sınıfı ayarlanmamışsa "tehlikeli" (medium) kabul edilir (SPEC 13.3). */
export function effectiveHazardClass(value: HazardClass | null): { hazardClass: HazardClass; assumed: boolean } {
  return value ? { hazardClass: value, assumed: false } : { hazardClass: "medium", assumed: true };
}

/** Takvim günü farkı (YYYY-AA-GG). */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function summarize(values: readonly number[]): { count: number; avg: number | null; median: number | null; min: number | null; max: number | null } {
  if (values.length === 0) return { count: 0, avg: null, median: null, min: null, max: null };
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return { count: sorted.length, avg: Math.round(avg * 10) / 10, median, min: sorted[0]!, max: sorted[sorted.length - 1]! };
}

/** Dakikayı saate çevirir (bir ondalık). */
export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

/** Yanlış oranı (yüzde, tam sayı). */
export function wrongRate(wrong: number, asked: number): number {
  return asked ? Math.round((wrong / asked) * 100) : 0;
}
