import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { ActionButton } from "@/components/forms/action-button";
import { orNull } from "@/features/admin/guard";
import { setCompanyArchivedAction } from "@/features/visitors/actions";
import { CompanyForm } from "@/features/visitors/components/company-form";
import { securityAccess } from "@/features/visitors/guard";
import { getCompany } from "@/server/services/visitors";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("visitors.cards.contractors");
  return { title: t("title") };
}

export default function Page({ params }: PageProps<"/[locale]/security/contractors/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f-]{36}$/;

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const access = await securityAccess("contractors.manage");
  if (!access) return <NotFoundView />;
  const { id } = await params;
  const company = UUID.test(id) ? await orNull(getCompany(access.actor, id)) : null;
  if (!company) return <NotFoundView />;
  const t = await getTranslations("visitors");
  return (
    <section className="flex max-w-3xl flex-col gap-8">
      <PageHeader
        title={company.name}
        description={company.archivedAt ? t("companies.archived") : undefined}
        back={{ href: "/security/contractors", label: t("cards.contractors.title") }}
        actions={
          <ActionButton
            confirmText={company.archivedAt ? undefined : t("companies.archiveConfirm")}
            action={setCompanyArchivedAction.bind(null, company.id, !company.archivedAt)}
          >
            {company.archivedAt ? t("companies.unarchive") : t("companies.archive")}
          </ActionButton>
        }
      />
      <CompanyForm
        key={company.updatedAt.getTime()}
        id={company.id}
        initial={{
          name: company.name,
          taxNo: company.taxNo ?? "",
          responsibleName: company.responsibleName ?? "",
          phone: company.phone ?? "",
          email: company.email ?? "",
          contractEnd: company.contractEnd ?? "",
        }}
      />
      <section aria-labelledby="company-workers" className="flex flex-col gap-3">
        <h2 id="company-workers" className="text-xl font-semibold">
          {t("companies.workers")}
        </h2>
        {company.workers.length === 0 ? (
          <p className="text-muted-foreground">{t("companies.noWorkers")}</p>
        ) : (
          <ul className="divide-y rounded-2xl border">
            {company.workers.map((w) => (
              <li key={w.id} className="flex min-h-12 items-center gap-4 px-5 py-2">
                <span className="flex-1">{w.fullName}</span>
                {w.nationalIdMasked && <span className="text-sm text-muted-foreground">{w.nationalIdMasked}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-muted-foreground">{t("companies.workersHint")}</p>
      </section>
    </section>
  );
}
