import { FileDown, Filter, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { getSectionUser } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import { toActor } from "@/server/services/auth";
import { canViewReport, parseFilters, REPORT_KINDS, reportFilterOptions, runReport, type ReportKind } from "@/server/services/reports";
import { formatCell, type Translate } from "@/server/services/reports/format";
import { getSettings } from "@/server/services/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sections.reports");
  return { title: t("title") };
}

const PREVIEW = 50;

/** Rapor: filtreler, ekran önizlemesi (ilk 50 satır) ve Excel/PDF indirme (SPEC 10.1). */
export default function Page({ params, searchParams }: PageProps<"/[locale]/reports/[kind]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSectionUser("reports");
  if (!user) return <NotFoundView />;
  const actor = toActor(user);
  const { kind: raw } = await params;
  if (!(REPORT_KINDS as readonly string[]).includes(raw)) return <NotFoundView />;
  const kind = raw as ReportKind;
  if (!canViewReport(actor, kind)) return <NotFoundView />;
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const [t, filters] = await Promise.all([getTranslations("reports"), parseFilters(kind, { from: str("from"), to: str("to"), orgUnitId: str("unit"), positionId: str("position") }).catch(() => null)]);
  if (!filters) {
    return (
      <section className="max-w-4xl">
        <PageHeader title={t(`kinds.${kind}.title`)} back={{ href: "/reports", label: t("back") }} />
        <p role="alert" className="rounded-2xl border border-destructive/40 p-4 text-destructive">
          {(await getTranslations("errors"))("report_range_invalid")}
        </p>
      </section>
    );
  }
  const [result, options, settings] = await Promise.all([
    runReport(actor, kind, filters).catch((err: unknown) => {
      if (err instanceof AppError) return null;
      throw err;
    }),
    reportFilterOptions(actor, kind),
    getSettings(["org.timezone"]),
  ]);
  if (!result) return <NotFoundView />;
  const tz = settings["org.timezone"];
  const tr = t as unknown as Translate;
  const qs = new URLSearchParams({ from: filters.from, to: filters.to, ...(filters.orgUnitId ? { orgUnitId: filters.orgUnitId } : {}), ...(filters.positionId ? { positionId: filters.positionId } : {}) });

  return (
    <section className="flex max-w-6xl flex-col gap-6">
      <PageHeader title={t(`kinds.${kind}.title`)} description={t(`kinds.${kind}.description`)} back={{ href: "/reports", label: t("back") }} />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border p-4" aria-label={t("filters.apply")}>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("filters.from")}</span>
          <Input type="date" name="from" defaultValue={filters.from} className="w-44" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("filters.to")}</span>
          <Input type="date" name="to" defaultValue={filters.to} className="w-44" />
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1">
          <span className="text-sm font-medium">{t("filters.unit")}</span>
          <NativeSelect name="unit" defaultValue={filters.orgUnitId ?? ""}>
            <option value="">{t("filters.all")}</option>
            {options.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.parentName ? `${u.parentName} / ${u.name}` : u.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1">
          <span className="text-sm font-medium">{t("filters.position")}</span>
          <NativeSelect name="position" defaultValue={filters.positionId ?? ""}>
            <option value="">{t("filters.all")}</option>
            {options.positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.unitName}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button type="submit">
          <Filter aria-hidden="true" />
          {t("filters.apply")}
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        {(["xlsx", "pdf"] as const).map((format) => (
          <a
            key={format}
            href={`/api/reports/${kind}?format=${format}&${qs.toString()}`}
            aria-disabled={result.truncated}
            className={`inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 font-medium hover:bg-muted ${result.truncated ? "pointer-events-none opacity-50" : ""}`}
          >
            <FileDown aria-hidden="true" className="size-5" />
            {t(`export.${format}`)}
          </a>
        ))}
      </div>

      {[...result.warnings.map((w) => t(`warnings.${w as "hazard_class_assumed"}`)), ...(result.truncated ? [t("truncated")] : [])].map((w) => (
        <p key={w} role="status" className="flex gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {w}
        </p>
      ))}

      {result.tables.map((tbl) => (
        <section key={tbl.key} aria-labelledby={`t-${tbl.key}`} className="flex flex-col gap-2">
          <h2 id={`t-${tbl.key}`} className="text-lg font-semibold">
            {tr(`kinds.${kind}.tables.${tbl.key}`)}
          </h2>
          {tbl.rows.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-5 text-muted-foreground">{t("empty")}</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-2xl border">
                <table className="w-full min-w-max text-sm">
                  <thead className="bg-muted/50 text-start">
                    <tr>
                      {tbl.columns.map((c) => (
                        <th key={c} scope="col" className="px-3 py-2 text-start font-medium">
                          {tr(`columns.${c}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {tbl.rows.slice(0, PREVIEW).map((r, i) => (
                      <tr key={i}>
                        {r.map((v, j) => (
                          <td key={j} className="max-w-96 px-3 py-2 align-top">
                            {formatCell(tbl.columns[j]!, v, tr, tz)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-muted-foreground">{t("preview", { shown: Math.min(PREVIEW, tbl.rows.length), total: tbl.rows.length })}</p>
            </>
          )}
        </section>
      ))}
    </section>
  );
}
