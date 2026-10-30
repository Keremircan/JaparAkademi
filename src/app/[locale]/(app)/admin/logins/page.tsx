import { Download, Filter } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { adminAccess } from "@/features/admin/guard";
import { Link } from "@/i18n/navigation";
import { listLoginAttempts } from "@/server/services/login-log";
import { LOGIN_FAILURE_RESULTS, LOGIN_RESULTS } from "@/server/state/login-log";
import { parseLoginLogFilters, loginLogQuery } from "@/features/admin/login-log-filters";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("logins");
  return { title: t("title") };
}

/** Giriş kayıtları (karar #215): sistem yöneticisi ve üst yönetici, salt okunur. */
export default function Page({ searchParams }: PageProps<"/[locale]/admin/logins">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

const FAILED = new Set<string>(LOGIN_FAILURE_RESULTS);

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await adminAccess("logins.view");
  if (!access) return <NotFoundView />;
  const sp = await searchParams;
  const filters = parseLoginLogFilters(sp);
  const page = Number(typeof sp.page === "string" ? sp.page : "") || 1;
  const [t, tNav, format, data] = await Promise.all([
    getTranslations("logins"),
    getTranslations("sections.admin"),
    getFormatter(),
    listLoginAttempts(access.actor, filters, page),
  ]);
  const link = (p: number) => `/admin/logins?${loginLogQuery(filters, { page: String(p) })}`;
  const total = Object.values(data.summary).reduce((a, b) => a + (b ?? 0), 0);
  const failed = LOGIN_FAILURE_RESULTS.reduce((a, r) => a + (data.summary[r] ?? 0), 0);

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} back={{ href: "/admin", label: tNav("title") }} />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border p-4" aria-label={t("filters.apply")}>
        <label className="flex min-w-60 flex-1 flex-col gap-1">
          <span className="text-sm font-medium">{t("filters.q")}</span>
          <Input name="q" type="search" defaultValue={filters.q ?? ""} maxLength={100} />
        </label>
        <label className="flex min-w-48 flex-col gap-1">
          <span className="text-sm font-medium">{t("filters.result")}</span>
          <NativeSelect name="result" defaultValue={filters.result ?? ""}>
            <option value="">{t("filters.all")}</option>
            <option value="failed">{t("filters.failed")}</option>
            {LOGIN_RESULTS.map((r) => (
              <option key={r} value={r}>
                {t(`results.${r}`)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("filters.from")}</span>
          <Input type="date" name="from" defaultValue={filters.from ?? ""} className="w-44" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("filters.to")}</span>
          <Input type="date" name="to" defaultValue={filters.to ?? ""} className="w-44" />
        </label>
        <Button type="submit">
          <Filter aria-hidden="true" />
          {t("filters.apply")}
        </Button>
      </form>

      {sp.error === "too_large" && (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
          {t("tooLarge")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-muted-foreground">{t("summary", { total, failed })}</p>
        <Button variant="outline" nativeButton={false} render={<a href={`/api/admin/logins?${loginLogQuery(filters)}`} download />}>
          <Download aria-hidden="true" />
          {t("export")}
        </Button>
      </div>
      {total > 0 && (
        <ul aria-label={t("byResult")} className="flex flex-wrap gap-2">
          {LOGIN_RESULTS.filter((r) => data.summary[r]).map((r) => (
            <li key={r} className={`rounded-full px-3 py-1 text-sm ${FAILED.has(r) ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>
              {t(`results.${r}`)}: {data.summary[r]}
            </li>
          ))}
        </ul>
      )}

      {data.entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-2xl border">
          {data.entries.map((e) => (
            <li key={e.id}>
              <details>
                <summary className="flex min-h-14 cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
                  <span className="font-mono text-sm text-muted-foreground">{format.dateTime(e.at, { dateStyle: "short", timeStyle: "medium" })}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${FAILED.has(e.result) ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>
                    {t(`results.${e.result}`)}
                  </span>
                  <span className="font-medium">{e.fullName ?? e.input}</span>
                  {e.sicilNo && <span className="text-sm text-muted-foreground">{e.sicilNo}</span>}
                  {e.ip && <span className="font-mono text-xs text-muted-foreground">{e.ip}</span>}
                </summary>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t px-4 py-3 text-sm">
                  <dt className="text-muted-foreground">{t("input")}</dt>
                  <dd className="break-all font-mono">{e.input}</dd>
                  <dt className="text-muted-foreground">{t("ip")}</dt>
                  <dd className="font-mono">{e.ip ?? "—"}</dd>
                  <dt className="text-muted-foreground">{t("userAgent")}</dt>
                  <dd className="break-all">{e.userAgent ?? "—"}</dd>
                  {e.userId && (
                    <>
                      <dt className="text-muted-foreground">{t("person")}</dt>
                      <dd>
                        <Link href={`/admin/people/${e.userId}`} className="underline underline-offset-4">
                          {e.fullName}
                        </Link>
                      </dd>
                    </>
                  )}
                </dl>
              </details>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted-foreground">{t("retentionNote")}</p>
      <nav aria-label={t("pages")} className="flex justify-between gap-3">
        {data.page > 1 ? (
          <Link href={link(data.page - 1)} className="inline-flex min-h-12 items-center underline underline-offset-4">
            {t("previous")}
          </Link>
        ) : (
          <span />
        )}
        {data.hasNext && (
          <Link href={link(data.page + 1)} className="inline-flex min-h-12 items-center underline underline-offset-4">
            {t("next")}
          </Link>
        )}
      </nav>
    </section>
  );
}
