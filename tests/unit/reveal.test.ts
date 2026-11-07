import { describe, expect, it } from "vitest";
import { isFullyVisible } from "@/lib/reveal";

// Telefon: 800px ekran, üstte 72px, altta 80px sabit çubuk payı
const area = { top: 72, bottom: 800 - 80 };

describe("Hata mesajını görünür alana getirme (karar #270)", () => {
  it("çubukların arasında tamamen görünen mesaj için sayfa kaydırılmaz", () => {
    expect(isFullyVisible({ top: 300, bottom: 360 }, area)).toBe(true);
    expect(isFullyVisible({ top: 72, bottom: 720 }, area)).toBe(true);
  });

  it("alt menünün arkasında kalan mesaj görünmüyor sayılır", () => {
    expect(isFullyVisible({ top: 700, bottom: 760 }, area)).toBe(false);
    expect(isFullyVisible({ top: 1200, bottom: 1260 }, area)).toBe(false);
  });

  it("üst çubuğun arkasında ya da ekranın üstünde kalan mesaj görünmüyor sayılır", () => {
    expect(isFullyVisible({ top: 40, bottom: 100 }, area)).toBe(false);
    expect(isFullyVisible({ top: -300, bottom: -240 }, area)).toBe(false);
  });
});
