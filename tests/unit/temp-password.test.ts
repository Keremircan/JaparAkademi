import { describe, expect, it } from "vitest";
import { checkPassword } from "@/server/auth/password-policy";
import { generateTempPassword } from "@/server/auth/temp-password";

describe("FG-1.4 geçici şifre üretici", () => {
  it("yalnızca rakamlardan oluşur ve politikadan geçer", () => {
    for (let i = 0; i < 200; i++) {
      const p = generateTempPassword(8, "1234");
      expect(p).toMatch(/^\d{8}$/);
      expect(checkPassword(p, { minLength: 8, sicilNo: "1234" })).toEqual([]);
    }
  });

  it("parametredeki en kısa uzunluğa uyar (en az 8)", () => {
    expect(generateTempPassword(10)).toHaveLength(10);
    expect(generateTempPassword(4)).toHaveLength(8);
  });
});
