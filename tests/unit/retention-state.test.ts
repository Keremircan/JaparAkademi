import { describe, expect, it } from "vitest";
import { auditPurgeBefore, isDueForAnonymization, personnelAnonymizationCutoff, subtractYears } from "@/server/state/retention";

describe("Saklama süresi kuralları (SPEC 12.3)", () => {
  it("yıl çıkarma: 29 Şubat artık olmayan yılda 28 Şubat olur", () => {
    expect(subtractYears("2026-10-27", 15)).toBe("2011-10-27");
    expect(subtractYears("2028-02-29", 1)).toBe("2027-02-28");
    expect(subtractYears("2028-02-29", 4)).toBe("2024-02-29");
  });

  it("FG-12.3 iş ilişkisi bitişi + N yıl dolan ayrılmış personel anonimleştirilir", () => {
    const cutoff = personnelAnonymizationCutoff("2026-10-27", 15);
    const p = { status: "terminated", anonymizedAt: null };
    expect(isDueForAnonymization({ ...p, endDate: "2011-10-27" }, cutoff)).toBe(true);
    expect(isDueForAnonymization({ ...p, endDate: "2011-10-28" }, cutoff)).toBe(false);
    expect(isDueForAnonymization({ ...p, endDate: null }, cutoff)).toBe(false);
    expect(isDueForAnonymization({ ...p, status: "active", endDate: "2000-01-01" }, cutoff)).toBe(false);
    expect(isDueForAnonymization({ ...p, endDate: "2000-01-01", anonymizedAt: new Date() }, cutoff)).toBe(false);
  });

  it("denetim kaydı sınırı N yıl öncesidir", () => {
    expect(auditPurgeBefore(new Date("2026-10-27T03:45:00Z"), 15).toISOString()).toBe("2011-10-27T03:45:00.000Z");
  });
});
