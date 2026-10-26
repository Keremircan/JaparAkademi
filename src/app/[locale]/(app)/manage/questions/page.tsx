import { FileSpreadsheet, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { questionsAccess } from "@/features/questions/guard";
import { Link } from "@/i18n/navigation";
import { can } from "@/server/authz/policy";
import { listQuestions, listTopics, questionModuleOptions } from "@/server/services/questions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("questions");
  return { title: t("title") };
}

export default function Page({ searchParams }: PageProps<"/[locale]/manage/questions">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const STATUSES = ["active", "pending", "archived"] as const;

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await questionsAccess();
  if (!access) return <NotFoundView />;
  const sp = await searchParams;
  const q = str(sp.q).slice(0, 100);
  const topic = str(sp.topic).slice(0, 100) || undefined;
  const moduleId = /^[0-9a-f-]{36}$/.test(str(sp.module)) ? str(sp.module) : undefined;
  const status = STATUSES.find((s) => s === sp.status);
  const page = Number(str(sp.page) || "1") || 1;
  const [t, tc, tNav, result, topics, mods] = await Promise.all([
    getTranslations("questions"),
    getTranslations("common"),
    getTranslations("sections.manage"),
    listQuestions(access.actor, { q, topic, moduleId, status, page }),
    listTopics(access.actor),
    questionModuleOptions(access.actor),
  ]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const canEdit = can(access.actor, "questions.edit");
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, topic, module: moduleId, status })) if (v) params.set(k, v);
    params.set("page", String(p));
    return `/manage/questions?${params.toString()}`;
  };

  return (
    <section className="max-w-6xl">
      <PageHeader
        title={t("title")}
        description={t("description")}
        back={{ href: "/manage", label: tNav("title") }}
        actions={
          canEdit && (
            <>
              <Button nativeButton={false} render={<Link href="/manage/questions/new" />}>
                <Plus aria-hidden="true" />
                {t("new")}
              </Button>
              <Button variant="outline" nativeButton={false} render={<Link href="/manage/questions/import" />}>
                <FileSpreadsheet aria-hidden="true" />
                {t("import")}
              </Button>
            </>
          )
        }
      />
      <form method="get" role="search" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <div className="flex flex-col gap-2 lg:col-span-2">
          <label htmlFor="q" className="text-sm font-medium">
            {t("search")}
          </label>
          <Input id="q" name="q" type="search" defaultValue={q} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="module" className="text-sm font-medium">
            {t("module")}
          </label>
          <NativeSelect id="module" name="module" defaultValue={moduleId ?? ""}>
            <option value="">{t("all")}</option>
            {mods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="topic" className="text-sm font-medium">
            {t("topic")}
          </label>
          <NativeSelect id="topic" name="topic" defaultValue={topic ?? ""}>
            <option value="">{t("all")}</option>
            {topics.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="status" className="text-sm font-medium">
            {t("status")}
          </label>
          <NativeSelect id="status" name="status" defaultValue={status ?? ""}>
            <option value="">{t("statusAll")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`statusFilter.${s}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="secondary" className="lg:col-start-5">
          <Search aria-hidden="true" />
          {t("search")}
        </Button>
      </form>

      <p className="mb-3 text-sm text-muted-foreground" role="status">
        {t("total", { count: result.total })}
      </p>
      {result.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-2xl border">
          {result.items.map((x) => (
            <li key={x.id}>
              <Link href={`/manage/questions/${x.id}`} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-muted">
                <span className="min-w-60 flex-1">
                  <span className="block line-clamp-2 font-medium">{x.stem}</span>
                  <span className="block text-sm text-muted-foreground">
                    {x.topic} · {t(`form.difficulties.${x.difficulty as 1}`)} · {t(`form.${x.type === "true_false" ? "trueFalse" : "singleChoice"}`)} · {x.ownerName ?? t("form.common")}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1 text-xs">
                  {x.isOhs && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-800 dark:text-amber-300">{t("ohs")}</span>}
                  {x.isOhsCritical && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">{t("critical")}</span>}
                  {x.pending && <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-800 dark:text-sky-300">{t("pending")}</span>}
                  {!x.active && !x.pending && !x.archived && <span className="rounded-full bg-muted px-2 py-0.5">{t("inactive")}</span>}
                  {x.archived && <span className="rounded-full bg-muted px-2 py-0.5">{t("archived")}</span>}
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
