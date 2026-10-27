import { describe, expect, it } from "vitest";
import { allIndependent, canonicalJson, checkMark, currentLevels, lowerLevels, nextLevel, scorePractical } from "@/server/state/practice";

describe("FG-5.2 seviye kuralları (karar #67)", () => {
  it("FG-5.2 seviyeler sırayla çıkar", () => {
    expect(nextLevel(null)).toBe("demonstrated");
    expect(nextLevel("demonstrated")).toBe("supervised");
    expect(nextLevel("supervised")).toBe("independent");
    expect(nextLevel("independent")).toBeNull();
  });

  it("FG-5.2 yukarı yalnızca bir seviye; atlama ve aynı seviye reddedilir", () => {
    expect(checkMark(null, "demonstrated", null)).toEqual({ ok: true, direction: "up" });
    expect(checkMark(null, "supervised", null)).toEqual({ ok: false, error: "practice_level_skip" });
    expect(checkMark("demonstrated", "independent", null)).toEqual({ ok: false, error: "practice_level_skip" });
    expect(checkMark("supervised", "supervised", null)).toEqual({ ok: false, error: "practice_level_invalid" });
  });

  it("FG-5.2 düşürme herhangi bir alt seviyeye yapılır, gerekçe zorunludur", () => {
    expect(checkMark("independent", "demonstrated", null)).toEqual({ ok: false, error: "practice_reason_required" });
    expect(checkMark("independent", "demonstrated", "  ab ")).toEqual({ ok: false, error: "practice_reason_required" });
    expect(checkMark("independent", "demonstrated", "Kalıbı ters taktı")).toEqual({ ok: true, direction: "down" });
    expect(lowerLevels("independent")).toEqual(["demonstrated", "supervised"]);
    expect(lowerLevels("demonstrated")).toEqual([]);
    expect(lowerLevels(null)).toEqual([]);
  });

  it("FG-5.3 güncel seviye son işaretlemedir; hepsi tek başına olunca modül tamamdır", () => {
    const levels = currentLevels([
      { practiceTaskId: "a", level: "demonstrated" },
      { practiceTaskId: "a", level: "independent" },
      { practiceTaskId: "b", level: "independent" },
      { practiceTaskId: "b", level: "supervised" },
    ]);
    expect(levels.get("a")).toBe("independent");
    expect(levels.get("b")).toBe("supervised");
    expect(allIndependent(["a", "b"], levels)).toBe(false);
    expect(allIndependent(["a"], levels)).toBe(true);
    expect(allIndependent([], levels)).toBe(false);
  });
});

describe("FG-6.2 pratik sınav puanı (karar #70)", () => {
  const c = (result: "pass" | "fail" | null, isCritical = false) => ({ result, isCritical });

  it("FG-6.2 puan yapabildi oranıdır; geçme notu 80", () => {
    expect(scorePractical([c("pass"), c("pass"), c("pass"), c("pass"), c("fail")], 80)).toEqual({ score: 80, passed: true, failReason: null });
    expect(scorePractical([c("pass"), c("pass"), c("fail")], 80)).toEqual({ score: 67, passed: false, failReason: "score" });
  });

  it("FG-6.2 kritik görev yapamadıysa puan yüksek olsa da kalır", () => {
    const criteria = [...Array(9).fill(c("pass")), c("fail", true)];
    expect(scorePractical(criteria, 80)).toEqual({ score: 90, passed: false, failReason: "critical" });
  });

  it("FG-6.2 işaretlenmemiş kriter varsa puanlanmaz", () => {
    expect(scorePractical([c("pass"), c(null)], 80)).toBeNull();
    expect(scorePractical([], 80)).toBeNull();
  });

  it("imza özeti için kanonik JSON anahtar sırasından bağımsızdır", () => {
    expect(canonicalJson({ b: 1, a: [{ y: null, x: "ş" }] })).toBe(canonicalJson({ a: [{ x: "ş", y: null }], b: 1 }));
    expect(canonicalJson({ a: undefined })).toBe('{"a":null}');
  });
});
