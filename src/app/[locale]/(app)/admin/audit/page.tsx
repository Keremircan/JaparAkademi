import { Filter } from "lucide-react";
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
import { auditTables, listAuditLog, type AuditFilters } from "@/server/services/audit";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("audit");
  return { title: t("title") };
}

/** Denetim kaydı (SPEC Bölüm 7, karar #98): sistem yöneticisi, salt okunur. */
export default function Page({ searchParams }: PageProps<"/[locale]/admin/audit">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f-]{36}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function show(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return typeof value === "string" ? value : JSON.stringify(value);
}

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await adminAccess("audit.view");
  if (!access) return <NotFoundView />;
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const filters: AuditFilters = {
    table: str("table") || null,
    actorId: UUID.test(str("actor")) ? str("actor") : null,
    recordId: str("record") || null,
    from: DATE.test(str("from")) ? str("from") : null,
    to: DATE.test(str("to")) ? str("to") : null,
  };
  const page = Number(str("page")) || 1;
  const [t, tNav, format, tables, data] = await Promise.all([
    getTranslations("audit"),
    getTranslations("sections.admin"),
    getFormatter(),
    auditTables(access.actor),
    listAuditLog(access.actor, filters, page),
  ]);
  const link = (p: number) => {
    const q = new URLSearchParams(Object.entries({ table: filters.table, actor: filters.actorId, record: filters.recordId, from: filters.from, to: filters.to, page: String(p) }).filter(([, v]) => !!v) as [string, string][]);
    return `/admin/audit?${q.toString()}`;
  };

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} back={{ href: "/admin", label: tNav("title") }} />
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border p-4" aria-label={t("filters.apply")}>
        <label className="flex min-w-48 flex-col gap-1">
          <span className="text-sm font-medium">{t("filters.table")}</span>
          <NativeSelect name="table" defaultValue={filters.table ?? ""}>
            <option value="">{t("filters.all")}</option>
            {tables.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex min-w-60 flex-1 flex-col gap-1">
          <span className="text-sm font-medium">{t("filters.record")}</span>
          <Input name="record" defaultValue={filters.recordId ?? ""} maxLength={100} />
        </label>
        <label className="flex min-w-60 flex-1 flex-col gap-1">
          <span className="text-sm font-medium">{t("filters.actor")}</span>
          <Input name="actor" defaultValue={filters.actorId ?? ""} maxLength={36} />
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

      {data.entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-2xl border">
          {data.entries.map((e) => (
            <li key={e.id}>
              <details>
                <summary className="flex min-h-14 cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
                  <span className="font-mono text-sm text-muted-foreground">{format.dateTime(e.at, { dateStyle: "short", timeStyle: "medium" })}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t(`actions.${e.action as "INSERT"}`)}</span>
                  <span className="font-medium">{e.table}</span>
                  <span className="text-sm text-muted-foreground">{e.actorName ?? t("system")}</span>
                  {e.recordId && <span className="truncate font-mono text-xs text-muted-foreground">{t("record", { id: e.recordId })}</span>}
                </summary>
                <div className="overflow-x-auto border-t px-4 py-3">
                  {e.changes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("noChanges")}</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th scope="col" className="py-1 pe-3 text-start font-medium">
                            {t("field")}
                          </th>
                          <th scope="col" className="py-1 pe-3 text-start font-medium">
                            {t("old")}
                          </th>
                          <th scope="col" className="py-1 text-start font-medium">
                            {t("new")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {e.changes.map((c) => (
                          <tr key={c.field} className="align-top">
                            <td className="py-1 pe-3 font-mono text-xs">{c.field}</td>
                            <td className="max-w-80 py-1 pe-3 break-all text-muted-foreground">{show(c.old)}</td>
                            <td className="max-w-80 py-1 break-all">{show(c.new)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      <nav aria-label={t("title")} className="flex justify-between gap-3">
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
