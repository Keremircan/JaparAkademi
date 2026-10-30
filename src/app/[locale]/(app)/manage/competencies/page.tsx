import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { CompetencyForm } from "@/features/competencies/components/competency-form";
import { Link } from "@/i18n/navigation";
import { can } from "@/server/authz/policy";
import { getSectionUser } from "@/server/auth/current-user";
import { toActor } from "@/server/services/auth";
import { competencyUnitOptions, listCompetencies } from "@/server/services/competencies";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("competencies");
  return { title: t("title") };
}

/** Yetkinlik tanımları (FG-7.4, karar #218). */
export default function Page({ searchParams }: PageProps<"/[locale]/manage/competencies">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSectionUser("manage");
  if (!user) return <NotFoundView />;
  const actor = toActor(user);
  if (!can(actor, "competencies.manage")) return <NotFoundView />;
  const archived = (await searchParams).archived === "1";
  const [t, tNav, rows, options] = await Promise.all([
    getTranslations("competencies"),
    getTranslations("sections.manage"),
    listCompetencies(actor, { archived }),
    competencyUnitOptions(actor),
  ]);

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} back={{ href: "/manage", label: tNav("title") }} />

      {!archived && (options.common || options.units.length > 0) && (
        <section aria-labelledby="new-heading" className="flex flex-col gap-4 rounded-2xl border p-5">
          <h2 id="new-heading" className="text-lg font-semibold">
            {t("new")}
          </h2>
          <CompetencyForm mode="create" units={options.units} common={options.common} />
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex-1 text-lg font-semibold">{archived ? t("archivedHeading") : t("listHeading")}</h2>
        <Link href={archived ? "/manage/competencies" : "/manage/competencies?archived=1"} className="inline-flex min-h-12 items-center underline underline-offset-4">
          {archived ? t("showActive") : t("showArchived")}
        </Link>
        <Link href="/reports/competency" className="inline-flex min-h-12 items-center underline underline-offset-4">
          {t("toMatrix")}
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-2xl border">
          {rows.map((c) => (
            <li key={c.id}>
              <details>
                <summary className="flex min-h-14 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span className="font-medium">{c.name}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t(`form.kinds.${c.kind}`)}</span>
                  <span className="text-sm text-muted-foreground">{c.unitName ?? t("form.common")}</span>
                  <span className="text-sm text-muted-foreground">
                    {c.validityMonths ? t("validityMonths", { n: c.validityMonths }) : t("noExpiry")}
                  </span>
                  <span className="ms-auto text-sm text-muted-foreground">{t("holders", { count: c.holders })}</span>
                </summary>
                <div className="border-t px-4 py-4">
                  {c.description && <p className="mb-4 whitespace-pre-line text-sm">{c.description}</p>}
                  {c.canEdit ? (
                    <CompetencyForm
                      mode="edit"
                      id={c.id}
                      initial={{ name: c.name, kind: c.kind, description: c.description ?? "", validityMonths: c.validityMonths ? String(c.validityMonths) : "" }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">{c.archived ? t("archivedNote") : t("readOnly")}</p>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
