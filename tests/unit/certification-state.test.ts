import { describe, expect, it } from "vitest";
import { certificateState, createRateLimiter, documentNo, earliestExpiry, maskName } from "@/server/state/certification";

describe("FG-7.2 doğrulama sayfası kuralları", () => {
  it("FG-7.2 ad maskelenir: ilk ad tam, diğerleri baş harf", () => {
    expect(maskName("Ahmet Yılmaz")).toBe("Ahmet Y***");
    expect(maskName("  Ayşe Nur   Demir ")).toBe("Ayşe N*** D***");
    expect(maskName("ali ışık")).toBe("ali I***");
    expect(maskName("Tek")).toBe("Tek");
    expect(maskName("")).toBe("***");
  });

  it("FG-7.2 durum: iptal > süresi dolmuş > geçerli; süresiz belge dolmaz", () => {
    const now = new Date("2026-10-27T10:00:00Z");
    expect(certificateState("valid", null, now)).toBe("valid");
    expect(certificateState("valid", new Date("2026-10-28T00:00:00Z"), now)).toBe("valid");
    expect(certificateState("valid", new Date("2026-10-27T10:00:00Z"), now)).toBe("expired");
    expect(certificateState("revoked", new Date("2030-01-01T00:00:00Z"), now)).toBe("revoked");
  });

  it("belge numarası yıl ve sıra içerir", () => {
    expect(documentNo(123, 2026)).toBe("JA-2026-000123");
  });

  it("karar #78 pozisyon sertifikası en erken modül bitişine kadar geçerlidir", () => {
    expect(earliestExpiry([null, null])).toBeNull();
    expect(earliestExpiry([null, new Date("2027-05-01"), new Date("2027-03-01")])).toEqual(new Date("2027-03-01"));
  });

  it("karar #80 doğrulama isteklerinde IP başına hız sınırı", () => {
    const allow = createRateLimiter();
    const t0 = 1_000_000;
    expect([1, 2, 3].map((i) => allow("10.0.0.1", 3, 60_000, t0 + i))).toEqual([true, true, true]);
    expect(allow("10.0.0.1", 3, 60_000, t0 + 10)).toBe(false);
    expect(allow("10.0.0.2", 3, 60_000, t0 + 10)).toBe(true);
    expect(allow("10.0.0.1", 3, 60_000, t0 + 60_005)).toBe(true);
  });
});
