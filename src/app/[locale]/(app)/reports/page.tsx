import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SectionPlaceholder } from "@/components/app-shell/section-placeholder";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { getSectionUser } from "@/server/auth/current-user";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sections.reports");
  return { title: t("title") };
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  if (!(await getSectionUser("reports"))) return <NotFoundView />;
  const t = await getTranslations();
  return (
    <SectionPlaceholder
      title={t("sections.reports.title")}
      description={t("sections.reports.description")}
      note={t("common.comingSoon")}
    />
  );
}
