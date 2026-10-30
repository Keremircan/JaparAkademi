/** Yetkinlik kuralları (FG-7.4, kararlar #219–220); saf, birim testlenir. */

export type CompetencyState = "valid" | "expiring" | "expired";

/** Geçerlilik bitişi: tanımdaki ay sayısı kadar sonra; süresizse null. Ay sonu taşmaları ayın son gününe çekilir. */
export function grantValidUntil(from: Date, validityMonths: number | null): Date | null {
  if (!validityMonths) return null;
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + validityMonths);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** Matris rengi: süresiz ya da uzak bitiş geçerli; `alertDays` içinde yaklaşan; geçmiş bitiş dolmuş. */
export function competencyState(validUntil: Date | null, now: Date, alertDays: number): CompetencyState {
  if (!validUntil) return "valid";
  if (validUntil.getTime() <= now.getTime()) return "expired";
  return validUntil.getTime() - now.getTime() <= alertDays * 86_400_000 ? "expiring" : "valid";
}
