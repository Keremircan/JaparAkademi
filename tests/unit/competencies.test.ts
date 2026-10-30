import { describe, expect, it } from "vitest";
import { competencyState, grantValidUntil } from "@/server/state/competencies";

describe("yetkinlik kuralları (kararlar #219–220)", () => {
  it("geçerlilik bitişi ay sayısı kadar sonra; ay sonu taşması ayın son gününe; süresizse boş", () => {
    expect(grantValidUntil(new Date("2026-01-15T10:00:00Z"), 12)?.toISOString()).toBe("2027-01-15T10:00:00.000Z");
    expect(grantValidUntil(new Date("2026-01-31T10:00:00Z"), 1)?.toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(grantValidUntil(new Date("2027-12-31T10:00:00Z"), 2)?.toISOString()).toBe("2028-02-29T10:00:00.000Z");
    expect(grantValidUntil(new Date(), null)).toBeNull();
  });

  it("matris rengi: süresiz/uzak geçerli, uyarı süresi içinde yaklaşan, geçmiş dolmuş", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    const days = (n: number) => new Date(now.getTime() + n * 86_400_000);
    expect(competencyState(null, now, 30)).toBe("valid");
    expect(competencyState(days(31), now, 30)).toBe("valid");
    expect(competencyState(days(30), now, 30)).toBe("expiring");
    expect(competencyState(days(1), now, 30)).toBe("expiring");
    expect(competencyState(now, now, 30)).toBe("expired");
    expect(competencyState(days(-1), now, 30)).toBe("expired");
  });
});
