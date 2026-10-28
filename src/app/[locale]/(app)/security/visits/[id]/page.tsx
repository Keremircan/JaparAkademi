import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { orNull } from "@/features/admin/guard";
import { VisitDetail } from "@/features/visitors/components/visit-detail";
import { securityAccess } from "@/features/visitors/guard";
import { getVisit } from "@/server/services/visitors";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("visitors.cards.visits");
  return { title: t("title") };
}

export default function Page({ params }: PageProps<"/[locale]/security/visits/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f-]{36}$/;

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const access = await securityAccess("visits.view_all");
  if (!access) return <NotFoundView />;
  const { id } = await params;
  const visit = UUID.test(id) ? await orNull(getVisit(access.actor, id)) : null;
  if (!visit) return <NotFoundView />;
  const t = await getTranslations("visitors.cards.visits");
  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={visit.fullName} description={visit.companyName ?? undefined} back={{ href: "/security/visits", label: t("title") }} />
      <VisitDetail actor={access.actor} visit={visit} base="/security/visits" />
    </section>
  );
}
