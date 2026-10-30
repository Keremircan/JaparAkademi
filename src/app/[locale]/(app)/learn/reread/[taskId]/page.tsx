import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { ActionButton } from "@/components/forms/action-button";
import { ContentRenderer } from "@/features/content/components/content-renderer";
import { acknowledgeRereadAction } from "@/features/learning/actions";
import { ReadAloud } from "@/features/learning/components/read-aloud";
import { requireUser } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import { toActor } from "@/server/services/auth";
import { getRereadTask } from "@/server/services/assignments/learner";
import { bodyAssetIds } from "@/server/services/content/body";
import { assetsInfo } from "@/server/services/media";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("learn");
  return { title: t("rereadHeading") };
}

/** Okuma görevi (FG-2.2): güncellenen içeriği tekrar okuyup onaylama. */
export default function Page({ params }: PageProps<"/[locale]/learn/reread/[taskId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(taskId)) return <NotFoundView />;
  const task = await getRereadTask(toActor(user), taskId).catch((err: unknown) => {
    if (err instanceof AppError) return null;
    throw err;
  });
  if (!task) return <NotFoundView />;
  const [t, tl, format, assets] = await Promise.all([
    getTranslations("learn"),
    getTranslations("sections.learn"),
    getFormatter(),
    assetsInfo(bodyAssetIds(task.type, task.body)),
  ]);
  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={task.title}
        description={t("rereadIntro", { date: format.dateTime(new Date(`${task.dueDate}T12:00:00`), { dateStyle: "long" }) })}
        back={{ href: "/learn", label: tl("title") }}
      />
      <ReadAloud targetId="reread-body" lang={task.locale} />
      <div id="reread-body" lang={task.locale}>
        <ContentRenderer type={task.type} title={task.title} body={task.body} assets={assets} />
      </div>
      {!task.acknowledgedAt && (
        <ActionButton variant="default" action={acknowledgeRereadAction.bind(null, task.id)}>
          {t("step.acknowledge")}
        </ActionButton>
      )}
    </section>
  );
}
