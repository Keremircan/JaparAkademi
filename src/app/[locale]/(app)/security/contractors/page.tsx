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

/** Taşeron firmalar (FG-8.3): İSG uzmanı ve güvenlik. Silme yok, arşivleme var. */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const access = await securityAccess("contractors.manage");
  if (!access) return <NotFoundView />;
  const [t, tNav, format, rows] = await Promise.all([
    getTranslations("visitors"),
    getTranslations("sections.security"),
    getFormatter(),
    listCompanies(access.actor, { includeArchived: true }),
  ]);
  return (
    <section className="flex max-w-4xl flex-col gap-8">
      <PageHeader title={t("cards.contractors.title")} description={t("cards.contractors.description")} back={{ href: "/security", label: tNav("title") }} />
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("companies.empty")}</p>
      ) : (
        <ul className="divide-y rounded-2xl border">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/security/contractors/${c.id}`} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-muted">
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
        <h2 id="new-company" className="text-xl font-semibold">
          {t("companies.create")}
        </h2>
        <CompanyForm />
      </section>
    </section>
  );
}
