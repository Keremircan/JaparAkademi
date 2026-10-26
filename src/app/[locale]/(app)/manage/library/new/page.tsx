import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { CreateContentForm } from "@/features/content/components/create-content-form";
import { libraryAccess } from "@/features/content/guard";
import { hasAnyRole, hasRole } from "@/server/authz/policy";
import { draftableOwners } from "@/server/services/content";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("content.create");
  return { title: t("heading") };
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
  const [t, tl] = await Promise.all([getTranslations("content.create"), getTranslations("content.library")]);
  const ohsOnly = hasRole(access.actor, "ohs_specialist") && !hasAnyRole(access.actor, ["hr", "section_manager", "trainer"]);
  return (
    <section>
      <PageHeader title={t("heading")} description={t("intro")} back={{ href: "/manage/library", label: tl("title") }} />
      <CreateContentForm owners={owners} ohsOnly={ohsOnly} />
    </section>
  );
}
