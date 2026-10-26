import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { libraryAccess } from "@/features/content/guard";
import { ModuleForm } from "@/features/modules/components/module-form";
import { hasAnyRole, hasRole } from "@/server/authz/policy";
import { draftableOwners } from "@/server/services/content";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("modules");
  return { title: t("new") };
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const access = await libraryAccess();
  if (!access) return <NotFoundView />;
  const owners = await draftableOwners(access.actor);
  if (!owners.common && owners.units.length === 0) return <NotFoundView />;
  const t = await getTranslations("modules");
  const ohsOnly = hasRole(access.actor, "ohs_specialist") && !hasAnyRole(access.actor, ["hr", "section_manager", "trainer"]);
  return (
    <section>
      <PageHeader title={t("new")} description={t("newIntro")} back={{ href: "/manage/modules", label: t("title") }} />
      <ModuleForm mode="create" owners={owners} ohsOnly={ohsOnly} />
    </section>
  );
}
