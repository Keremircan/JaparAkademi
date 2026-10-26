/**
 * Sürüm karşılaştırma için basit fark algoritması (en uzun ortak alt dizi).
 * Kart ve içerik sürümleri satırlara (liste maddeleri) ve kelimelere bölünerek karşılaştırılır.
 */

export type DiffOp<T> = { op: "eq" | "add" | "del"; value: T };

const MAX_CELLS = 4_000_000;

/** İki diziyi karşılaştırır. Çok büyük girdide (performans için) tümü silindi/eklendi sayılır. */
export function diffSeq<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean = Object.is): DiffOp<T>[] {
  if (a.length * b.length > MAX_CELLS) {
    return [...a.map((value) => ({ op: "del" as const, value })), ...b.map((value) => ({ op: "add" as const, value }))];
  }
  // lcs[i][j] = a[i..] ve b[j..] için LCS uzunluğu
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = eq(a[i]!, b[j]!) ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffOp<T>[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i]!, b[j]!)) {
      out.push({ op: "eq", value: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ op: "del", value: a[i++]! });
    } else {
      out.push({ op: "add", value: b[j++]! });
    }
  }
  while (i < n) out.push({ op: "del", value: a[i++]! });
  while (j < m) out.push({ op: "add", value: b[j++]! });
  return out;
}

/** Kelime bazında fark (boşluklar korunur). Ardışık aynı işlemler birleştirilir. */
export function diffWords(a: string, b: string): DiffOp<string>[] {
  const tokens = (s: string) => s.match(/\s+|[^\s]+/g) ?? [];
  const merged: DiffOp<string>[] = [];
  for (const d of diffSeq(tokens(a), tokens(b))) {
    const last = merged[merged.length - 1];
    if (last && last.op === d.op) last.value += d.value;
    else merged.push({ ...d });
  }
  return merged;
}

export function hasChanges<T>(ops: readonly DiffOp<T>[]): boolean {
  return ops.some((o) => o.op !== "eq");
}
