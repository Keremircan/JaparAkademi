/**
 * Teorik sınav kuralları (SPEC Bölüm 6), saf fonksiyonlar.
 *  - Soru çekimi: N soru konu sayısına bölünür, artanlar rastgele konulara verilir; her konuda zorluklar karışık.
 *  - Puan: doğru / toplam × 100 (tam sayıya yuvarlanır). İSG kritik soru yanlışsa (veya boşsa) puan ne olursa olsun kalır.
 *  - Hak: plan/genel parametre + ek haklar (attempt_grants). Bekleme: son başarısız teslimden itibaren.
 */

export type Rng = () => number;

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export type PoolItem = { versionId: string; topic: string; difficulty: number };

/** Dengeli soru çekimi. Havuz yetersizse null döner. */
export function drawQuestions<T extends PoolItem>(pool: readonly T[], count: number, rng: Rng = Math.random): T[] | null {
  if (count <= 0 || pool.length < count) return null;
  const byTopic = new Map<string, T[]>();
  for (const q of pool) byTopic.set(q.topic, [...(byTopic.get(q.topic) ?? []), q]);

  // Her konu içinde zorluklar karışık: zorluk gruplarından sırayla al
  const ordered = new Map<string, T[]>();
  for (const [topic, items] of byTopic) {
    const groups = shuffle([...new Set(items.map((i) => i.difficulty))], rng).map((d) => shuffle(items.filter((i) => i.difficulty === d), rng));
    const out: T[] = [];
    while (groups.some((g) => g.length)) for (const g of groups) if (g.length) out.push(g.shift()!);
    ordered.set(topic, out);
  }

  const topics = shuffle([...ordered.keys()], rng);
  const quota = new Map(topics.map((t) => [t, Math.floor(count / topics.length)]));
  for (const t of topics.slice(0, count % topics.length)) quota.set(t, quota.get(t)! + 1);

  // Konuda yeterli soru yoksa açık, sorusu kalan konulara dağıtılır
  const taken = new Map(topics.map((t) => [t, Math.min(quota.get(t)!, ordered.get(t)!.length)]));
  let deficit = count - [...taken.values()].reduce((a, b) => a + b, 0);
  while (deficit > 0) {
    let progressed = false;
    for (const t of topics) {
      if (deficit > 0 && taken.get(t)! < ordered.get(t)!.length) {
        taken.set(t, taken.get(t)! + 1);
        deficit--;
        progressed = true;
      }
    }
    if (!progressed) return null;
  }
  return shuffle(
    topics.flatMap((t) => ordered.get(t)!.slice(0, taken.get(t)!)),
    rng,
  );
}

export type ScoredItem = { isCorrect: boolean; isOhsCritical: boolean };

export function scoreAttempt(items: readonly ScoredItem[], passScore: number): { score: number; passed: boolean; failReason: "score" | "ohs_critical" | null } {
  const total = items.length;
  const correct = items.filter((i) => i.isCorrect).length;
  const score = total ? Math.round((correct / total) * 100) : 0;
  if (items.some((i) => i.isOhsCritical && !i.isCorrect)) return { score, passed: false, failReason: "ohs_critical" };
  if (score < passScore) return { score, passed: false, failReason: "score" };
  return { score, passed: true, failReason: null };
}

export function attemptsLeft(maxAttempts: number, extraGranted: number, used: number): number {
  return Math.max(0, maxAttempts + extraGranted - used);
}

/** Bekleme bitişi: son başarısız teslim + bekleme saati. */
export function cooldownUntil(lastFailedAt: Date | null, cooldownHours: number): Date | null {
  if (!lastFailedAt || cooldownHours <= 0) return null;
  return new Date(lastFailedAt.getTime() + cooldownHours * 3600_000);
}

/** Konu bazında özet (kursiyere doğru cevap gösterilmez; yalnızca konu başarı oranı). */
export function topicSummary(items: readonly { topic: string; isCorrect: boolean }[]): { topic: string; correct: number; total: number }[] {
  const map = new Map<string, { correct: number; total: number }>();
  for (const i of items) {
    const t = map.get(i.topic) ?? { correct: 0, total: 0 };
    t.total++;
    if (i.isCorrect) t.correct++;
    map.set(i.topic, t);
  }
  return [...map.entries()].map(([topic, v]) => ({ topic, ...v })).sort((a, b) => a.topic.localeCompare(b.topic, "tr"));
}
