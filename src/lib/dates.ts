/**
 * Takvim günü hesapları (SPEC: hesaplar Europe/Istanbul ile yapılır). Tarihler "YYYY-MM-DD" metnidir.
 */

/** Verilen saat dilimindeki bugünün tarihi. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function parse(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function format(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return format(d);
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * İş günü ekler (hafta sonu hariç; resmî tatiller Faz 2). Başlangıç günü iş günüyse 1. gün sayılır:
 * 1 iş günü süren eğitimin hedefi başlangıç günüdür.
 */
export function addBusinessDays(start: string, businessDays: number): string {
  const d = parse(start);
  while (isWeekend(d)) d.setUTCDate(d.getUTCDate() + 1);
  let remaining = Math.max(1, Math.ceil(businessDays)) - 1;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!isWeekend(d)) remaining--;
  }
  return format(d);
}

/** Hedef tamamlanma tarihi varsayılanı (karar #50): başlangıç + toplam süre / günlük eğitim süresi (iş günü). */
export function defaultTargetDate(start: string, totalMinutes: number, dailyMinutes: number): string {
  return addBusinessDays(start, Math.max(1, Math.ceil(totalMinutes / Math.max(1, dailyMinutes))));
}

export function maxDate(a: string, b: string | null | undefined): string {
  return b && b > a ? b : a;
}
