import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { VisitForm } from "@/features/visitors/components/visit-form";
import { todayIn } from "@/lib/dates";
import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/services/auth";
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
  const user = await requireUser();
  const actor = toActor(user);
  const [t, s, companies] = await Promise.all([getTranslations("visitors.mine"), getSettings(["org.timezone", "visitor.types"]), companyOptions(actor)]);
  const types = (["office", "site", "contractor"] as const).filter((k) => s["visitor.types"][k].enabled);
  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={t("new")} description={t("newHint")} back={{ href: "/visits", label: t("title") }} />
      <VisitForm mode="host" base="/visits" types={types} companies={companies} minDate={todayIn(s["org.timezone"])} />
    </section>
  );
}
