import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { VisitList } from "@/features/visitors/components/visit-list";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/services/auth";
import { listVisits } from "@/server/services/visitors";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("visitors.mine");
  return { title: t("title") };
}

/** Ziyaretçilerim (SPEC 8.2/1, karar #130): personel kendi ziyaretçilerini ön kaydeder. */
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
  const [t, rows] = await Promise.all([getTranslations("visitors.mine"), listVisits(actor, { scope: "mine" })]);
  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button nativeButton={false} render={<Link href="/visits/new" />}>
            <Plus aria-hidden="true" />
            {t("new")}
          </Button>
        }
      />
      <VisitList rows={rows} base="/visits" showHost={false} />
    </section>
  );
}
