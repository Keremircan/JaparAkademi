import { describe, expect, it } from "vitest";
import { renderCredentialSlips } from "@/server/pdf/credentials";

const labels = {
  appName: "JAPAR Akademi",
  title: "Geçici giriş şifresi",
  sicil: "Sicil no",
  position: "Pozisyon",
  password: "Geçici şifre",
  instructions: "İlk girişte yeni şifre belirlemeniz istenecek.",
  issuedAt: "Düzenlenme: 26.10.2026",
};

describe("FG-1.4 geçici şifre fişleri (PDF)", () => {
  it("Türkçe karakterli isimlerle çok sayfalı PDF üretir", async () => {
    const slips = Array.from({ length: 10 }, (_, i) => ({
      sicilNo: `10${i}`,
      fullName: `Şükrü Çağlayan İğdeli ${i}`,
      positionName: "Pres Operatörü",
      tempPassword: "50739182",
    }));
    const pdf = await renderCredentialSlips(slips, labels);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    // 8 fiş/sayfa → 10 fiş = 2 sayfa
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length).toBe(2);
    // Font gömülü
    expect(pdf.toString("latin1")).toContain("Geist");
  });
});
