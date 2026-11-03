import { z } from "zod";

/**
 * Çalışma programı (iş paketi 3.9, kararlar #251–257): istemci ve sunucunun ortak tipleri ve doğrulaması.
 * Günler ISO numarasıdır (1 = Pazartesi … 7 = Pazar). Saatler "SS:DD" (24 saat).
 * Program yalnızca yol gösterir; uyulup uyulmadığı izlenmez.
 */

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const SCHEDULE_KINDS = ["daily", "weekly"] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

/** Günlük programda `weekday` boştur (seçilen her gün aynı akış); haftalıkta maddenin günüdür. */
export type ScheduleItem = { weekday: Weekday | null; time: string; title: string; note: string | null };

/** Girdi sınırları (teknik doğrulama; iş kuralı eşiği değildir). */
export const SCHEDULE_LIMITS = { name: 60, title: 120, note: 300, items: 100 } as const;

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h! * 60 + m!;
}

/** Vardiya başlangıcından bu yana geçen dakika: gece yarısını geçen vardiyada ertesi sabahın saatleri sona düşer. */
export function sinceStart(time: string, startTime: string): number {
  return (toMinutes(time) - toMinutes(startTime) + 1440) % 1440;
}

/** Gün, sonra vardiya başlangıcına göre saat, sonra başlık sırası. */
export function sortItems(items: readonly ScheduleItem[], startTime: string): ScheduleItem[] {
  return [...items].sort(
    (a, b) =>
      (a.weekday ?? 0) - (b.weekday ?? 0) ||
      sinceStart(a.time, startTime) - sinceStart(b.time, startTime) ||
      a.title.localeCompare(b.title, "tr"),
  );
}

/** Haftalık programın (ya da kopyasının) madde bulunan günleri. */
export function weekdaysOf(items: readonly ScheduleItem[]): Weekday[] {
  return WEEKDAYS.filter((d) => items.some((i) => i.weekday === d));
}

/** Karşılaştırma satırı: "Pzt 08:00 Toplantı — not" (gün etiketi çağıran tarafından verilir). */
export function itemLine(item: ScheduleItem, dayLabel?: (d: Weekday) => string): string {
  const day = item.weekday && dayLabel ? `${dayLabel(item.weekday)} ` : "";
  return `${day}${item.time} ${item.title}${item.note ? ` — ${item.note}` : ""}`;
}

const itemSchema = z.object({
  weekday: z
    .number()
    .int()
    .min(1)
    .max(7)
    .transform((v) => v as Weekday)
    .nullable(),
  time: z.string().regex(TIME_RE),
  title: z.string().trim().min(1).max(SCHEDULE_LIMITS.title),
  note: z
    .string()
    .trim()
    .max(SCHEDULE_LIMITS.note)
    .nullable()
    .transform((v) => v || null),
});

export const scheduleItemsSchema = z.array(itemSchema).min(1).max(SCHEDULE_LIMITS.items);

export const scheduleInputSchema = z.object({
  name: z.string().trim().min(1).max(SCHEDULE_LIMITS.name),
  kind: z.enum(SCHEDULE_KINDS),
  days: z.array(z.number().int().min(1).max(7)).max(7),
  startTime: z.string().regex(TIME_RE),
  items: scheduleItemsSchema,
});

export type ScheduleInput = z.infer<typeof scheduleInputSchema>;
