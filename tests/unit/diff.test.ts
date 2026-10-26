import { describe, expect, it } from "vitest";
import { diffSeq, diffWords, hasChanges } from "@/lib/diff";
import { missingSections, parseCardSections } from "@/server/services/positions/card-schema";
import { parseModuleSettings, parsePlanOverrides } from "@/server/services/positions/plan-settings";
import { cardOnSubmit } from "@/server/state/position-card";

describe("Sürüm karşılaştırma", () => {
  it("liste maddelerinde eklenen, silinen ve aynı kalanları bulur", () => {
    expect(diffSeq(["a", "b", "c"], ["a", "c", "d"])).toEqual([
      { op: "eq", value: "a" },
      { op: "del", value: "b" },
      { op: "eq", value: "c" },
      { op: "add", value: "d" },
    ]);
    expect(hasChanges(diffSeq(["x"], ["x"]))).toBe(false);
  });

  it("kelime bazında fark çıkarır", () => {
    const d = diffWords("Presi güvenli çalıştırmak", "Presi her zaman güvenli çalıştırmak");
    expect(d.filter((x) => x.op === "add").map((x) => x.value.trim())).toEqual(["her zaman"]);
    expect(d.filter((x) => x.op === "del")).toEqual([]);
  });
});

describe("Bölüm 5 pozisyon kartı şeması", () => {
  it("boş kartta zorunlu bölümler eksik, 10 ve 11 isteğe bağlı", () => {
    const empty = parseCardSections({}).data!;
    expect(missingSections(empty)).toEqual(["purpose", "duties", "workflow", "routines", "reporting", "equipment", "critical", "ohs", "contacts"]);
  });

  it("geçersiz değerler reddedilir", () => {
    expect(parseCardSections({ purpose: "x".repeat(501) }).success).toBe(false);
    expect(parseCardSections({ routines: [{ time: "25:00", days: [], text: "a" }] }).success).toBe(false);
    expect(parseCardSections({ duties: [{ text: "a", frequency: "yearly" }] }).success).toBe(false);
  });

  it("kart onay akışı: İSG uzmanı tek başına kartı yayınlayamaz", () => {
    expect(cardOnSubmit({ ohsRequired: true, submitterCanApproveSection: false, submitterIsOhsSpecialist: true })).toEqual({ autoSteps: [], status: "section_review" });
    expect(cardOnSubmit({ ohsRequired: false, submitterCanApproveSection: true, submitterIsOhsSpecialist: false })).toEqual({ autoSteps: ["section"], status: "published" });
    expect(cardOnSubmit({ ohsRequired: true, submitterCanApproveSection: true, submitterIsOhsSpecialist: false })).toEqual({ autoSteps: ["section"], status: "ohs_review" });
    expect(cardOnSubmit({ ohsRequired: true, submitterCanApproveSection: true, submitterIsOhsSpecialist: true })).toEqual({ autoSteps: ["section", "ohs"], status: "published" });
  });

  it("plan parametreleri parametre şemalarıyla doğrulanır", () => {
    expect(parseModuleSettings("theory_exam", { questionCount: 30, passScore: "" })).toEqual({ questionCount: 30 });
    expect(parseModuleSettings("theory_exam", { passScore: 101 })).toBeNull();
    expect(parseModuleSettings("practice_exam", { questionCount: 10 })).toBeNull();
    expect(parseModuleSettings("practice", {})).toEqual({});
    expect(parsePlanOverrides({ videoWatchRatio: 0.4 })).toBeNull();
  });
});
