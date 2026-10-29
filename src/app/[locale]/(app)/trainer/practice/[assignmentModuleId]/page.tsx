import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { PracticeTasks } from "@/features/practice/components/practice-tasks";
import { requireUser } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import { toActor } from "@/server/services/auth";
import { practiceModule } from "@/server/services/practice";
import { OwnerActingNotice } from "@/features/admin/owner-notice";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("practice");
  return { title: t("markTitle") };
}

/** Pratik görev işaretleme (FG-5.2): eğitmen ve kapsamdaki bölüm sorumlusu, telefon/tablet. */
export default function Page({ params }: PageProps<"/[locale]/trainer/practice/[assignmentModuleId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ assignmentModuleId: string }> }) {
  const user = await requireUser();
  const { assignmentModuleId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(assignmentModuleId)) return <NotFoundView />;
  const view = await practiceModule(toActor(user), assignmentModuleId).catch((err: unknown) => {
    if (err instanceof AppError) return null;
    throw err;
  });
  if (!view || view.trainee.userId === user.userId) return <NotFoundView />;
  const t = await getTranslations("practice");
  return (
    <section className="flex max-w-3xl flex-col gap-4">
      <PageHeader
        title={view.title}
        description={`${view.trainee.name}${view.trainee.positionName ? ` · ${view.trainee.positionName}` : ""}`}
        back={{ href: "/trainer", label: t("backTrainer") }}
      />
      <OwnerActingNotice actor={toActor(user)} permission="practice.mark" role="trainer" />
      <p className="text-muted-foreground" role="status">
        {t("progress", { done: view.independent, total: view.tasks.length })}
        {view.status === "completed" && ` · ${t("moduleDone")}`}
        {view.status === "review_required" && ` · ${t("reviewRequired")}`}
      </p>
      {!view.canMark && view.status !== "completed" && <p className="rounded-2xl border p-4">{view.open ? t("readOnly") : t("notOpen")}</p>}
      <PracticeTasks assignmentModuleId={view.assignmentModuleId} tasks={view.tasks} canMark={view.canMark} />
    </section>
  );
}
