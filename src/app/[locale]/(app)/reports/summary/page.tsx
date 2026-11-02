import { ChevronRight, FileDown, Filter, Info, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { TrendCharts, type TrendDatum } from "@/features/reports/components/trend-charts";
import { Link } from "@/i18n/navigation";
import { getSectionUser } from "@/server/auth/current-user";
import { orgScopeFor } from "@/server/authz/scope";
import { AppError } from "@/server/errors";
import { toActor } from "@/server/services/auth";
import { canViewReport, type ReportKind } from "@/server/services/reports";
import { formatDate } from "@/server/services/reports/format";
import { canViewSummary, managementSummary, parseSummaryFilters, summaryUnitOptions } from "@/server/services/reports/summary";
import { monthLabel } from "@/server/services/reports/summary-export";
import { getSettings } from "@/server/services/settings";
import { addDays, todayIn } from "@/lib/dates";
import { toAppLocale } from "@/lib/locale";
import { addMonths, monthRange } from "@/server/state/reports";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reports.summary");
  return { title: t("title") };
}

/** Yönetim özeti (iş paketi 3.5, kararlar #237–240): göstergeler, son 12 ayın eğilimi ve Excel. Kişi adı yoktur. */
export default function Page({ searchParams }: PageProps<"/[locale]/reports/summary">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

type Tile = {
  key: string;
  label: string;
  value: string;
  detail?: string | null;
  basis: "now" | "period";
  /** Sayı sıfırdan büyükse dikkat simgesi (renk tek başına anlam taşımaz). */
  attention?: boolean;
  href?: string | null;
};

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSectionUser("reports");
  if (!user) return <NotFoundView />;
  const actor = toActor(user);
  if (!canViewSummary(actor)) return <NotFoundView />;
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const [t, tr, te, locale, filters] = await Promise.all([
    getTranslations("reports.summary"),
    getTranslations("reports"),
    getTranslations("errors"),
    getLocale(),
    parseSummaryFilters({ from: str("from"), to: str("to"), orgUnitId: str("unit") }).catch(() => null),
  ]);
  const back = { href: "/reports", label: tr("back") };
  if (!filters) {
    return (
      <section className="max-w-4xl">
        <PageHeader title={t("title")} back={back} />
        <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-destructive">
          {te("report_range_invalid")}
        </p>
      </section>
    );
  }
  const [summary, units, scope, settings] = await Promise.all([
    managementSummary(actor, filters).catch((err: unknown) => {
      if (err instanceof AppError) return null;
      throw err;
    }),
    summaryUnitOptions(actor),
    orgScopeFor(actor),
    getSettings(["org.timezone"]),
  ]);
  if (!summary) return <NotFoundView />;
  const appLocale = toAppLocale(locale);
  const tz = settings["org.timezone"];
  const today = todayIn(tz);
  const num = new Intl.NumberFormat(appLocale === "en" ? "en-GB" : "tr-TR", { maximumFractionDigits: 1 });
  const unitQs = filters.orgUnitId ? `&unit=${filters.orgUnitId}` : "";
  const periodQs = `from=${filters.from}&to=${filters.to}${unitQs}`;
  const link = (kind: ReportKind, qs: string) => (canViewReport(actor, kind) ? `/reports/${kind}${qs ? `?${qs}` : ""}` : null);
  const unitOnly = filters.orgUnitId ? `unit=${filters.orgUnitId}` : "";
  const rate = (r: number | null) => (r === null ? t("kpi.none") : t("kpi.rate", { rate: r }));

  const training: Tile[] = [];
  if (summary.current && summary.period) {
    const c = summary.current;
    const p = summary.period;
    training.push(
      { key: "active", label: t("kpi.activeTrainees"), value: num.format(c.activeTrainees), basis: "now", href: link("training", unitOnly) },
      { key: "awaiting", label: t("kpi.awaitingReadiness"), value: num.format(c.awaitingReadiness), basis: "now", href: link("training", unitOnly) },
      { key: "overdue", label: t("kpi.overdue"), value: num.format(c.overdue), basis: "now", attention: c.overdue > 0, href: link("training", unitOnly) },
      { key: "approved", label: t("kpi.readinessApproved"), value: num.format(p.readinessApproved), basis: "period", href: link("onboarding", periodQs) },
      {
        key: "onboarding",
        label: t("kpi.onboardingDays"),
        value: p.onboarding.avg === null ? t("kpi.none") : t("kpi.days", { days: num.format(p.onboarding.avg) }),
        detail: p.onboarding.median === null ? null : t("kpi.onboardingDetail", { median: num.format(p.onboarding.median), count: p.onboarding.count }),
        basis: "period",
        href: link("onboarding", periodQs),
      },
      {
        key: "firstPass",
        label: t("kpi.firstPass"),
        value: rate(summary.exams.rate),
        detail: summary.exams.attempts ? t("kpi.firstPassDetail", { attempts: summary.exams.attempts, passed: summary.exams.passed }) : null,
        basis: "period",
        href: link("exams", periodQs),
      },
      { key: "modules", label: t("kpi.modulesCompleted"), value: num.format(p.modulesCompleted), basis: "period" },
    );
  }
  const o = summary.ohs;
  const ohs: Tile[] = [
    {
      key: "expired",
      label: t("kpi.ohsExpired"),
      value: num.format(o.expired),
      basis: "now",
      attention: o.expired > 0,
      href: o.oldestExpired ? link("expiring", `from=${o.oldestExpired}&to=${addDays(today, -1)}${unitQs}`) : null,
    },
    ...o.expiring.map((w) => ({
      key: `d${w.days}`,
      label: t("kpi.ohsExpiring", { days: w.days }),
      value: num.format(w.count),
      basis: "now" as const,
      href: link("expiring", `from=${today}&to=${addDays(today, w.days)}${unitQs}`),
    })),
    { key: "ohsCompleted", label: t("kpi.ohsCompleted"), value: num.format(o.completed), basis: "period", href: link("ohs", periodQs) },
    ...(summary.mode === "ohs"
      ? [
          {
            key: "firstPassOhs",
            label: t("kpi.firstPassOhs"),
            value: rate(summary.exams.rate),
            detail: summary.exams.attempts ? t("kpi.firstPassDetail", { attempts: summary.exams.attempts, passed: summary.exams.passed }) : null,
            basis: "period" as const,
          },
        ]
      : []),
  ];

  // Hızlı dönemler (birim seçimi korunur)
  const thisMonth = today.slice(0, 7);
  const presets = [
    { key: "thisMonth", from: `${thisMonth}-01`, to: today },
    { key: "lastMonth", ...monthRange(addMonths(thisMonth, -1)) },
    { key: "last90", from: addDays(today, -90), to: today },
    { key: "thisYear", from: `${today.slice(0, 4)}-01-01`, to: today },
  ] as const;

  const trend: TrendDatum[] = summary.trend.map((p) => ({
    label: new Intl.DateTimeFormat(appLocale === "en" ? "en-GB" : "tr-TR", { month: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(+p.month.slice(0, 4), +p.month.slice(5, 7) - 1, 15, 12)),
    ),
    title: p.partial ? `${monthLabel(p.month, appLocale)} (${t("trend.partial")})` : monthLabel(p.month, appLocale),
    partial: p.partial,
    completed: p.completed,
    completedText: num.format(p.completed),
    rate: p.rate,
    rateText: p.rate === null ? t("trend.noExams") : t("kpi.rate", { rate: p.rate }),
    rateDetail: p.attempts ? t("kpi.firstPassDetail", { attempts: p.attempts, passed: p.passed }) : null,
  }));
  const ohsView = summary.mode === "ohs";
  const first = summary.trend[0]!;
  const last = summary.trend[summary.trend.length - 1]!;
  const range = { from: monthLabel(first.month, appLocale), to: monthLabel(last.month, appLocale) };
  const completedTitle = t(ohsView ? "trend.completedOhs" : "trend.completed");
  const rateTitle = t(ohsView ? "trend.rateOhs" : "trend.rate");
  const labels = { now: t("groups.now"), period: t("groups.period"), attention: t("kpi.attention"), open: t("kpi.open") };

  return (
    <section className="flex max-w-6xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} back={back} />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border p-4" aria-label={tr("filters.apply")}>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{tr("filters.from")}</span>
          <Input type="date" name="from" defaultValue={filters.from} className="w-44" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{tr("filters.to")}</span>
          <Input type="date" name="to" defaultValue={filters.to} className="w-44" />
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1">
          <span className="text-sm font-medium">{tr("filters.unit")}</span>
          <NativeSelect name="unit" defaultValue={filters.orgUnitId ?? ""}>
            <option value="">{tr("filters.all")}</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.parentName ? `${u.parentName} / ${u.name}` : u.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button type="submit">
          <Filter aria-hidden="true" />
          {tr("filters.apply")}
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t("quick.label")} className="flex flex-wrap gap-2">
          {presets.map((p) => {
            const current = p.from === filters.from && p.to === filters.to;
            return (
              <Link
                key={p.key}
                href={`/reports/summary?from=${p.from}&to=${p.to}${unitQs}`}
                aria-current={current ? "page" : undefined}
                className={`inline-flex min-h-12 items-center rounded-lg border px-4 font-medium hover:bg-muted ${current ? "border-foreground bg-muted" : ""}`}
              >
                {t(`quick.${p.key}`)}
              </Link>
            );
          })}
        </nav>
        <a href={`/api/reports/summary?${periodQs}`} className="inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 font-medium hover:bg-muted">
          <FileDown aria-hidden="true" className="size-5" />
          {t("export")}
        </a>
      </div>

      <p className="text-sm text-muted-foreground">
        {tr("meta.range", { from: formatDate(filters.from, tz), to: formatDate(filters.to, tz) })}
      </p>

      {(ohsView || !scope.all) && (
        <p role="note" className="flex gap-2 rounded-xl border p-4 text-sm">
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          {ohsView ? t("ohsOnly") : t("scopeNote")}
        </p>
      )}

      {training.length > 0 && <TileGroup id="training" title={t("groups.training")} tiles={training} labels={labels} />}
      <TileGroup id="ohs" title={t("groups.ohs")} tiles={ohs} labels={labels} />

      <section aria-labelledby="trend-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="trend-heading" className="text-base font-semibold">
            {t("trend.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("trend.description", range)}</p>
          {last.partial && <p className="text-sm text-muted-foreground">{t("trend.partialNote", { month: monthLabel(last.month, appLocale) })}</p>}
        </div>
        <TrendCharts
          data={trend}
          locale={appLocale}
          rateTicks={[t("kpi.rate", { rate: 0 }), t("kpi.rate", { rate: 50 }), t("kpi.rate", { rate: 100 })]}
          completed={{ title: completedTitle, aria: t("trend.chartAria", { title: completedTitle, ...range }), keyboard: t("trend.keyboard", { title: completedTitle }), empty: t("trend.empty") }}
          rate={{ title: rateTitle, aria: t("trend.chartAria", { title: rateTitle, ...range }), keyboard: t("trend.keyboard", { title: rateTitle }), empty: t("trend.noExams") }}
        />
        <details className="rounded-xl border">
          <summary className="flex min-h-12 cursor-pointer items-center px-4 font-medium">{t("trend.table")}</summary>
          <div className="overflow-x-auto border-t">
            <table className="w-full min-w-[32rem] text-sm">
              <caption className="sr-only">{t("trend.title")}</caption>
              <thead className="bg-muted/50">
                <tr>
                  {[t("trend.month"), completedTitle, t("trend.attempts"), t("trend.passed"), rateTitle].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 text-start align-bottom font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y tabular-nums">
                {summary.trend.map((p, i) => (
                  <tr key={p.month}>
                    <th scope="row" className="px-3 py-2 text-start font-normal">
                      {trend[i]!.title}
                    </th>
                    <td className="px-3 py-2">{trend[i]!.completedText}</td>
                    <td className="px-3 py-2">{num.format(p.attempts)}</td>
                    <td className="px-3 py-2">{num.format(p.passed)}</td>
                    <td className="px-3 py-2">{trend[i]!.rateText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </section>
  );
}

function TileGroup({
  id,
  title,
  tiles,
  labels,
}: {
  id: string;
  title: string;
  tiles: Tile[];
  labels: { now: string; period: string; attention: string; open: string };
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3">
      <h2 id={`${id}-heading`} className="text-base font-semibold">
        {title}
      </h2>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => {
          const body = (
            <>
              <span className="flex items-start gap-2 text-sm text-muted-foreground">
                {tile.attention && (
                  <>
                    <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="sr-only">{labels.attention}:</span>
                  </>
                )}
                <span>{tile.label}</span>
              </span>
              <span className="text-3xl font-semibold">{tile.value}</span>
              {tile.detail && <span className="text-sm text-muted-foreground">{tile.detail}</span>}
              <span className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
                {tile.basis === "now" ? labels.now : labels.period}
                {tile.href && (
                  <span className="flex items-center gap-1 font-medium text-foreground">
                    {labels.open}
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </span>
                )}
              </span>
            </>
          );
          return (
            <li key={tile.key} className="flex">
              {tile.href ? (
                <Link href={tile.href} className="flex min-h-32 w-full flex-col gap-1 rounded-xl border bg-card p-4 hover:bg-muted">
                  {body}
                </Link>
              ) : (
                <div className="flex min-h-32 w-full flex-col gap-1 rounded-xl border bg-card p-4">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
