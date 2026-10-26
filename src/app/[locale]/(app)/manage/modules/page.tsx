import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { libraryAccess } from "@/features/content/guard";
import { Link } from "@/i18n/navigation";
import { can } from "@/server/authz/policy";
import { listModules, MODULE_KINDS, type ModuleKind } from "@/server/services/modules";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("modules");
  return { title: t("title") };
}

export default function Page({ searchParams }: PageProps<"/[locale]/manage/modules">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await libraryAccess();
  if (!access) return <NotFoundView />;
  const sp = await searchParams;
  const q = str(sp.q).slice(0, 100);
  const kind = MODULE_KINDS.find((k) => k === sp.kind) as ModuleKind | undefined;
  const scope = sp.scope === "common" || sp.scope === "unit" ? sp.scope : undefined;
  const archived = sp.archived === "1";
  const [t, tNav, items] = await Promise.all([
    getTranslations("modules"),
    getTranslations("sections.manage"),
    listModules(access.actor, { q, kind, scope, archived }),
  ]);

  return (
    <section className="max-w-6xl">
      <PageHeader
        title={t("title")}
        description={t("description")}
        back={{ href: "/manage", label: tNav("title") }}
        actions={
          can(access.actor, "content.draft") && (
            <Button nativeButton={false} render={<Link href="/manage/modules/new" />}>
              <Plus aria-hidden="true" />
              {t("new")}
            </Button>
          )
        }
      />
      <form method="get" role="search" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <label htmlFor="q" className="text-sm font-medium">
            {t("search")}
          </label>
          <Input id="q" name="q" type="search" defaultValue={q} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="kind" className="text-sm font-medium">
            {t("kind")}
          </label>
          <NativeSelect id="kind" name="kind" defaultValue={kind ?? ""}>
            <option value="">{t("all")}</option>
            {MODULE_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}.label`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="scope" className="text-sm font-medium">
            {t("scope")}
          </label>
          <NativeSelect id="scope" name="scope" defaultValue={scope ?? ""}>
            <option value="">{t("all")}</option>
            <option value="common">{t("scopeCommon")}</option>
            <option value="unit">{t("scopeUnit")}</option>
          </NativeSelect>
        </div>
        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" />
          {t("search")}
        </Button>
      </form>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-2xl border">
          {items.map((m) => (
            <li key={m.id}>
              <Link href={`/manage/modules/${m.id}`} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-muted">
                <span className="min-w-48 flex-1">
                  <span className="block font-medium">{m.title}</span>
                  <span className="block text-sm text-muted-foreground">
                    {t(`kinds.${m.kind}.label`)} · {t("minutes", { n: m.durationMin })} · {m.ownerName ?? t("commonFor", { target: t(`targets.${m.commonTarget ?? "all"}`) })}
                    {m.kind === "practice" && ` · ${t("taskCount", { n: m.itemCount })}`}
                    {m.kind === "theory" && !m.isCardModule && ` · ${t("contentCount", { n: m.itemCount })}`}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1 text-xs">
                  {m.isCardModule && <span className="rounded-full bg-muted px-2 py-0.5">{t("cardModule")}</span>}
                  {m.isOhs && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-800 dark:text-amber-300">{t("ohs")}</span>}
                  {!m.remoteAllowed && <span className="rounded-full bg-muted px-2 py-0.5">{t("classroomOnly")}</span>}
                  {m.validityMonths && <span className="rounded-full bg-muted px-2 py-0.5">{t("validity", { n: m.validityMonths })}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4">
        <Link href={archived ? "/manage/modules" : "/manage/modules?archived=1"} className="inline-flex min-h-12 items-center underline-offset-4 hover:underline">
          {archived ? t("showActive") : t("showArchived")}
        </Link>
      </p>
    </section>
  );
}
