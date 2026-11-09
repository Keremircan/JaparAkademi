import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { FreshOnNavigate } from "@/components/forms/fresh-on-navigate";
import { adminAccess } from "@/features/admin/guard";
import { PositionForm } from "@/features/org/components/position-form";
import { listPositionOptions, listUnitOptions, shiftTypeOptions } from "@/server/services/org";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.org.positionForm");
  return { title: t("new") };
}

export default function Page({ searchParams }: PageProps<"/[locale]/admin/org/positions/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await adminAccess("org.manage");
  if (!access) return <NotFoundView />;
  const sp = await searchParams;
  const [t, units, positions, shiftTypes] = await Promise.all([
    getTranslations("admin.org"),
    listUnitOptions(access.actor),
    listPositionOptions(access.actor),
    shiftTypeOptions(access.actor),
  ]);

  return (
    <section>
      <PageHeader title={t("positionForm.new")} back={{ href: "/admin/org", label: t("title") }} />
      <FreshOnNavigate>
        <PositionForm
          units={units}
          defaultUnitId={typeof sp.orgUnitId === "string" ? sp.orgUnitId : undefined}
          positionOptions={positions}
          shiftTypes={shiftTypes}
        />
      </FreshOnNavigate>
    </section>
  );
}
