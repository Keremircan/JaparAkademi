import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { schedulesAccess } from "@/features/schedules/guard";
import { Link } from "@/i18n/navigation";
import { scheduleOverview, type ScheduleOverviewRow } from "@/server/services/schedules";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("schedules.manage");
  return { title: t("title") };
}

/** Çalışma programları: pozisyonlar birim birim, programları ve kendine göre değiştiren sayısıyla (iş paketi 3.9). */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const access = await schedulesAccess();
  if (!access) return <NotFoundView />;
  const [t, tNav, rows] = await Promise.all([getTranslations("schedules"), getTranslations("sections.manage"), scheduleOverview(access.actor)]);
  const units = Map.groupBy(rows, (r) => r.unitName);

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <PageHeader title={t("manage.title")} description={t("manage.description")} back={{ href: "/manage", label: tNav("title") }} />
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-5 text-muted-foreground">{t("manage.empty")}</p>
      ) : (
        [...units].map(([unit, positions]) => (
          <section key={unit} aria-label={unit} className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">{unit}</h2>
            <ul className="divide-y rounded-xl border">
              {positions.map((p) => (
                <li key={p.positionId}>
                  <PositionRow row={p} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}

async function PositionRow({ row }: { row: ScheduleOverviewRow }) {
  const t = await getTranslations("schedules");
  const changed = row.programs.reduce((n, p) => n + p.copies, 0);
  return (
    <Link href={`/manage/schedules/${row.positionId}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-muted">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-medium">{row.positionName}</span>
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>{t("manage.people", { count: row.people })}</span>
          {row.programs.length === 0 ? (
            <span>{t("manage.noProgram")}</span>
          ) : (
            <span>{row.programs.map((p) => `${p.name} (${t(`kinds.${p.kind}`)})`).join(", ")}</span>
          )}
          {changed > 0 && <span>{t("manage.changedCount", { count: changed })}</span>}
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
