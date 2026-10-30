import { FileSpreadsheet, Hourglass, Plus, Search, Send } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { adminAccess } from "@/features/admin/guard";
import { Link } from "@/i18n/navigation";
import { can } from "@/server/authz/policy";
import { listPeople, type PersonStatus } from "@/server/services/people";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.people");
  return { title: t("title") };
}

export default function Page({ searchParams }: PageProps<"/[locale]/admin/people">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

const STATUSES = ["active", "passive", "terminated", "all"] as const;

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await adminAccess("people.view");
  if (!access) return <NotFoundView />;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = STATUSES.find((s) => s === sp.status);
  const page = Number(typeof sp.page === "string" ? sp.page : "1") || 1;

  const [t, tc, tNav, result] = await Promise.all([
    getTranslations("admin.people"),
    getTranslations("common"),
    getTranslations("sections.admin"),
    listPeople(access.actor, { q, status: status as PersonStatus | "all" | undefined, page }),
  ]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const canManage = can(access.actor, "people.manage");
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    params.set("page", String(p));
    return `/admin/people?${params.toString()}`;
  };

  return (
    <section className="max-w-6xl">
      <PageHeader
        title={t("title")}
        back={{ href: "/admin", label: tNav("title") }}
        actions={
          canManage && (
            <>
              <Button nativeButton={false} render={<Link href="/admin/people/new" />}>
                <Plus aria-hidden="true" />
                {t("add")}
              </Button>
              <Button variant="outline" nativeButton={false} render={<Link href="/admin/people/import" />}>
                <FileSpreadsheet aria-hidden="true" />
                {t("importButton")}
              </Button>
              <Button variant="outline" nativeButton={false} render={<Link href="/admin/people/invites" />}>
                <Send aria-hidden="true" />
                {t("invitesButton")}
              </Button>
              {can(access.actor, "assignments.manage") && (
                <Button variant="outline" nativeButton={false} render={<Link href="/admin/people/waiting" />}>
                  <Hourglass aria-hidden="true" />
                  {t("waitingButton")}
                </Button>
              )}
            </>
          )
        }
      />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3" role="search">
        <div className="flex min-w-60 flex-1 flex-col gap-2">
          <label htmlFor="q" className="text-sm font-medium">
            {t("search")}
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder={t("searchPlaceholder")} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="status" className="text-sm font-medium">
            {t("statusFilter")}
          </label>
          <NativeSelect id="status" name="status" defaultValue={status ?? ""} className="w-44">
            <option value="">{t("statusCurrent")}</option>
            <option value="active">{t("status.active")}</option>
            <option value="passive">{t("status.passive")}</option>
            <option value="terminated">{t("status.terminated")}</option>
            <option value="all">{t("statusAll")}</option>
          </NativeSelect>
        </div>
        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" />
          {t("search")}
        </Button>
      </form>

      <p className="mb-3 text-sm text-muted-foreground">{t("total", { count: result.total })}</p>
      {result.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-2xl border">
          {result.items.map((p) => (
            <li key={p.userId}>
              <Link href={`/admin/people/${p.userId}`} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-muted">
                <span className="w-24 font-mono text-sm text-muted-foreground">{p.sicilNo}</span>
                <span className="min-w-40 flex-1 font-medium">{p.fullName}</span>
                <span className="min-w-48 flex-1 text-sm text-muted-foreground">
                  {p.positionName ? [p.departmentName, p.orgUnitName !== p.departmentName ? p.orgUnitName : null, p.positionName].filter(Boolean).join(" / ") : tc("none")}
                </span>
                <span className="flex flex-wrap gap-1 text-xs">
                  {p.status !== "active" && <span className="rounded-full bg-muted px-2 py-0.5">{t(`status.${p.status}`)}</span>}
                  {p.mustChangePassword && <span className="rounded-full bg-muted px-2 py-0.5">{t("mustChange")}</span>}
                  {p.lockedUntil && p.lockedUntil > new Date() && (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">{t("locked")}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="mt-4 flex items-center gap-3" aria-label={tc("pageOf", { page: result.page, pages })}>
          {result.page > 1 && (
            <Button variant="outline" nativeButton={false} render={<Link href={pageHref(result.page - 1)} />}>
              {tc("previous")}
            </Button>
          )}
          <span className="text-sm text-muted-foreground">{tc("pageOf", { page: result.page, pages })}</span>
          {result.page < pages && (
            <Button variant="outline" nativeButton={false} render={<Link href={pageHref(result.page + 1)} />}>
              {tc("next")}
            </Button>
          )}
        </nav>
      )}
    </section>
  );
}
