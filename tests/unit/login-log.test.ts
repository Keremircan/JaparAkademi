import { describe, expect, it } from "vitest";
import { loginAttemptPurgeBefore, maskLoginInput } from "@/server/state/login-log";

describe("giriş kayıtları kuralları (kararlar #215–216)", () => {
  it("bilinmeyen kullanıcı denemesinde yalnızca ilk 3 karakter görünür; diğer sonuçlarda metin aynen", () => {
    expect(maskLoginInput("GizliSifre123!", "unknown_user")).toBe("Giz•••");
    expect(maskLoginInput("ab", "unknown_user")).toBe("ab");
    expect(maskLoginInput("çğüşöı", "unknown_user")).toBe("çğü•••");
    expect(maskLoginInput("1001", "bad_password")).toBe("1001");
  });

  it("saklama sınırı gün olarak hesaplanır, 30 günden kısa olamaz", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    expect(loginAttemptPurgeBefore(now, 365).toISOString()).toBe("2025-10-30T12:00:00.000Z");
    expect(loginAttemptPurgeBefore(now, 7).toISOString()).toBe("2026-09-30T12:00:00.000Z");
  });
});
