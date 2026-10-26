import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { QuestionImport } from "@/features/questions/components/question-import";
import { questionsAccess } from "@/features/questions/guard";
import { can } from "@/server/authz/policy";
import { questionOwnerOptions } from "@/server/services/questions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("questions");
  return { title: t("import") };
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const access = await questionsAccess();
  if (!access || !can(access.actor, "questions.edit")) return <NotFoundView />;
  const [t, owners] = await Promise.all([getTranslations("questions"), questionOwnerOptions(access.actor)]);
  return (
    <section>
      <PageHeader title={t("import")} description={t("importIntro")} back={{ href: "/manage/questions", label: t("title") }} />
      <QuestionImport owners={owners} />
    </section>
  );
}
