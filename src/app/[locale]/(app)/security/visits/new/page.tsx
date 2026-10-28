import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { VisitForm } from "@/features/visitors/components/visit-form";
import { securityAccess } from "@/features/visitors/guard";
import { todayIn } from "@/lib/dates";
import { getSettings } from "@/server/services/settings";
import { companyOptions } from "@/server/services/visitors";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("visitors.mine");
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
  const access = await securityAccess("visits.manage_all");
  if (!access) return <NotFoundView />;
  const [t, s, companies] = await Promise.all([getTranslations("visitors"), getSettings(["org.timezone", "visitor.types"]), companyOptions(access.actor)]);
  const types = (["office", "site", "contractor"] as const).filter((k) => s["visitor.types"][k].enabled);
  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={t("mine.new")} description={t("securityNewHint")} back={{ href: "/security/visits", label: t("cards.visits.title") }} />
      <VisitForm mode="security" base="/security/visits" types={types} companies={companies} minDate={todayIn(s["org.timezone"])} />
    </section>
  );
}
