import { describe, expect, it } from "vitest";
import { periodicState, priorExpiry } from "@/server/state/periodic";

describe("periyodik eğitim kuralları (kararlar #222–223)", () => {
  it("sistem dışı tarihin bitişi: ay sayısı kadar sonra, ay sonu taşması ayın son gününe", () => {
    expect(priorExpiry("2025-03-15", 12)).toBe("2026-03-15");
    expect(priorExpiry("2025-01-31", 1)).toBe("2025-02-28");
    expect(priorExpiry("2023-12-31", 2)).toBe("2024-02-29");
    expect(priorExpiry("2025-11-10", 24)).toBe("2027-11-10");
  });

  it("durum: açık atama öncelikli; sistem kaydı ile girilen tarihten yeni olan geçerli; hiçbiri yoksa tarih yok", () => {
    const base = { open: false, systemCompletedOn: null, systemExpiresOn: null, priorOn: null, priorExpiresOn: null, leadDays: 30 };
    expect(periodicState(base)).toEqual({ state: "none", source: null, lastDate: null, expiresOn: null });
    expect(periodicState({ ...base, priorOn: "2025-01-01", priorExpiresOn: "2026-01-01" })).toMatchObject({ state: "scheduled", source: "prior", expiresOn: "2026-01-01" });
    const both = { ...base, priorOn: "2025-06-01", priorExpiresOn: "2026-06-01", systemCompletedOn: "2025-09-01", systemExpiresOn: "2026-09-01" };
    expect(periodicState(both)).toMatchObject({ source: "system", lastDate: "2025-09-01" });
    expect(periodicState({ ...both, systemCompletedOn: "2025-01-01", systemExpiresOn: "2026-01-01" })).toMatchObject({ source: "prior", lastDate: "2025-06-01" });
    expect(periodicState({ ...base, open: true })).toMatchObject({ state: "open" });
  });
});
