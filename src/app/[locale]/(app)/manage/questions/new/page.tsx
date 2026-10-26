import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { QuestionForm } from "@/features/questions/components/question-form";
import { questionsAccess } from "@/features/questions/guard";
import { can } from "@/server/authz/policy";
import { listTopics, questionModuleOptions, questionOwnerOptions } from "@/server/services/questions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("questions");
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
  const access = await questionsAccess();
  if (!access || !can(access.actor, "questions.edit")) return <NotFoundView />;
  const [t, owners, topics, modules] = await Promise.all([
    getTranslations("questions"),
    questionOwnerOptions(access.actor),
    listTopics(access.actor),
    questionModuleOptions(access.actor),
  ]);
  if (!owners.common && owners.units.length === 0) return <NotFoundView />;
  return (
    <section>
      <PageHeader title={t("new")} back={{ href: "/manage/questions", label: t("title") }} />
      <QuestionForm mode="create" owners={owners} topics={topics} modules={modules} image={null} />
    </section>
  );
}
