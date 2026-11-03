import { ArrowRightLeft, Check, ChevronDown, Pencil, RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { ActionButton } from "@/components/forms/action-button";
import { Button } from "@/components/ui/button";
import { LineDiff } from "@/features/positions/components/diff-view";
import { keepMyScheduleAction, revertMyScheduleAction } from "@/features/schedules/actions";
import { ChooseShift, ScheduleView, StateBadge, TodayFlowView } from "@/features/schedules/components/schedule-view";
import { Link } from "@/i18n/navigation";
import { itemLine, type ScheduleItem } from "@/lib/schedules";
import { getSectionUser } from "@/server/auth/current-user";
import { toActor } from "@/server/services/auth";
import { homeFlowOf, mySchedule } from "@/server/services/schedules";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("schedules");
  return { title: t("title") };
}

/** Programım (iş paketi 3.9): vardiya seçimi, bugünün akışı, programın tamamı ve kişinin kendi değişiklikleri. */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const user = await getSectionUser("schedule");
  if (!user) return <NotFoundView />;
  const [t, schedule] = await Promise.all([getTranslations("schedules"), mySchedule(toActor(user))]);
  const home = await homeFlowOf(schedule);
  const current = schedule.current;
  const line = (i: ScheduleItem) => itemLine(i, (d) => t(`daysShort.${d}`));
  const empty = !schedule.positionName ? t("noPosition") : schedule.programs.length === 0 ? t("none") : null;

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={t("title")} description={schedule.positionName ? t("positionLabel", { name: schedule.positionName }) : undefined} />

      {empty && <p className="rounded-xl border border-dashed p-5 text-muted-foreground">{empty}</p>}

      {schedule.needsChoice && (
        <section aria-labelledby="choose-heading" className="flex flex-col gap-3 rounded-xl border p-4">
          <h2 id="choose-heading" className="text-base font-semibold">
            {t("choose.title")}
          </h2>
          <p className="text-muted-foreground">{t("choose.hint")}</p>
          <ChooseShift programs={schedule.programs} />
        </section>
      )}

      {current && (
        <>
          {current.state === "decide" && current.copyItems && (
            <section aria-labelledby="decide-heading" className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
              <h2 id="decide-heading" className="text-base font-semibold">
                {t("decide.title", { name: current.name })}
              </h2>
              <p>{t("decide.hint")}</p>
              <details className="rounded-xl border bg-background">
                <summary className="flex min-h-12 cursor-pointer items-center px-4 font-medium">{t("decide.diff")}</summary>
                <div className="border-t p-4">
                  <LineDiff before={current.copyItems.map(line)} after={current.items.map(line)} />
                </div>
              </details>
              <div className="flex flex-wrap gap-2">
                <ActionButton variant="default" action={revertMyScheduleAction.bind(null, current.id)}>
                  <ArrowRightLeft aria-hidden="true" />
                  {t("decide.switch")}
                </ActionButton>
                <ActionButton action={keepMyScheduleAction.bind(null, current.id)}>
                  <Check aria-hidden="true" />
                  {t("decide.keep")}
                </ActionButton>
              </div>
            </section>
          )}

          {schedule.programs.length > 1 && (
            <section aria-label={t("choose.current", { name: current.name })} className="flex flex-col gap-1 rounded-xl border p-4">
              <p className="font-medium">{t("choose.current", { name: current.name })}</p>
              <details className="group">
                <summary className="flex min-h-12 cursor-pointer items-center gap-2 font-medium underline-offset-4 hover:underline">
                  <ChevronDown aria-hidden="true" className="size-5 transition-transform group-open:rotate-180" />
                  {t("choose.change")}
                </summary>
                <div className="pt-2">
                  <ChooseShift programs={schedule.programs} currentId={current.id} />
                </div>
              </details>
            </section>
          )}

          {home.state === "flow" && (
            <section aria-labelledby="today-heading" className="flex flex-col gap-3">
              <h2 id="today-heading" className="text-base font-semibold">
                {t("today.title")}
              </h2>
              <TodayFlowView home={home} />
            </section>
          )}

          <section aria-labelledby="program-heading" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="program-heading" className="flex-1 text-base font-semibold">
                {t("programHeading")}
              </h2>
              <StateBadge state={current.state} />
            </div>
            <ScheduleView program={current.effective} />
            <div className="flex flex-wrap items-start gap-2">
              <Button variant="outline" nativeButton={false} render={<Link href={`/schedule/edit/${current.id}`} />}>
                <Pencil aria-hidden="true" />
                {t("edit")}
              </Button>
              {current.state === "own" && (
                <ActionButton variant="ghost" confirmText={t("revertConfirm")} action={revertMyScheduleAction.bind(null, current.id)}>
                  <RotateCcw aria-hidden="true" />
                  {t("revert")}
                </ActionButton>
              )}
            </div>
          </section>

          <p className="text-sm text-muted-foreground">{t("guidance")}</p>
        </>
      )}
    </section>
  );
}
