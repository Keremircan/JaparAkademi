import { describe, expect, it } from "vitest";
import { checkPassword } from "@/server/auth/password-policy";

const opts = { minLength: 8, sicilNo: "4821" };

describe("Şifre politikası (SPEC 11.4)", () => {
  it("güçlü şifreyi kabul eder", () => {
    expect(checkPassword("Kl8#mxPq2", opts)).toEqual([]);
  });

  it("yalnızca rakamdan oluşan ama tahmin edilemeyen şifreyi kabul eder (düşük okuryazarlık)", () => {
    expect(checkPassword("50739182", opts)).toEqual([]);
  });

  it("parametredeki en kısa uzunluğun altını reddeder", () => {
    expect(checkPassword("a7#kQ2", opts)).toContain("too_short");
    expect(checkPassword("a7#kQ2xZ9", { ...opts, minLength: 10 })).toContain("too_short");
  });

  it("yaygın şifreleri (Türkçe dahil) büyük/küçük harften bağımsız reddeder", () => {
    expect(checkPassword("Galatasaray1", opts)).toContain("common");
    expect(checkPassword("ŞİFRE123", opts)).toContain("common");
    expect(checkPassword("password1", opts)).toContain("common");
  });

  it("sicil numarasını içeren şifreyi reddeder", () => {
    expect(checkPassword("xx4821yy!", opts)).toContain("contains_sicil");
  });

  it("tekrar ve sıralı dizileri reddeder", () => {
    expect(checkPassword("11111111", opts)).toContain("repeated");
    expect(checkPassword("abababab", opts)).toContain("repeated");
    expect(checkPassword("23456789", opts)).toContain("sequential");
    expect(checkPassword("qwertyui", opts)).toContain("sequential");
  });

  it("128 karakterden uzun şifreyi reddeder", () => {
    expect(checkPassword("Ab1!".repeat(40), opts)).toContain("too_long");
  });
});
