/**
 * OSGB dışa aktarımının saf kuralları (iş paketi 3.3, kararlar #226–229).
 *  - CSV Türkçe Excel'de doğru açılsın diye noktalı virgüllü, UTF-8 BOM'lu ve CRLF satır sonlu.
 *  - Hücre `=`, `+`, `-`, `@` ya da sekme ile başlıyorsa formül olarak çalışmasın diye başına `'` eklenir.
 */

export const OSGB_COLUMNS = [
  "nationalId",
  "sicil",
  "name",
  "unit",
  "position",
  "topic",
  "topicGroup",
  "date",
  "hours",
  "method",
  "trainer",
  "documentNo",
  "validUntil",
  "source",
] as const;
export type OsgbColumn = (typeof OSGB_COLUMNS)[number];

export type OsgbMethod = "remote" | "classroom";
export type OsgbSource = "system" | "prior";

/** Sistem kaydının yöntemi: çevrim içi → uzaktan, sınıf → yüz yüze. Devreden kayıt aktarılmaz. */
export function osgbMethod(via: string | null): OsgbMethod | null {
  if (via === "online") return "remote";
  if (via === "classroom") return "classroom";
  return null;
}

const FORMULA = /^[=+\-@\t\r]/;

export function csvCell(value: string): string {
  const safe = FORMULA.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(rows: string[][]): string {
  return `\uFEFF${rows.map((r) => r.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

/** Ondalık sayı metni: Türkçede ondalık virgül (CSV Türkçe Excel'de sayı olarak okunur). */
export function decimalText(value: number, locale: "tr" | "en"): string {
  return locale === "tr" ? String(value).replace(".", ",") : String(value);
}
