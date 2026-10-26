import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusBadge } from "@/features/content/components/status-badge";
import { TypeIcon } from "@/features/content/components/type-icon";
import { libraryAccess } from "@/features/content/guard";
import { Link } from "@/i18n/navigation";
import { can } from "@/server/authz/policy";
import { draftableOwners, listContents, listTags, type ContentStatusFilter } from "@/server/services/content";
import { CONTENT_TYPES, type ContentType } from "@/server/services/content/body";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("content.library");
  return { title: t("title") };
}

export default function Page({ searchParams }: PageProps<"/[locale]/manage/library">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

const STATUSES = ["published", "pending", "draft", "archived"] as const;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await libraryAccess();
  if (!access) return <NotFoundView />;
  const sp = await searchParams;
  const q = str(sp.q).slice(0, 100);
  const type = CONTENT_TYPES.find((x) => x === sp.type) as ContentType | undefined;
  const status = STATUSES.find((x) => x === sp.status) as ContentStatusFilter | undefined;
  const owner = /^(common|[0-9a-f-]{36})$/.test(str(sp.owner)) ? str(sp.owner) : undefined;
  const tagId = /^[0-9a-f-]{36}$/.test(str(sp.tag)) ? str(sp.tag) : undefined;
  const page = Number(str(sp.page) || "1") || 1;

  const [t, tt, tc, tNav, format, result, tagGroups, owners] = await Promise.all([
    getTranslations("content.library"),
    getTranslations("content"),
    getTranslations("common"),
    getTranslations("sections.manage"),
    getFormatter(),
    listContents(access.actor, { q, type, status, owner, tagId, page }),
    listTags(access.actor),
    draftableOwners(access.actor),
  ]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const canDraft = can(access.actor, "content.draft") && (owners.common || owners.units.length > 0);
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, type, status, owner, tag: tagId })) if (v) params.set(k, v);
    params.set("page", String(p));
    return `/manage/library?${params.toString()}`;
  };

  return (
    <section className="max-w-6xl">
      <PageHeader
        title={t("title")}
        description={t("description")}
        back={{ href: "/manage", label: tNav("title") }}
        actions={
          canDraft && (
            <Button nativeButton={false} render={<Link href="/manage/library/new" />}>
              <Plus aria-hidden="true" />
              {t("new")}
            </Button>
          )
        }
      />

      <form method="get" role="search" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <label htmlFor="q" className="text-sm font-medium">
            {t("search")}
          </label>
          <Input id="q" name="q" type="search" defaultValue={q} placeholder={t("searchPlaceholder")} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="type" className="text-sm font-medium">
            {t("type")}
          </label>
          <NativeSelect id="type" name="type" defaultValue={type ?? ""}>
            <option value="">{t("all")}</option>
            {CONTENT_TYPES.map((x) => (
              <option key={x} value={x}>
                {tt(`types.${x}.label`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="status" className="text-sm font-medium">
            {t("status")}
          </label>
          <NativeSelect id="status" name="status" defaultValue={status ?? ""}>
            <option value="">{t("statusActive")}</option>
            {STATUSES.map((x) => (
              <option key={x} value={x}>
                {t(`statusFilter.${x}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="tag" className="text-sm font-medium">
            {t("tag")}
          </label>
          <NativeSelect id="tag" name="tag" defaultValue={tagId ?? ""}>
            <option value="">{t("all")}</option>
            {tagGroups.map((g) =>
              g.tags.length ? (
                <optgroup key={g.typeId} label={tt(`tags.types.${g.key}`)}>
                  {g.tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
                </optgroup>
              ) : null,
            )}
          </NativeSelect>
        </div>
        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" />
          {t("search")}
        </Button>
        {owner && <input type="hidden" name="owner" value={owner} />}
      </form>

      <p className="mb-3 text-sm text-muted-foreground" role="status">
        {t("total", { count: result.total })}
      </p>
      {result.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{q ? t("noResults") : t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-2xl border">
          {result.items.map((c) => (
            <li key={c.id}>
              <Link href={`/manage/library/${c.id}`} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 hover:bg-muted">
                <TypeIcon type={c.type} className="size-6 shrink-0 text-muted-foreground" />
                <span className="min-w-48 flex-1">
                  <span className="block font-medium">{c.title}</span>
                  <span className="block text-sm text-muted-foreground">
                    {tt(`types.${c.type}.label`)} · {c.ownerName ?? tt(`target.${c.commonTarget ?? "all"}`)} ·{" "}
                    {format.dateTime(c.updatedAt, { dateStyle: "medium" })}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1 text-xs">
                  {c.isOhs && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-800 dark:text-amber-300">{tt("ohs")}</span>}
                  {c.archived ? (
                    <span className="rounded-full bg-muted px-2 py-0.5">{tt("archived")}</span>
                  ) : (
                    <>
                      {c.publishedVersion && <StatusBadge status="published" version={c.publishedVersion} />}
                      {c.latestStatus !== "published" && <StatusBadge status={c.latestStatus} version={c.latestVersion} />}
                    </>
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
