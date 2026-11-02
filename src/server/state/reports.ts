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

/** Tam ay farkı (gün sayısı ayın gününden küçükse eksik ay sayılmaz). */
export function monthsBetween(from: string, to: string): number {
  const m = (+to.slice(0, 4) - +from.slice(0, 4)) * 12 + (+to.slice(5, 7) - +from.slice(5, 7));
  return +to.slice(8, 10) < +from.slice(8, 10) ? m - 1 : m;
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

// ---------------------------------------------------------------------------
// Yönetim özeti ve aylık özet e-postası (iş paketi 3.5, kararlar #237–242)
// ---------------------------------------------------------------------------

/** Süresi dolacaklar için gün pencereleri (SPEC 10.1: önümüzdeki 30/60/90 gün). */
export const EXPIRING_WINDOWS = [30, 60, 90] as const;

/** Geçme oranı (yüzde, tam sayı); deneme yoksa oran yoktur. */
export function passRate(passed: number, total: number): number | null {
  return total ? Math.round((passed / total) * 100) : null;
}

/** "YYYY-AA" ayına ay ekler (eksi değer geri gider). */
export function addMonths(month: string, n: number): string {
  const index = +month.slice(0, 4) * 12 + (+month.slice(5, 7) - 1) + n;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** `end` ayıyla biten `count` ay, eskiden yeniye. */
export function monthsEnding(end: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(end, i - count + 1));
}

/** Ayın ilk ve son günü. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = [+month.slice(0, 4), +month.slice(5, 7)];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** Eğilim grafiğinin son ayı: dönemin bitiş ayı, gelecekteyse bu ay. */
export function trendEndMonth(periodTo: string, today: string): string {
  const a = periodTo.slice(0, 7);
  const b = today.slice(0, 7);
  return a < b ? a : b;
}

/**
 * Aylık özet bu saatte gönderilmeli mi (karar #241)? İş her saat çalışır; ayarlanan gün ve saatten sonraki ilk çalışmada
 * gönderir, aynı ay için ikinci kez göndermez (bildirim `once`). Gün 1–28 ile sınırlı olduğundan her ayda vardır.
 */
export function monthlySummaryDue(today: string, hour: number, setting: { day: number; hour: number }): boolean {
  return +today.slice(8, 10) === setting.day && hour >= setting.hour;
}
