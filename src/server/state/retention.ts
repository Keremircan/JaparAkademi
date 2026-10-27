/**
 * Saklama süresi kuralları (SPEC 12.3, iş paketi 2.1), saf fonksiyonlar.
 * Tarihler "YYYY-MM-DD" metnidir ve org.timezone'daki takvim gününe göredir.
 */

/** Tarihten tam yıl çıkarır; 29 Şubat artık olmayan yılda 28 Şubat olur. */
export function subtractYears(date: string, years: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const year = y - years;
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${String(year).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

/**
 * Personel anonimleştirme sınırı: iş ilişkisi bitişi + N yıl dolduysa (bitiş ≤ bugün − N yıl) kişi anonimleştirilir.
 * Ör. bitiş 2010-03-15, N = 15 → 2025-03-15'te uygun olur.
 */
export function personnelAnonymizationCutoff(today: string, years: number): string {
  return subtractYears(today, years);
}

export function isDueForAnonymization(
  person: { status: string; endDate: string | null; anonymizedAt: Date | null },
  cutoff: string,
): boolean {
  return person.status === "terminated" && person.endDate !== null && person.anonymizedAt === null && person.endDate <= cutoff;
}

/** Denetim kaydı: bu andan eski satırlar silinir (retention.audit_years). */
export function auditPurgeBefore(now: Date, years: number): Date {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
}
