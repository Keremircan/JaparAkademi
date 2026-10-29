import { describe, expect, it } from "vitest";
import { renderActivationSheets } from "@/server/pdf/activation";

const labels = {
  appName: "JAPAR Akademi",
  title: "Hesap etkinleştirme",
  sicil: "Sicil no",
  position: "Pozisyon",
  code: "Etkinleştirme kodu",
  steps: "QR kodu okutun ya da kodu girin.",
  note: "Kod bir kez kullanılır.",
};

describe("karar #185: hesap etkinleştirme kağıtları (PDF)", () => {
  it("Türkçe karakterli isimlerle QR'lı, çok sayfalı PDF üretir", async () => {
    const sheets = Array.from({ length: 5 }, (_, i) => ({
      sicilNo: `10${i}`,
      fullName: `Şükrü Çağlayan İğdeli ${i}`,
      positionName: "Pres Operatörü",
      url: `https://akademi.example/activate/${"a".repeat(43)}`,
      code: "4815 2342",
      expires: "Son geçerlilik: 31.10.2026 17:00",
    }));
    const pdf = await renderActivationSheets(sheets, labels);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    // 4 kağıt/sayfa → 5 kağıt = 2 sayfa
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length).toBe(2);
    expect(pdf.toString("latin1")).toContain("Geist");
    // QR görseli gömülü
    expect(pdf.toString("latin1")).toContain("/Subtype /Image");
  });
});
