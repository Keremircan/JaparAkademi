import { describe, expect, it } from "vitest";
import { formatCell, formatDate } from "@/server/services/reports/format";
import { daysBetween, effectiveHazardClass, minutesToHours, summarize, wrongRate } from "@/server/state/reports";

const t = (key: string) => `«${key}»`;

describe("SPEC 10.1 rapor hesapları", () => {
  it("karar #95 işe başlama süresi: takvim günü; pozisyon özeti", () => {
    expect(daysBetween("2026-10-01", "2026-10-27")).toBe(26);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(summarize([10, 4, 7, 30])).toEqual({ count: 4, avg: 12.8, median: 8.5, min: 4, max: 30 });
    expect(summarize([5])).toEqual({ count: 1, avg: 5, median: 5, min: 5, max: 5 });
    expect(summarize([])).toEqual({ count: 0, avg: null, median: null, min: null, max: null });
  });

  it("karar #94 tehlike sınıfı ayarlanmamışsa tehlikeli kabul edilir; saat hesabı", () => {
    expect(effectiveHazardClass(null)).toEqual({ hazardClass: "medium", assumed: true });
    expect(effectiveHazardClass("high")).toEqual({ hazardClass: "high", assumed: false });
    expect(minutesToHours(480)).toBe(8);
    expect(minutesToHours(100)).toBe(1.7);
  });

  it("karar #93 yanlış oranı", () => {
    expect(wrongRate(1, 3)).toBe(33);
    expect(wrongRate(0, 0)).toBe(0);
  });

  it("hücre biçimi: tarih Europe/Istanbul, kodlar çevrilir, boşlar tire", () => {
    expect(formatDate("2026-10-27", "Europe/Istanbul")).toBe("27.10.2026");
    expect(formatDate(new Date("2026-10-26T22:30:00Z"), "Europe/Istanbul")).toBe("27.10.2026");
    expect(formatCell("status", "active", t, "Europe/Istanbul")).toBe("«values.status.active»");
    expect(formatCell("result", false, t, "Europe/Istanbul")).toBe("«values.result.failed»");
    expect(formatCell("overdue", true, t, "Europe/Istanbul")).toBe("«values.yes»");
    expect(formatCell("progress", 75, t, "Europe/Istanbul")).toBe("%75");
    expect(formatCell("trainer", null, t, "Europe/Istanbul")).toBe("—");
    expect(formatCell("name", "Ayşe", t, "Europe/Istanbul")).toBe("Ayşe");
  });
});
