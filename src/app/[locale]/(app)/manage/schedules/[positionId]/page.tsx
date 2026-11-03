import { Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { orNull } from "@/features/admin/guard";
import { LineDiff } from "@/features/positions/components/diff-view";
import { ScheduleView } from "@/features/schedules/components/schedule-view";
import { schedulesAccess } from "@/features/schedules/guard";
import { Link } from "@/i18n/navigation";
import { itemLine, type ScheduleItem } from "@/lib/schedules";
import { positionSchedules } from "@/server/services/schedules";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("schedules.manage");
  return { title: t("title") };
}

const UUID = /^[0-9a-f-]{36}$/;

/** Pozisyonun (vardiya) programları ve programı kendine göre değiştirenler (kararlar #251, #255). */
export default function Page({ params }: PageProps<"/[locale]/manage/schedules/[positionId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ positionId: string }> }) {
  const access = await schedulesAccess();
  if (!access) return <NotFoundView />;
  const { positionId } = await params;
  if (!UUID.test(positionId)) return <NotFoundView />;
  const data = await orNull(positionSchedules(access.actor, positionId));
  if (!data) return <NotFoundView />;
  const [t, format] = await Promise.all([getTranslations("schedules"), getFormatter()]);
  const dt = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });
  const line = (i: ScheduleItem) => itemLine(i, (d) => t(`daysShort.${d}`));
  const multiple = data.programs.length > 1;
  const notChosen = multiple ? Math.max(0, data.position.people - data.programs.reduce((n, p) => n + p.choosers, 0)) : 0;

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        title={data.position.name}
        description={`${data.position.unitName} · ${t("manage.people", { count: data.position.people })}`}
        back={{ href: "/manage/schedules", label: t("manage.title") }}
        actions={
          <Button nativeButton={false} render={<Link href={`/manage/schedules/${positionId}/new`} />}>
            <Plus aria-hidden="true" />
            {t("manage.new")}
          </Button>
        }
      />

      {data.programs.length === 0 ? (
        <p className="rounded-xl border border-dashed p-5 text-muted-foreground">{t("manage.noPrograms")}</p>
      ) : (
        multiple && (
          <p className="text-sm text-muted-foreground">
            {t("manage.multipleHint")}
            {notChosen > 0 && <strong className="ms-1 font-medium text-foreground">{t("manage.notChosen", { count: notChosen })}</strong>}
          </p>
        )
      )}

      {data.programs.map((p) => (
        <section key={p.id} aria-labelledby={`program-${p.id}`} className="flex flex-col gap-4 rounded-xl border p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h2 id={`program-${p.id}`} className="text-base font-semibold">
                {p.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("manage.updatedAt", { date: dt(p.updatedAt) })}
                {multiple && ` · ${t("manage.choosersCount", { count: p.choosers })}`}
              </p>
            </div>
            <Button variant="outline" nativeButton={false} render={<Link href={`/manage/schedules/${positionId}/${p.id}`} />}>
              <Pencil aria-hidden="true" />
              {t("manage.editProgram")}
            </Button>
          </div>

          <ScheduleView program={p} />

          <section aria-labelledby={`changed-${p.id}`} className="flex flex-col gap-2 border-t pt-4">
            <h3 id={`changed-${p.id}`} className="font-semibold">
              {t("manage.changedTitle")}
            </h3>
            {p.copies.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("manage.changedEmpty")}</p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {p.copies.map((c) => (
                  <li key={c.userId}>
                    <details>
                      <summary className="flex min-h-12 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                        <span className="font-medium">{c.fullName}</span>
                        <span className="text-sm text-muted-foreground">{c.sicilNo}</span>
                        <span className="text-sm text-muted-foreground">{t("manage.changedAt", { date: dt(c.updatedAt) })}</span>
                        {c.state === "decide" && (
                          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-sm text-amber-800 dark:text-amber-300">{t("manage.awaiting")}</span>
                        )}
                      </summary>
                      <div className="flex flex-col gap-2 border-t px-4 py-4">
                        <p className="text-sm text-muted-foreground">{t("manage.diff")}</p>
                        <LineDiff before={p.items.map(line)} after={c.items.map(line)} />
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
      ))}
    </section>
  );
}
