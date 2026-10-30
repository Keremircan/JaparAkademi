/** Eski personelin periyodik eğitim durumu (iş paketi 3.2, kararlar #222–223); saf, birim testlenir. */

export type PeriodicState = "none" | "scheduled" | "open";

/** Sistem dışı tarihin geçerlilik bitişi: tarih + ay (ay sonu taşması ayın son gününe). "yyyy-aa-gg". */
export function priorExpiry(completedOn: string, months: number): string {
  const [y, m, d] = completedOn.split("-").map(Number) as [number, number, number];
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/**
 * Kişi × modül durumu: açık atamada ise "open"; sistemde tamamlanış ya da girilmiş tarih varsa (hangisi yeniyse) "scheduled"
 * ve bitiş tarihi; hiçbiri yoksa "none" (tarih girilmeli ya da "Şimdi başlat").
 */
export function periodicState(x: {
  open: boolean;
  systemCompletedOn: string | null;
  systemExpiresOn: string | null;
  priorOn: string | null;
  priorExpiresOn: string | null;
  leadDays: number;
}): { state: PeriodicState; source: "system" | "prior" | null; lastDate: string | null; expiresOn: string | null } {
  const useSystem = x.systemCompletedOn !== null && (x.priorOn === null || x.systemCompletedOn >= x.priorOn);
  const source = useSystem ? "system" : x.priorOn ? "prior" : null;
  const lastDate = useSystem ? x.systemCompletedOn : x.priorOn;
  const expiresOn = useSystem ? x.systemExpiresOn : x.priorExpiresOn;
  if (x.open) return { state: "open", source, lastDate, expiresOn };
  return { state: source ? "scheduled" : "none", source, lastDate, expiresOn };
}
