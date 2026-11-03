import { addDays, isoWeekday, minutesIn, todayIn } from "@/lib/dates";
import { sinceStart, sortItems, toMinutes, weekdaysOf, type ScheduleItem, type ScheduleKind, type Weekday } from "@/lib/schedules";

/**
 * Çalışma programı saf kuralları (iş paketi 3.9, kararlar #251–257).
 *  - Pozisyonun birden çok (vardiya) programı olabilir; tek program varsa herkes onu izler, birden çoksa kişi seçer.
 *  - Kişi programı kendine göre değiştirebilir (kopya). Program güncellenince kopyası eski sürüme göre olan kişi karar verir.
 *  - "Bugünün akışı" vardiyanın başladığı güne göredir: gece yarısını geçen vardiya ertesi sabah da sürer.
 */

export type ProgramShape = {
  kind: ScheduleKind;
  days: readonly number[];
  startTime: string;
  items: readonly ScheduleItem[];
};

export type NormalizedItems = { ok: true; items: ScheduleItem[]; days: Weekday[] } | { ok: false; error: string };

/**
 * Maddeleri programın türüne göre düzenler: günlükte gün alanı boşalır ve en az bir gün seçilmiş olmalı;
 * haftalıkta her maddenin günü olmalı ve günler maddelerden çıkar.
 */
export function normalizeItems(kind: ScheduleKind, items: readonly ScheduleItem[], days: readonly number[], startTime: string): NormalizedItems {
  if (kind === "daily") {
    const unique = [...new Set(days)].filter((d): d is Weekday => Number.isInteger(d) && d >= 1 && d <= 7).sort((a, b) => a - b);
    if (unique.length === 0) return { ok: false, error: "schedule_days_required" };
    return { ok: true, items: sortItems(items.map((i) => ({ ...i, weekday: null })), startTime), days: unique };
  }
  if (items.some((i) => i.weekday === null)) return { ok: false, error: "schedule_weekday_required" };
  return { ok: true, items: sortItems(items, startTime), days: weekdaysOf(items) };
}

/** Kişinin kopyası varsa onun maddeleriyle program (haftalıkta günler kopyadan çıkar). */
export function withCopy(program: ProgramShape, copyItems: readonly ScheduleItem[] | null): ProgramShape {
  if (!copyItems) return program;
  return { ...program, items: copyItems, days: program.kind === "weekly" ? weekdaysOf(copyItems) : program.days };
}

/** Bir günün maddeleri (vardiyanın başladığı güne göre), saat sırasıyla. */
export function itemsForWeekday(program: ProgramShape, weekday: number): ScheduleItem[] {
  if (program.kind === "daily") return program.days.includes(weekday) ? sortItems(program.items, program.startTime) : [];
  return sortItems(
    program.items.filter((i) => i.weekday === weekday),
    program.startTime,
  );
}

export type TodayFlow = {
  /** Vardiyanın başladığı takvim günü ("YYYY-MM-DD"). */
  date: string;
  weekday: Weekday;
  items: ScheduleItem[];
  /** Başlamış son maddenin sırası; henüz hiçbiri başlamadıysa boş. */
  current: number | null;
  /** Dün başlayıp hâlâ süren (gece yarısını geçen) vardiya mı? */
  fromYesterday: boolean;
};

function currentIndex(items: readonly ScheduleItem[], startTime: string, elapsed: number): number | null {
  let index: number | null = null;
  items.forEach((item, i) => {
    if (sinceStart(item.time, startTime) <= elapsed) index = i;
  });
  return index;
}

/**
 * Şu anki vardiya akışı (karar #254). Vardiya başlangıcından önceysek ve dün başlayan vardiyanın son maddesi henüz
 * geçmediyse dünün akışı gösterilir (ör. 22:00'de başlayan vardiya için gece 02:00); aksi halde bugünün akışı.
 */
export function todayFlow(program: ProgramShape, now: Date, timeZone: string): TodayFlow {
  const today = todayIn(timeZone, now);
  const nowMin = minutesIn(timeZone, now);
  const start = toMinutes(program.startTime);
  if (nowMin < start) {
    const yesterday = addDays(today, -1);
    const yWeekday = isoWeekday(yesterday);
    const yItems = itemsForWeekday(program, yWeekday);
    const elapsed = nowMin + 1440 - start;
    if (yItems.length > 0 && elapsed <= sinceStart(yItems.at(-1)!.time, program.startTime)) {
      return { date: yesterday, weekday: yWeekday, items: yItems, current: currentIndex(yItems, program.startTime, elapsed), fromYesterday: true };
    }
  }
  const weekday = isoWeekday(today);
  const items = itemsForWeekday(program, weekday);
  const elapsed = nowMin - start;
  return { date: today, weekday, items, current: elapsed < 0 ? null : currentIndex(items, program.startTime, elapsed), fromYesterday: false };
}

/** Pozisyonun programlarından kişininki: tek program varsa o, birden çoksa seçtiği (seçmediyse seçim istenir). */
export function pickProgram<T extends { id: string }>(programs: readonly T[], choiceId: string | null): { program: T | null; needsChoice: boolean } {
  if (programs.length === 0) return { program: null, needsChoice: false };
  if (programs.length === 1) return { program: programs[0]!, needsChoice: false };
  const chosen = programs.find((p) => p.id === choiceId) ?? null;
  return { program: chosen, needsChoice: chosen === null };
}

export type CopyState = "follows" | "own" | "decide";

/** Kopya yok: pozisyon programını izler. Kopya eski sürüme göreyse kişi karar verir (karar #253). */
export function copyState(programVersion: number, copy: { baseVersion: number } | null): CopyState {
  if (!copy) return "follows";
  return copy.baseVersion < programVersion ? "decide" : "own";
}

/** İki madde listesi aynı mı (sıra ve içerik)? Kopya pozisyon programıyla aynıysa ayrıca saklanmaz. */
export function sameItems(a: readonly ScheduleItem[], b: readonly ScheduleItem[]): boolean {
  return (
    a.length === b.length &&
    a.every((x, i) => {
      const y = b[i]!;
      return x.weekday === y.weekday && x.time === y.time && x.title === y.title && (x.note ?? null) === (y.note ?? null);
    })
  );
}
