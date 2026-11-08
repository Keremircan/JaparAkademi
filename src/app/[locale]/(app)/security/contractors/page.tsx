import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { CompanyForm } from "@/features/visitors/components/company-form";
import { securityAccess } from "@/features/visitors/guard";
import { Link } from "@/i18n/navigation";
import { listCompanies } from "@/server/services/visitors";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("visitors.cards.contractors");
  return { title: t("title") };
}

/** Taşeron firmalar (FG-8.3): İSG uzmanı ve güvenlik. Arşivdekiler istenmedikçe gizli; firma sayfasında silme (iş paketi 3.14). */
export default function Page({ searchParams }: PageProps<"/[locale]/security/contractors">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await securityAccess("contractors.manage");
  if (!access) return <NotFoundView />;
  // Arşivdeki firmalar istenmedikçe gizlenir (iş paketi 3.14)
  const showArchived = (await searchParams).archived === "1";
  const [t, tNav, tDel, format, all] = await Promise.all([
    getTranslations("visitors"),
    getTranslations("sections.security"),
    getTranslations("deletion"),
    getFormatter(),
    listCompanies(access.actor, { includeArchived: true }),
  ]);
  const archivedCount = all.filter((c) => c.archivedAt).length;
  const rows = showArchived ? all : all.filter((c) => !c.archivedAt);
  return (
    <section className="flex max-w-4xl flex-col gap-8">
      <PageHeader title={t("cards.contractors.title")} description={t("cards.contractors.description")} back={{ href: "/security", label: tNav("title") }} />
      {archivedCount > 0 && (
        <Link
          href={showArchived ? "/security/contractors" : "/security/contractors?archived=1"}
          className="inline-flex min-h-12 items-center self-end underline underline-offset-4"
        >
          {showArchived ? tDel("hideArchived") : `${tDel("showArchived")} (${archivedCount})`}
        </Link>
      )}
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-5 text-muted-foreground">{t("companies.empty")}</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/security/contractors/${c.id}`} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted">
                <span className="min-w-48 flex-1">
                  <span className="block font-medium">{c.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {c.taxNo && `${t("companies.taxNo")}: ${c.taxNo}`}
                    {c.contractEnd && ` · ${t("companies.contractEndShort", { date: format.dateTime(new Date(`${c.contractEnd}T12:00:00`), { dateStyle: "medium" }) })}`}
                  </span>
                </span>
                {c.archivedAt && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t("companies.archived")}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <section aria-labelledby="new-company" className="flex flex-col gap-4">
        <h2 id="new-company" className="text-lg font-semibold">
          {t("companies.create")}
        </h2>
        <CompanyForm />
      </section>
    </section>
  );
}
