import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { MyScheduleForm } from "@/features/schedules/components/my-schedule-form";
import type { Weekday } from "@/lib/schedules";
import { getSectionUser } from "@/server/auth/current-user";
import { toActor } from "@/server/services/auth";
import { mySchedule } from "@/server/services/schedules";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("schedules.editor");
  return { title: t("title") };
}

/** Kişinin programını kendine göre değiştirmesi (karar #253); yalnızca şu anki (seçili) vardiya programı. */
export default function Page({ params }: PageProps<"/[locale]/schedule/edit/[scheduleId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ scheduleId: string }> }) {
  const user = await getSectionUser("schedule");
  if (!user) return <NotFoundView />;
  const { scheduleId } = await params;
  const [t, schedule] = await Promise.all([getTranslations("schedules"), mySchedule(toActor(user))]);
  const current = schedule.current;
  if (!current || current.id !== scheduleId) return <NotFoundView />;

  return (
    <section className="flex max-w-3xl flex-col gap-2">
      <PageHeader title={t("editor.title")} description={t("editor.description")} back={{ href: "/schedule", label: t("title") }} />
      <p className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{current.name}</span>
        <span>{t(`kinds.${current.kind}`)}</span>
        {current.kind === "daily" && <span>{t("dailyDays", { days: current.days.map((d) => t(`daysShort.${d as Weekday}`)).join(", ") })}</span>}
        {current.startTime !== "00:00" && <span>{t("startsAt", { time: current.startTime })}</span>}
      </p>
      <MyScheduleForm scheduleId={current.id} kind={current.kind} startTime={current.startTime} items={current.copyItems ?? current.items} />
    </section>
  );
}
