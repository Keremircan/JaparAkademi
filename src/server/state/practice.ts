/**
 * Pratik eğitim ve pratik sınav kuralları (FG-5, FG-6.2), saf fonksiyonlar.
 *  - Seviyeler sırayla çıkar (karar #67): gösterdi → gözetiminde yaptı → tek başına yaptı. Atlama yok.
 *    Düşürme herhangi bir alt seviyeye yapılır, gerekçe zorunludur.
 *  - Pratik modül, tüm görevleri "tek başına yapar" olunca tamamlanır (FG-5.3, karar #68).
 *  - Sınav: her kriter Yapabildi/Yapamadı; puan = yapabildi / toplam × 100; kritik görev "Yapamadı" ise kalır (karar #70).
 */

export const LEVELS = ["demonstrated", "supervised", "independent"] as const;
export type PracticeLevel = (typeof LEVELS)[number];

export function levelRank(level: PracticeLevel | null): number {
  return level === null ? -1 : LEVELS.indexOf(level);
}

/** Bir sonraki seviye; görev zaten "tek başına yapar" ise null. */
export function nextLevel(current: PracticeLevel | null): PracticeLevel | null {
  return LEVELS[levelRank(current) + 1] ?? null;
}

/** Alt seviyeler (düşürmede seçilebilecekler). */
export function lowerLevels(current: PracticeLevel | null): PracticeLevel[] {
  return LEVELS.slice(0, Math.max(0, levelRank(current)));
}

export type MarkCheck = { ok: true; direction: "up" | "down" } | { ok: false; error: "practice_level_skip" | "practice_level_invalid" | "practice_reason_required" };

/** İşaretleme kuralı: yukarı yalnızca bir seviye; aşağı herhangi bir alt seviye + gerekçe. */
export function checkMark(current: PracticeLevel | null, target: PracticeLevel, note: string | null): MarkCheck {
  const from = levelRank(current);
  const to = levelRank(target);
  if (to === from) return { ok: false, error: "practice_level_invalid" };
  if (to > from) return to === from + 1 ? { ok: true, direction: "up" } : { ok: false, error: "practice_level_skip" };
  if (!note || note.trim().length < 3) return { ok: false, error: "practice_reason_required" };
  return { ok: true, direction: "down" };
}

/** Görevlerin güncel seviyesi: her görevin son işaretlemesi (işaretlemeler zamana göre sıralı verilmeli). */
export function currentLevels(marks: readonly { practiceTaskId: string; level: PracticeLevel }[]): Map<string, PracticeLevel> {
  const out = new Map<string, PracticeLevel>();
  for (const m of marks) out.set(m.practiceTaskId, m.level);
  return out;
}

export function allIndependent(taskIds: readonly string[], levels: ReadonlyMap<string, PracticeLevel>): boolean {
  return taskIds.length > 0 && taskIds.every((t) => levels.get(t) === "independent");
}

export type CriterionResult = { result: "pass" | "fail" | null; isCritical: boolean };

export function scorePractical(
  criteria: readonly CriterionResult[],
  passScore: number,
): { score: number; passed: boolean; failReason: "score" | "critical" | null } | null {
  if (criteria.length === 0 || criteria.some((c) => c.result === null)) return null;
  const score = Math.round((criteria.filter((c) => c.result === "pass").length / criteria.length) * 100);
  if (criteria.some((c) => c.isCritical && c.result === "fail")) return { score, passed: false, failReason: "critical" };
  if (score < passScore) return { score, passed: false, failReason: "score" };
  return { score, passed: true, failReason: null };
}

/** İmzalanan kaydın özeti için kanonik JSON (anahtarlar sıralı). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
