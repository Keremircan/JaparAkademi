import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import tr from "../../messages/tr.json";
import { hourIn } from "@/lib/dates";
import { addMonths, monthlySummaryDue, monthRange, monthsEnding, passRate, trendEndMonth } from "@/server/state/reports";

describe("Yönetim özeti hesapları (iş paketi 3.5)", () => {
  it("karar #239 ay hesabı ve 12 aylık eğilim penceresi", () => {
    expect(addMonths("2026-11", 1)).toBe("2026-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-11", -11)).toBe("2025-12");
    expect(monthsEnding("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(monthsEnding("2026-11", 12)).toHaveLength(12);
    expect(monthRange("2026-11")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(monthRange("2027-02")).toEqual({ from: "2027-02-01", to: "2027-02-28" });
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    // Eğilim dönemin bitiş ayıyla biter; gelecek aya taşmaz
    expect(trendEndMonth("2026-09-30", "2026-11-02")).toBe("2026-09");
    expect(trendEndMonth("2026-11-30", "2026-11-02")).toBe("2026-11");
    expect(trendEndMonth("2027-03-01", "2026-11-02")).toBe("2026-11");
  });

  it("karar #237 ilk denemede geçme oranı; deneme yoksa oran yok", () => {
    expect(passRate(0, 0)).toBeNull();
    expect(passRate(0, 3)).toBe(0);
    expect(passRate(2, 3)).toBe(67);
    expect(passRate(5, 5)).toBe(100);
  });

  it("karar #241 aylık özet ayarlanan gün ve saatten sonra gider; saat Türkiye saatiyle", () => {
    const setting = { day: 1, hour: 8 };
    expect(monthlySummaryDue("2026-12-01", 7, setting)).toBe(false);
    expect(monthlySummaryDue("2026-12-01", 8, setting)).toBe(true);
    expect(monthlySummaryDue("2026-12-01", 23, setting)).toBe(true);
    expect(monthlySummaryDue("2026-12-02", 9, setting)).toBe(false);
    expect(monthlySummaryDue("2026-12-15", 0, { day: 15, hour: 0 })).toBe(true);
    expect(hourIn("Europe/Istanbul", new Date("2026-12-01T05:30:00Z"))).toBe(8);
    expect(hourIn("Europe/Istanbul", new Date("2026-11-30T20:59:00Z"))).toBe(23);
    expect(hourIn("Europe/Istanbul", new Date("2026-11-30T21:00:00Z"))).toBe(0);
  });

  it("karar #242 aylık özet metni alıcının dilinde; yalnızca sayılar, veri yoksa tire", () => {
    const trT = createTranslator({ locale: "tr", messages: tr, namespace: "notifications" });
    const enT = createTranslator({ locale: "en", messages: en, namespace: "notifications" });
    const params = { year: "2026", monthNo: 11, completed: 1234, approved: 3, avgDays: "none", passRate: 82, active: 7, overdue: 2, ohsExpired: 1, ohsDays: 30, ohsExpiring: 4 };

    expect(trT("kinds.monthly_summary", params)).toBe(
      "Kasım 2026 yönetim özeti hazır: 1.234 tamamlanan eğitim modülü, 3 işe başlama onayı, 2 hedefi geçen eğitim.",
    );
    expect(enT("kinds.monthly_summary", params)).toBe(
      "The November 2026 management summary is ready: 1,234 training modules completed, 3 ready-to-work approvals, 2 trainings past target date.",
    );
    const body = trT("email.monthlyBody", params);
    expect(body).toContain("Kasım 2026 · Tamamlanan eğitim modülü: 1.234 · İşe başlayabilir onayı: 3 · Ortalama işe başlama süresi: — ·");
    expect(body).toContain("ilk denemede geçme: %82.");
    expect(body).toContain("İSG eğitimi süresi dolmuş 1 kişi · 30 gün içinde dolacak 4 kişi");
    expect(trT("email.monthlyBody", { ...params, avgDays: 12.5, passRate: "none" })).toContain(
      "Ortalama işe başlama süresi: 12,5 gün · Teorik sınavda ilk denemede geçme: —.",
    );
    const enBody = enT("email.monthlyBody", { ...params, year: "2027", monthNo: 1 });
    expect(enBody).toContain("January 2027 · Training modules completed: 1,234");
    expect(enBody).toContain("First-attempt pass rate in theory exams: 82%.");
    expect(enBody).toContain("4 people whose OHS training expires within 30 days");

    // Mesajdaki ay adları ekrandaki ve Excel'deki ay adlarıyla (Intl) aynı
    for (let m = 1; m <= 12; m++) {
      const date = new Date(Date.UTC(2026, m - 1, 15, 12));
      const name = (locale: string) => new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(date);
      expect(trT("kinds.monthly_summary", { ...params, monthNo: m })).toMatch(new RegExp(`^${name("tr-TR")} 2026 `));
      expect(enT("kinds.monthly_summary", { ...params, monthNo: m })).toMatch(new RegExp(`^The ${name("en-GB")} 2026 `));
    }
  });
});
