import { describe, expect, it } from "vitest";
import { endOfDayIn } from "@/lib/dates";
import { briefingMinSeconds, briefingProblems, canTransition, isBlacklistActive, isVisitCancellable, isVisitEditable, quizScore, visitorRetentionYears } from "@/server/state/visits";

const card = { titleTr: "Acil durum", bodyTr: "Metin", titleEn: "Emergency", bodyEn: "Text" };
const question = { stemTr: "Soru", stemEn: "Question", optionsTr: ["A", "B"], optionsEn: ["A", "B"], correctIndex: 1 };

describe("Ziyaret durumları (SPEC 8.2, karar #135)", () => {
  it("planlandı → bilgilendirildi → içeride → çıktı; iptal yalnızca girişten önce", () => {
    expect(canTransition("planned", "briefed")).toBe(true);
    expect(canTransition("briefed", "checked_in")).toBe(true);
    expect(canTransition("checked_in", "checked_out")).toBe(true);
    expect(canTransition("planned", "checked_in")).toBe(false);
    expect(isVisitCancellable("planned")).toBe(true);
    expect(isVisitCancellable("briefed")).toBe(true);
    expect(isVisitCancellable("checked_in")).toBe(false);
    expect(isVisitCancellable("cancelled")).toBe(false);
    expect(isVisitEditable("planned")).toBe(true);
    expect(isVisitEditable("briefed")).toBe(false);
  });

  it("FG-8.4 kara liste kaydı kaldırılmamış ve bitiş tarihi geçmemişse geçerlidir", () => {
    expect(isBlacklistActive({ liftedAt: null, endsAt: null }, "2026-10-28")).toBe(true);
    expect(isBlacklistActive({ liftedAt: null, endsAt: "2026-10-28" }, "2026-10-28")).toBe(true);
    expect(isBlacklistActive({ liftedAt: null, endsAt: "2026-10-27" }, "2026-10-28")).toBe(false);
    expect(isBlacklistActive({ liftedAt: new Date(), endsAt: null }, "2026-10-28")).toBe(false);
  });

  it("taşeron ziyareti olan kişide taşeron saklama süresi uygulanır (karar #134)", () => {
    expect(visitorRetentionYears(["office", "site"], 2, 5)).toBe(2);
    expect(visitorRetentionYears(["office", "contractor"], 2, 5)).toBe(5);
  });
});

describe("Bilgilendirme paketi yayın kontrolü (FG-8.2)", () => {
  it("TR ve EN dolu kartlar ve yeterli soru varsa sorun yok", () => {
    expect(briefingProblems({ cards: [card], questions: [question, question, question] }, 3)).toEqual([]);
  });

  it("eksik dil, boş şık ve az soru ayrı ayrı bildirilir", () => {
    expect(briefingProblems({ cards: [], questions: [] }, 0)).toEqual(["briefing_no_cards"]);
    expect(briefingProblems({ cards: [{ ...card, titleEn: " " }], questions: [] }, 0)).toEqual(["briefing_card_incomplete"]);
    expect(briefingProblems({ cards: [card], questions: [{ ...question, optionsEn: ["A", ""] }] }, 1)).toEqual(["briefing_question_incomplete"]);
    expect(briefingProblems({ cards: [card], questions: [{ ...question, correctIndex: 2 }] }, 1)).toEqual(["briefing_question_incomplete"]);
    expect(briefingProblems({ cards: [card], questions: [question] }, 3)).toEqual(["briefing_not_enough_questions"]);
  });
});

describe("Ziyaretçi bilgilendirme kuralları (karar #141)", () => {
  it("en kısa süre: her kart en az N saniye, videolu kartta video süresi daha uzunsa o", () => {
    expect(briefingMinSeconds([0, 0, 0], 15)).toBe(45);
    expect(briefingMinSeconds([0, 90.7], 15)).toBe(105);
    expect(briefingMinSeconds([], 15)).toBe(0);
  });

  it("kontrol sorusu puanı yuvarlanır; geçme notu ve üstü geçer", () => {
    expect(quizScore([true, true, true], 100)).toEqual({ score: 100, passed: true });
    expect(quizScore([true, true, false], 100)).toEqual({ score: 67, passed: false });
    expect(quizScore([true, true, true, true, false], 80)).toEqual({ score: 80, passed: true });
  });

  it("ziyaret bağlantısı ziyaret gününün sonunda (İstanbul) biter", () => {
    expect(endOfDayIn("2026-10-28", "Europe/Istanbul").toISOString()).toBe("2026-10-28T21:00:00.000Z");
    expect(endOfDayIn("2026-12-31", "UTC").toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});
