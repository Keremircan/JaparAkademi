/** Algoritmaya uygun TC kimlik no üretir (testler için). `seed` 1..999_999_999 aralığında olmalı. */
export function testNationalId(seed: number): string {
  const first9 = String(100_000_000 + (seed % 900_000_000)).slice(0, 9);
  const d = first9.split("").map(Number);
  const odd = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!;
  const even = d[1]! + d[3]! + d[5]! + d[7]!;
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  const d11 = (d.reduce((a, b) => a + b, 0) + d10) % 10;
  return `${first9}${d10}${d11}`;
}
