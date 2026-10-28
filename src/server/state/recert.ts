/**
 * Tekrar eğitimi kuralları (SPEC 3.3, FG-7.3, iş paketi 2.5, kararlar #164–169), saf fonksiyonlar.
 */

export type PlanRow = { moduleId: string; kind: "theory" | "practice" | "theory_exam" | "practice_exam"; prereqs: readonly string[] };

const EXAMS = new Set(["theory_exam", "practice_exam"]);

/**
 * Tekrar eğitimine girecek modüller (karar #165): süresi yaklaşan modüller + ön koşulları arasında bunlardan biri olan
 * sınavlar. Ön koşullar yalnızca atamaya giren modüllerle sınırlanır.
 */
export function recertRows<T extends PlanRow>(rows: readonly T[], due: ReadonlySet<string>): (T & { prereqs: string[] })[] {
  const included = new Set(
    rows.filter((r) => due.has(r.moduleId) || (EXAMS.has(r.kind) && r.prereqs.some((p) => due.has(p)))).map((r) => r.moduleId),
  );
  return rows.filter((r) => included.has(r.moduleId)).map((r) => ({ ...r, prereqs: r.prereqs.filter((p) => included.has(p)) }));
}

/** Bitişi bu andan önce olan tamamlanışlar tekrar eğitimine girer (`recert.lead_days`). */
export function recertCutoff(now: Date, leadDays: number): Date {
  return new Date(now.getTime() + leadDays * 86_400_000);
}

/** Hedef tarih (karar #168): en erken bitiş; geçmişse ya da eğitim süresine yetmiyorsa hesaplanan tarih. */
export function recertTargetDate(earliestExpiry: string, computed: string): string {
  return earliestExpiry >= computed ? earliestExpiry : computed;
}
