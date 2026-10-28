import { describe, expect, it } from "vitest";
import { recertCutoff, recertRows, recertTargetDate, type PlanRow } from "@/server/state/recert";
import { monthsBetween } from "@/server/state/reports";

const rows: PlanRow[] = [
  { moduleId: "ortak", kind: "theory", prereqs: [] },
  { moduleId: "kart", kind: "theory", prereqs: ["ortak"] },
  { moduleId: "teori", kind: "theory", prereqs: ["kart"] },
  { moduleId: "sinav", kind: "theory_exam", prereqs: ["teori"] },
  { moduleId: "pratik", kind: "practice", prereqs: ["sinav"] },
  { moduleId: "psinav", kind: "practice_exam", prereqs: ["pratik"] },
];

describe("FG-7.3 tekrar eğitimi kapsamı (karar #165)", () => {
  it("süresi yaklaşan modül + ona bağlı sınav; ön koşullar atamadakilerle sınırlı", () => {
    expect(recertRows(rows, new Set(["teori"]))).toEqual([
      { moduleId: "teori", kind: "theory", prereqs: [] },
      { moduleId: "sinav", kind: "theory_exam", prereqs: ["teori"] },
    ]);
  });

  it("bağlı olmayan sınav ve süresiz modüller girmez", () => {
    expect(recertRows(rows, new Set(["ortak"])).map((r) => r.moduleId)).toEqual(["ortak"]);
    expect(recertRows(rows, new Set(["pratik"])).map((r) => r.moduleId)).toEqual(["pratik", "psinav"]);
    expect(recertRows(rows, new Set())).toEqual([]);
  });

  it("kesim anı: şimdi + recert.lead_days", () => {
    expect(recertCutoff(new Date("2026-01-01T00:00:00Z"), 30).toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  it("hedef tarih: en erken bitiş, yetmiyorsa hesaplanan (karar #168)", () => {
    expect(recertTargetDate("2026-12-01", "2026-11-05")).toBe("2026-12-01");
    expect(recertTargetDate("2026-10-01", "2026-11-05")).toBe("2026-11-05");
  });
});

describe("içerik güncellik ay hesabı (karar #171)", () => {
  it("tam ay farkı", () => {
    expect(monthsBetween("2025-09-15", "2026-10-15")).toBe(13);
    expect(monthsBetween("2025-09-15", "2026-10-14")).toBe(12);
    expect(monthsBetween("2026-10-01", "2026-10-28")).toBe(0);
  });
});
