import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { orNull } from "@/features/admin/guard";
import { VisitDetail } from "@/features/visitors/components/visit-detail";
import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/services/auth";
import { getVisit } from "@/server/services/visitors";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("visitors.mine");
  return { title: t("title") };
}

export default function Page({ params }: PageProps<"/[locale]/visits/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f-]{36}$/;

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const actor = toActor(user);
  const { id } = await params;
  const visit = UUID.test(id) ? await orNull(getVisit(actor, id)) : null;
  // Ev sahibi görünümü: başkasının ziyareti görünmez (güvenlik kendi bölümünden açar)
  if (!visit || visit.hostUserId !== actor.userId) return <NotFoundView />;
  const t = await getTranslations("visitors.mine");
  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={visit.fullName} description={visit.companyName ?? undefined} back={{ href: "/visits", label: t("title") }} />
      <VisitDetail actor={actor} visit={visit} base="/visits" />
    </section>
  );
}
