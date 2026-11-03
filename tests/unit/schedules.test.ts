import { describe, expect, it } from "vitest";
import { isoWeekday, minutesIn } from "@/lib/dates";
import { itemLine, scheduleInputSchema, sinceStart, sortItems, type ScheduleItem, type Weekday } from "@/lib/schedules";
import { copyState, itemsForWeekday, normalizeItems, pickProgram, sameItems, todayFlow, withCopy, type ProgramShape } from "@/server/state/schedules";

const item = (time: string, title: string, weekday: Weekday | null = null, note: string | null = null): ScheduleItem => ({ weekday, time, title, note });
const TZ = "Europe/Istanbul";

describe("Çalışma programı kuralları (iş paketi 3.9, kararlar #251–257)", () => {
  it("FG-1.7 sıralama vardiya başlangıcına göre: gece yarısını geçen saatler sona düşer", () => {
    expect(sinceStart("02:00", "22:00")).toBe(240);
    expect(sinceStart("22:00", "22:00")).toBe(0);
    expect(sinceStart("21:59", "22:00")).toBe(1439);
    expect(sortItems([item("06:00", "Çıkış"), item("22:00", "Devir"), item("02:00", "Mola")], "22:00").map((i) => i.title)).toEqual(["Devir", "Mola", "Çıkış"]);
    expect(sortItems([item("09:00", "B", 2), item("08:00", "A", 2), item("10:00", "C", 1)], "00:00").map((i) => i.title)).toEqual(["C", "A", "B"]);
  });

  it("FG-1.7 günlük programda gün alanı boşalır ve en az bir gün seçilir; haftalıkta her satırın günü olur", () => {
    expect(normalizeItems("daily", [item("08:00", "A", 3)], [], "00:00")).toEqual({ ok: false, error: "schedule_days_required" });
    expect(normalizeItems("daily", [item("09:00", "B", 3), item("08:00", "A")], [5, 1, 1], "00:00")).toEqual({
      ok: true,
      items: [item("08:00", "A"), item("09:00", "B")],
      days: [1, 5],
    });
    expect(normalizeItems("weekly", [item("08:00", "A")], [1], "00:00")).toEqual({ ok: false, error: "schedule_weekday_required" });
    expect(normalizeItems("weekly", [item("08:00", "A", 5), item("08:00", "B", 1)], [], "00:00")).toEqual({
      ok: true,
      items: [item("08:00", "B", 1), item("08:00", "A", 5)],
      days: [1, 5],
    });
  });

  it("FG-1.7 haftalık programın günü ve kişinin kopyası: haftalıkta günler kopyadan, günlükte programdan gelir", () => {
    const weekly: ProgramShape = { kind: "weekly", days: [1, 3], startTime: "00:00", items: [item("08:00", "Toplantı", 1), item("08:00", "Bakım", 3)] };
    expect(itemsForWeekday(weekly, 3).map((i) => i.title)).toEqual(["Bakım"]);
    expect(itemsForWeekday(weekly, 2)).toEqual([]);
    const own = withCopy(weekly, [item("09:00", "Rapor", 5)]);
    expect(own.days).toEqual([5]);
    expect(itemsForWeekday(own, 5)).toHaveLength(1);
    const daily: ProgramShape = { kind: "daily", days: [1, 2], startTime: "00:00", items: [item("08:00", "A")] };
    expect(withCopy(daily, [item("07:00", "B")]).days).toEqual([1, 2]);
    expect(withCopy(daily, null)).toBe(daily);
    expect(itemsForWeekday(daily, 6)).toEqual([]);
  });

  it("FG-1.7 bugünün akışı İstanbul saatine göre; başlamış son madde vurgulanır (karar #254)", () => {
    const day: ProgramShape = { kind: "daily", days: [1, 2, 3, 4, 5], startTime: "00:00", items: [item("08:00", "Başlangıç"), item("12:00", "Öğle"), item("17:00", "Çıkış")] };
    // 2026-11-02 Pazartesi; İstanbul UTC+3
    expect(todayFlow(day, new Date("2026-11-02T04:30:00Z"), TZ)).toMatchObject({ date: "2026-11-02", weekday: 1, current: null, fromYesterday: false });
    expect(todayFlow(day, new Date("2026-11-02T10:00:00Z"), TZ).current).toBe(1);
    expect(todayFlow(day, new Date("2026-11-02T20:59:00Z"), TZ).current).toBe(2);
    expect(todayFlow(day, new Date("2026-11-07T10:00:00Z"), TZ)).toMatchObject({ weekday: 6, items: [], current: null });
  });

  it("FG-1.7 gece vardiyası: başlangıçtan önce dün başlayan vardiya son maddesine kadar sürer (karar #254)", () => {
    const night: ProgramShape = { kind: "daily", days: [1, 2, 3, 4, 5], startTime: "22:00", items: [item("06:00", "Çıkış"), item("22:00", "Devir"), item("02:00", "Mola")] };
    // Salı 03:00 → Pazartesi başlayan vardiya, "Mola" şu an
    const tueNight = todayFlow(night, new Date("2026-11-03T00:00:00Z"), TZ);
    expect(tueNight).toMatchObject({ date: "2026-11-02", weekday: 1, fromYesterday: true, current: 1 });
    expect(tueNight.items.map((i) => i.title)).toEqual(["Devir", "Mola", "Çıkış"]);
    // Salı 07:00: dünün vardiyası bitti → bugünün vardiyası, henüz başlamadı
    expect(todayFlow(night, new Date("2026-11-03T04:00:00Z"), TZ)).toMatchObject({ date: "2026-11-03", weekday: 2, fromYesterday: false, current: null });
    // Salı 23:00 → bugünün vardiyası, "Devir" şu an
    expect(todayFlow(night, new Date("2026-11-03T20:00:00Z"), TZ)).toMatchObject({ date: "2026-11-03", current: 0 });
    // Pazartesi 03:00: Pazar programsız → Pazartesi akışı, henüz başlamadı
    expect(todayFlow(night, new Date("2026-11-02T00:00:00Z"), TZ)).toMatchObject({ date: "2026-11-02", fromYesterday: false, current: null });
    // Cumartesi 03:00: Cuma başlayan vardiya sürer
    expect(todayFlow(night, new Date("2026-11-07T00:00:00Z"), TZ)).toMatchObject({ date: "2026-11-06", weekday: 5, fromYesterday: true });
  });

  it("FG-1.7 tek program herkese; birden çoksa seçilen, seçilmediyse seçim istenir (karar #252)", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    expect(pickProgram([], null)).toEqual({ program: null, needsChoice: false });
    expect(pickProgram([a], null)).toEqual({ program: a, needsChoice: false });
    expect(pickProgram([a], "eski")).toEqual({ program: a, needsChoice: false });
    expect(pickProgram([a, b], "b")).toEqual({ program: b, needsChoice: false });
    expect(pickProgram([a, b], null)).toEqual({ program: null, needsChoice: true });
    expect(pickProgram([a, b], "silinmiş")).toEqual({ program: null, needsChoice: true });
  });

  it("FG-1.7 kopya durumu: program güncellenince kişi karar verir (karar #253)", () => {
    expect(copyState(3, null)).toBe("follows");
    expect(copyState(3, { baseVersion: 3 })).toBe("own");
    expect(copyState(3, { baseVersion: 2 })).toBe("decide");
    expect(sameItems([item("08:00", "A")], [item("08:00", "A")])).toBe(true);
    expect(sameItems([item("08:00", "A")], [item("08:00", "A", null, "not")])).toBe(false);
    expect(sameItems([item("08:00", "A")], [])).toBe(false);
  });

  it("karşılaştırma satırı ve girdi doğrulaması (boşluklar kırpılır, boş not yok sayılır)", () => {
    expect(itemLine(item("08:00", "Toplantı", 1, "Salon"), () => "Pzt")).toBe("Pzt 08:00 Toplantı — Salon");
    expect(itemLine(item("08:00", "Toplantı"))).toBe("08:00 Toplantı");
    const base = { name: " Gece ", kind: "daily", days: [1], startTime: "22:00", items: [{ weekday: null, time: "22:00", title: " Devir ", note: " " }] };
    const parsed = scheduleInputSchema.parse(base);
    expect(parsed.name).toBe("Gece");
    expect(parsed.items[0]).toEqual({ weekday: null, time: "22:00", title: "Devir", note: null });
    expect(scheduleInputSchema.safeParse({ ...base, startTime: "24:00" }).success).toBe(false);
    expect(scheduleInputSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(scheduleInputSchema.safeParse({ ...base, items: [{ ...base.items[0], weekday: 8 }] }).success).toBe(false);
    expect(scheduleInputSchema.safeParse({ ...base, items: [{ ...base.items[0], title: "  " }] }).success).toBe(false);
  });

  it("tarih yardımcıları: İstanbul'da günün dakikası ve ISO haftanın günü", () => {
    expect(minutesIn(TZ, new Date("2026-11-02T21:15:00Z"))).toBe(15);
    expect(minutesIn(TZ, new Date("2026-11-02T20:59:00Z"))).toBe(23 * 60 + 59);
    expect(isoWeekday("2026-11-02")).toBe(1);
    expect(isoWeekday("2026-11-08")).toBe(7);
  });
});
