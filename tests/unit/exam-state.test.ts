import { describe, expect, it } from "vitest";
import { attemptsLeft, cooldownUntil, drawQuestions, scoreAttempt, shuffle, topicSummary, type PoolItem } from "@/server/state/exam";

/** Tekrarlanabilir rastgele sayı üreteci (mulberry32). */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pool(spec: Record<string, number>, difficulties = [1, 2, 3]): PoolItem[] {
  return Object.entries(spec).flatMap(([topic, n]) =>
    Array.from({ length: n }, (_, i) => ({ versionId: `${topic}-${i}`, topic, difficulty: difficulties[i % difficulties.length]! })),
  );
}

const countBy = (items: PoolItem[], key: (i: PoolItem) => string | number) =>
  items.reduce<Record<string, number>>((acc, i) => ({ ...acc, [key(i)]: (acc[key(i)] ?? 0) + 1 }), {});

describe("FG-6.1 soru çekimi", () => {
  it("FG-6.1 konulara dengeli dağıtır (fark en fazla 1)", () => {
    const drawn = drawQuestions(pool({ a: 10, b: 10, c: 10 }), 10, seeded(1))!;
    expect(drawn).toHaveLength(10);
    const counts = Object.values(countBy(drawn, (i) => i.topic));
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("FG-6.1 aynı soru iki kez çekilmez", () => {
    for (let s = 1; s <= 20; s++) {
      const drawn = drawQuestions(pool({ a: 5, b: 7 }), 12, seeded(s))!;
      expect(new Set(drawn.map((d) => d.versionId)).size).toBe(12);
    }
  });

  it("FG-6.1 sorusu az olan konunun açığı diğer konulardan kapatılır", () => {
    const drawn = drawQuestions(pool({ a: 1, b: 10 }), 8, seeded(3))!;
    expect(countBy(drawn, (i) => i.topic)).toEqual({ a: 1, b: 7 });
  });

  it("FG-6.1 konu içinde zorluklar karışık gelir", () => {
    const drawn = drawQuestions(pool({ a: 9 }), 3, seeded(4))!;
    expect(new Set(drawn.map((d) => d.difficulty)).size).toBe(3);
  });

  it("FG-6.1 havuz soru sayısından küçükse çekim yapılmaz", () => {
    expect(drawQuestions(pool({ a: 3, b: 2 }), 6, seeded(5))).toBeNull();
    expect(drawQuestions(pool({ a: 3 }), 0, seeded(5))).toBeNull();
  });

  it("FG-6.1 her denemede farklı sıra ve seçim üretir", () => {
    const p = pool({ a: 20, b: 20 });
    const first = drawQuestions(p, 10, seeded(10))!.map((d) => d.versionId).join();
    const second = drawQuestions(p, 10, seeded(11))!.map((d) => d.versionId).join();
    expect(first).not.toBe(second);
  });

  it("karıştırma öğeleri korur", () => {
    const items = [1, 2, 3, 4, 5, 6];
    expect(shuffle(items, seeded(7)).sort()).toEqual(items);
  });
});

describe("FG-6.1 puanlama", () => {
  const item = (isCorrect: boolean, isOhsCritical = false) => ({ isCorrect, isOhsCritical });

  it("FG-6.1 puan doğru oranının yüzdesidir ve geçme notuyla karşılaştırılır", () => {
    expect(scoreAttempt([item(true), item(true), item(true), item(false)], 70)).toEqual({ score: 75, passed: true, failReason: null });
    expect(scoreAttempt([item(true), item(false), item(false)], 70)).toEqual({ score: 33, passed: false, failReason: "score" });
  });

  it("FG-6.1 geçme notuna eşit puan geçer", () => {
    expect(scoreAttempt([...Array(7).fill(item(true)), ...Array(3).fill(item(false))], 70).passed).toBe(true);
  });

  it("FG-6.1 İSG kritik soru yanlışsa puan yüksek olsa da kalır", () => {
    const items = [...Array(9).fill(item(true)), item(false, true)];
    expect(scoreAttempt(items, 70)).toEqual({ score: 90, passed: false, failReason: "ohs_critical" });
  });

  it("FG-6.1 boş sınav 0 puandır", () => {
    expect(scoreAttempt([], 70)).toEqual({ score: 0, passed: false, failReason: "score" });
  });
});

describe("FG-6.1 hak ve bekleme", () => {
  it("FG-6.1 kalan hak ek haklarla artar, eksiye düşmez", () => {
    expect(attemptsLeft(3, 0, 1)).toBe(2);
    expect(attemptsLeft(3, 1, 3)).toBe(1);
    expect(attemptsLeft(3, 0, 5)).toBe(0);
  });

  it("FG-6.1 bekleme son başarısız tesliminden başlar", () => {
    const at = new Date("2026-10-26T08:00:00Z");
    expect(cooldownUntil(at, 24)?.toISOString()).toBe("2026-10-27T08:00:00.000Z");
    expect(cooldownUntil(at, 0)).toBeNull();
    expect(cooldownUntil(null, 24)).toBeNull();
  });

  it("FG-6.1 konu özeti doğru sayısını verir, sıralıdır", () => {
    expect(
      topicSummary([
        { topic: "Şalter", isCorrect: true },
        { topic: "Acil durum", isCorrect: false },
        { topic: "Şalter", isCorrect: false },
      ]),
    ).toEqual([
      { topic: "Acil durum", correct: 0, total: 1 },
      { topic: "Şalter", correct: 1, total: 2 },
    ]);
  });
});
