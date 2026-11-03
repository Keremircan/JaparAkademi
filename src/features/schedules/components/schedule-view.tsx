import { CalendarCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/forms/action-button";
import { sortItems, toMinutes, WEEKDAYS, type ScheduleItem, type Weekday } from "@/lib/schedules";
import type { HomeFlow } from "@/server/services/schedules";
import { itemsForWeekday, type CopyState, type ProgramShape } from "@/server/state/schedules";
import { chooseScheduleAction } from "../actions";

/** Gece yarısını geçen vardiyada başlangıçtan önceki saatler ertesi güne düşer. */
const isNextDay = (time: string, startTime: string) => toMinutes(time) < toMinutes(startTime);

async function ItemList({ items, startTime, current }: { items: readonly ScheduleItem[]; startTime: string; current?: number | null }) {
  const t = await getTranslations("schedules");
  return (
    <ol className="divide-y overflow-hidden rounded-xl border">
      {items.map((item, i) => {
        const now = current === i;
        return (
          <li key={i} aria-current={now ? "time" : undefined} className={`flex gap-3 px-4 py-3 ${now ? "bg-primary/10" : ""}`}>
            <span className="w-14 shrink-0 font-medium tabular-nums">{item.time}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-medium">{item.title}</span>
              {item.note && <span className="text-sm text-muted-foreground">{item.note}</span>}
              {isNextDay(item.time, startTime) && <span className="text-sm text-muted-foreground">{t("nextDay")}</span>}
            </span>
            {now && <span className="self-start rounded-full bg-primary px-2.5 py-0.5 text-sm text-primary-foreground">{t("today.now")}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** Programın tamamı: günlükte geçerli günler + tek akış, haftalıkta gün gün akış. */
export async function ScheduleView({ program }: { program: ProgramShape }) {
  const t = await getTranslations("schedules");
  const short = (d: number) => t(`daysShort.${d as Weekday}`);
  return (
    <div className="flex flex-col gap-4">
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>{t(`kinds.${program.kind}`)}</span>
        {program.kind === "daily" && <span>{t("dailyDays", { days: program.days.map(short).join(", ") })}</span>}
        {program.startTime !== "00:00" && <span>{t("startsAt", { time: program.startTime })}</span>}
      </p>
      {program.kind === "daily" ? (
        <ItemList items={sortItems(program.items, program.startTime)} startTime={program.startTime} />
      ) : (
        WEEKDAYS.filter((d) => program.items.some((i) => i.weekday === d)).map((d) => (
          <section key={d} className="flex flex-col gap-2">
            <h3 className="font-semibold">{t(`days.${d}`)}</h3>
            <ItemList items={itemsForWeekday(program, d)} startTime={program.startTime} />
          </section>
        ))
      )}
    </div>
  );
}

/** Şu anki vardiyanın akışı; başlamış son madde vurgulanır. */
export async function TodayFlowView({ home }: { home: Extract<HomeFlow, { state: "flow" }> }) {
  const t = await getTranslations("schedules");
  const notes = [
    home.multiple ? t("today.shift", { name: home.name }) : null,
    home.flow.fromYesterday ? t("today.night", { day: t(`days.${home.flow.weekday}`) }) : null,
    home.own ? t("status.own") : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-3">
      {notes.length > 0 && <p className="text-sm text-muted-foreground">{notes.join(" · ")}</p>}
      {home.flow.items.length === 0 ? (
        <p className="text-muted-foreground">{t("today.empty")}</p>
      ) : (
        <ItemList items={home.flow.items} startTime={home.startTime} current={home.flow.current} />
      )}
    </div>
  );
}

/** Vardiya seçimi düğmeleri (karar #252). */
export async function ChooseShift({ programs, currentId }: { programs: readonly { id: string; name: string }[]; currentId?: string }) {
  const t = await getTranslations("schedules.choose");
  return (
    <ul className="flex flex-wrap gap-2">
      {programs
        .filter((p) => p.id !== currentId)
        .map((p) => (
          <li key={p.id}>
            <ActionButton action={chooseScheduleAction.bind(null, p.id)}>
              <CalendarCheck aria-hidden="true" />
              {t("select", { name: p.name })}
            </ActionButton>
          </li>
        ))}
    </ul>
  );
}

const STATE_STYLE: Record<CopyState, string> = {
  follows: "bg-muted",
  own: "bg-primary/10 text-primary",
  decide: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
};

export async function StateBadge({ state }: { state: CopyState }) {
  const t = await getTranslations("schedules.status");
  return <span className={`rounded-full px-2.5 py-0.5 text-sm ${STATE_STYLE[state]}`}>{t(state)}</span>;
}
