import { CheckCircle2, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { ExamRunner } from "@/features/exams/components/exam-runner";
import { SharedDeviceLogout } from "@/features/exams/components/shared-logout";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import { toActor } from "@/server/services/auth";
import { getAttempt } from "@/server/services/exams";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("exams");
  return { title: t("title") };
}

/** Teorik sınav (Ekran 4) ve sonucu. */
export default function Page({ params }: PageProps<"/[locale]/exam/[attemptId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ attemptId: string }> }) {
  const user = await requireUser();
  const { attemptId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(attemptId)) return <NotFoundView />;
  const view = await getAttempt(toActor(user), attemptId).catch((err: unknown) => {
    if (err instanceof AppError) return null;
    throw err;
  });
  if (!view) return <NotFoundView />;

  if (view.state === "open") {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="sr-only">{view.title}</h1>
        <ExamRunner
          attemptId={view.attemptId}
          title={view.title}
          deadlineAt={view.deadlineAt.toISOString()}
          serverNow={view.serverNow.toISOString()}
          questions={view.questions}
        />
      </section>
    );
  }

  const [t, format] = await Promise.all([getTranslations("exams.result"), getFormatter()]);
  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{view.title}</h1>
      <div className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-6 text-center ${view.passed ? "border-emerald-600" : "border-destructive"}`} role="status">
        {view.passed ? <CheckCircle2 aria-hidden="true" className="size-12 text-emerald-600" /> : <XCircle aria-hidden="true" className="size-12 text-destructive" />}
        <p className="text-4xl font-bold">{t("score", { score: view.score })}</p>
        <p className="text-lg">{view.passed ? t("passed") : t("failed")}</p>
        <p className="text-sm text-muted-foreground">{t("passScore", { score: view.passScore })}</p>
        {view.failReason === "ohs_critical" && <p className="text-destructive">{t("ohsCritical")}</p>}
        {view.submitReason === "timeout" && <p className="text-sm text-muted-foreground">{t("timeout")}</p>}
      </div>
      <section aria-labelledby="topics-heading">
        <h2 id="topics-heading" className="mb-2 text-lg font-semibold">
          {t("topics")}
        </h2>
        <ul className="divide-y rounded-2xl border">
          {view.topics.map((x) => (
            <li key={x.topic} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
              <span>{x.topic}</span>
              <span className="font-mono">{t("topicScore", { correct: x.correct, total: x.total })}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-muted-foreground">{t("noAnswers")}</p>
      </section>
      {!view.passed && (
        <p className="rounded-2xl border p-4">
          {view.left > 0
            ? view.nextAvailableAt
              ? t("retryAfter", { left: view.left, date: format.dateTime(view.nextAvailableAt, { dateStyle: "medium", timeStyle: "short" }) })
              : t("retry", { left: view.left })
            : t("noAttempts")}
        </p>
      )}
      <Button size="lg" className="self-start" nativeButton={false} render={<Link href="/learn" />}>
        {t("back")}
      </Button>
      {user.sharedDevice && <SharedDeviceLogout seconds={60} />}
    </section>
  );
}
