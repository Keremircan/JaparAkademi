import type { Cell } from "./index";

/**
 * Rapor hücrelerinin görünür metni (ekran önizlemesi, Excel ve PDF ortak). Kodlar `reports.values.<grup>.<kod>`
 * mesajlarından çevrilir; tarih Europe/Istanbul'a göre gösterilir.
 */

export type Translate = (key: string, values?: Record<string, string | number>) => string;

const ENUM_COLUMNS: Record<string, string> = {
  status: "status",
  examType: "examType",
  failReason: "failReason",
  method: "method",
  visitorType: "visitorType",
  visitStatus: "visitStatus",
  language: "language",
  itemKind: "itemKind",
  recertStatus: "recertStatus",
};

/** Tarih ve saatle gösterilen sütunlar (ziyaretçi kayıt defteri). */
const DATETIME_COLUMNS = new Set(["briefedAt", "checkedInAt", "checkedOutAt"]);

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function formatDate(value: Date | string, timeZone: string): string {
  if (typeof value === "string" && DATE_ONLY.test(value)) return `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}`;
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone }).format(new Date(value));
}

export function formatCell(column: string, value: Cell, t: Translate, timeZone: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date && DATETIME_COLUMNS.has(column)) {
    return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone }).format(value);
  }
  if (value instanceof Date) return formatDate(value, timeZone);
  if (typeof value === "boolean") {
    if (column === "result") return t(value ? "values.result.passed" : "values.result.failed");
    return t(value ? "values.yes" : "values.no");
  }
  if (typeof value === "string" && ENUM_COLUMNS[column]) return t(`values.${ENUM_COLUMNS[column]}.${value}`);
  if (typeof value === "string" && DATE_ONLY.test(value)) return formatDate(value, timeZone);
  if (column === "progress" || column === "wrongRate") return `%${value}`;
  return String(value);
}
