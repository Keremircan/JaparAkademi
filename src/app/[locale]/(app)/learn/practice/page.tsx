import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { PracticeTasks } from "@/features/practice/components/practice-tasks";
import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/services/auth";
import { myPractice } from "@/server/services/practice";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("practice.mine");
  return { title: t("title") };
}

/** Pratik görevlerim (Ekran 5): görevler ve güncel seviye; işaretlemeyi eğitmen yapar. */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const user = await requireUser();
  const [t, tl, modules] = await Promise.all([getTranslations("practice.mine"), getTranslations("sections.learn"), myPractice(toActor(user))]);
  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} back={{ href: "/learn", label: tl("title") }} />
      {modules.length === 0 && <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("empty")}</p>}
      {modules.map((m) => (
        <section key={m.assignmentModuleId} aria-labelledby={`m-${m.assignmentModuleId}`} className="flex flex-col gap-3">
          <h2 id={`m-${m.assignmentModuleId}`} className="text-lg font-semibold">
            {m.title}
          </h2>
          <p className="text-sm text-muted-foreground" role="status">
            {m.status === "locked" ? t("locked") : t("progress", { done: m.independent, total: m.tasks.length })}
          </p>
          <PracticeTasks assignmentModuleId={m.assignmentModuleId} tasks={m.tasks} canMark={false} />
        </section>
      ))}
    </section>
  );
}
