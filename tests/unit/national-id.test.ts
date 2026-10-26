import { describe, expect, it } from "vitest";
import { isValidNationalId, maskNationalId, normalizeNationalId } from "@/server/crypto/national-id";

describe("TC kimlik no doğrulama (KVKK, karar #19)", () => {
  it("kontrol haneleri doğru numarayı kabul eder", () => {
    expect(isValidNationalId("10000000146")).toBe(true);
    expect(isValidNationalId("12345678950")).toBe(true);
  });

  it("kontrol hanesi yanlış, 0 ile başlayan veya 11 haneden farklı numarayı reddeder", () => {
    expect(isValidNationalId("10000000147")).toBe(false);
    expect(isValidNationalId("01234567890")).toBe(false);
    expect(isValidNationalId("1000000014")).toBe(false);
    expect(isValidNationalId("1000000014a")).toBe(false);
  });

  it("boşluk, nokta ve tireyi temizler", () => {
    expect(normalizeNationalId(" 100 000.001-46 ")).toBe("10000000146");
  });

  it("ilk 3 ve son 2 hane dışını maskeler", () => {
    expect(maskNationalId("10000000146")).toBe("100******46");
  });
});
