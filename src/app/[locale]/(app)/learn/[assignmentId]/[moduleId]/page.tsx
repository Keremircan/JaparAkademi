import { CheckCircle2, Circle, Info } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { ContentRenderer } from "@/features/content/components/content-renderer";
import { QuizPanel } from "@/features/learning/components/quiz-panel";
import { ReadAloud } from "@/features/learning/components/read-aloud";
import { StepTracker } from "@/features/learning/components/step-tracker";
import { ExamPanel } from "@/features/exams/components/exam-panel";
import { PracticalPanel } from "@/features/practice/components/practical-panel";
import { PracticeTasks } from "@/features/practice/components/practice-tasks";
import { CardView } from "@/features/positions/components/card-view";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import { toActor } from "@/server/services/auth";
import { learnModuleByIds, type LearnItem } from "@/server/services/assignments/learner";
import { examInfo } from "@/server/services/exams";
import { practicalExamInfo, practiceModule } from "@/server/services/practice";
import { assetsInfo } from "@/server/services/media";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sections.learn");
  return { title: t("title") };
}

/** İçerik görüntüleme (Ekran 3): adım adım içerik, ilerleme, "okudum, anladım", ara değerlendirme. */
export default function Page({ params, searchParams }: PageProps<"/[locale]/learn/[assignmentId]/[moduleId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f-]{36}$/;

async function Content({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string; moduleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { assignmentId, moduleId } = await params;
  if (!UUID.test(assignmentId) || !UUID.test(moduleId)) return <NotFoundView />;
  const m = await learnModuleByIds(toActor(user), assignmentId, moduleId).catch((err: unknown) => {
    if (err instanceof AppError) return null;
    throw err;
  });
  if (!m) return <NotFoundView />;
  const sp = await searchParams;
  const [t, tl, tc] = await Promise.all([getTranslations("learn"), getTranslations("sections.learn"), getTranslations("cards.sections")]);

  const firstOpen = m.items.findIndex((i) => !i.acknowledgedAt);
  const requested = Number(typeof sp.step === "string" ? sp.step : NaN);
  const index = Number.isInteger(requested) && requested >= 0 && requested < m.items.length ? requested : firstOpen;
  const item = index >= 0 ? m.items[index] : undefined;
  const allAcked = firstOpen === -1;
  const titleOf = (i: LearnItem) => (i.kind === "card_section" ? tc(`${i.sectionKey as "purpose"}.title`) : i.title);
  const done = m.status === "completed" || m.status === "waived";

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={m.title} back={{ href: "/learn", label: tl("title") }} />

      {done && (
        <p role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-600/40 bg-emerald-500/10 p-4">
          <CheckCircle2 aria-hidden="true" />
          {m.completedVia === "classroom" ? t("module.doneClassroom") : t("module.done")}
          <Link href="/learn" className="ms-auto inline-flex min-h-12 items-center underline underline-offset-4">
            {t("module.back")}
          </Link>
        </p>
      )}
      {!m.remoteAllowed && !done && (
        <p role="status" className="flex gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {t("module.classroomOnly")}
        </p>
      )}

      {m.status === "review_required" && (
        <p role="status" className="flex gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {t("module.reviewRequired")}
        </p>
      )}

      {m.kind === "theory_exam" ? (
        <ExamPanel info={await examInfo(toActor(user), m.assignmentModuleId)} />
      ) : m.kind === "practice" ? (
        <PracticeSection assignmentModuleId={m.assignmentModuleId} actor={toActor(user)} />
      ) : m.kind === "practice_exam" ? (
        <PracticalPanel info={await practicalExamInfo(toActor(user), m.assignmentModuleId)} />
      ) : (
        <>
          {m.items.length > 1 && (
            <nav aria-label={t("module.stepsNav")}>
              <ol className="flex flex-wrap gap-2">
                {m.items.map((it, i) => (
                  <li key={it.id}>
                    <Link
                      href={`/learn/${assignmentId}/${moduleId}?step=${i}`}
                      aria-current={i === index ? "step" : undefined}
                      className="flex min-h-12 items-center gap-2 rounded-full border px-3 text-sm hover:bg-muted aria-[current=step]:border-primary aria-[current=step]:bg-primary/10"
                    >
                      {it.acknowledgedAt ? (
                        <CheckCircle2 aria-label={t("module.stepDone")} className="size-4 text-emerald-600" />
                      ) : (
                        <Circle aria-hidden="true" className="size-4" />
                      )}
                      <span className="max-w-48 truncate">{titleOf(it)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          {item && (
            <article aria-labelledby="step-heading" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="step-heading" className="text-xl font-semibold">
                  {t("module.stepOf", { n: index + 1, total: m.items.length })}: {titleOf(item)}
                </h2>
                {(item.kind === "card_section" || ["text", "instruction", "checklist"].includes(item.contentType ?? "")) && <ReadAloud targetId="step-body" />}
              </div>
              <StepBody item={item} m={m} />
            </article>
          )}

          {allAcked && m.quiz.length > 0 && <QuizPanel assignmentModuleId={m.assignmentModuleId} questions={m.quiz} />}
          {allAcked && m.quiz.length === 0 && !done && m.remoteAllowed && <p className="text-muted-foreground">{t("module.finishing")}</p>}
        </>
      )}
    </section>
  );
}

async function StepBody({ item, m }: { item: LearnItem; m: Awaited<ReturnType<typeof learnModuleByIds>> }) {
  const common = {
    itemId: item.id,
    title: item.title,
    initialReached: item.reachedEnd,
    initialRatio: item.progressRatio,
    acknowledged: !!item.acknowledgedAt,
  };
  if (item.kind === "card_section") {
    return (
      <StepTracker key={item.id} {...common} mode={{ kind: "scroll" }}>
        <div id="step-body">
          {m.card && <CardView card={{ identity: m.card.identity, sections: m.card.sections, linkedContents: [] }} showPlan={false} only={[item.sectionKey!]} links={false} />}
        </div>
      </StepTracker>
    );
  }
  const assets = await assetsInfo(item.assetIds ?? []);
  const first = item.assetIds?.[0] ? assets.get(item.assetIds[0]) : undefined;
  const description = (item.body as { description?: string } | undefined)?.description;
  if (item.contentType === "video" && first) {
    return (
      <StepTracker key={item.id} {...common} mode={{ kind: "video", assetId: first.id, durationSec: item.videoDurationSec ?? 0, target: m.videoWatchRatio }}>
        {description && <p className="whitespace-pre-line text-muted-foreground">{description}</p>}
      </StepTracker>
    );
  }
  if (item.contentType === "pdf" && first) {
    return (
      <StepTracker key={item.id} {...common} mode={{ kind: "pdf", assetId: first.id, fileName: first.originalName }}>
        {description && <p className="whitespace-pre-line text-muted-foreground">{description}</p>}
      </StepTracker>
    );
  }
  if (item.contentType === "form_template" && first) {
    return (
      <StepTracker key={item.id} {...common} mode={{ kind: "download", assetId: first.id, fileName: first.originalName }}>
        {description && <p className="whitespace-pre-line">{description}</p>}
      </StepTracker>
    );
  }
  return (
    <StepTracker key={item.id} {...common} mode={{ kind: "scroll" }}>
      <div id="step-body">
        <ContentRenderer type={item.contentType!} title={item.title} body={item.body ?? {}} assets={assets} />
      </div>
    </StepTracker>
  );
}

/** Pratik modül: görevler ve seviyeler (salt okunur; işaretlemeyi eğitmen yapar). */
async function PracticeSection({ assignmentModuleId, actor }: { assignmentModuleId: string; actor: ReturnType<typeof toActor> }) {
  const t = await getTranslations("practice.mine");
  const view = await practiceModule(actor, assignmentModuleId);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground" role="status">
        {view.status === "locked" ? t("locked") : t("progress", { done: view.independent, total: view.tasks.length })}
      </p>
      <PracticeTasks assignmentModuleId={view.assignmentModuleId} tasks={view.tasks} canMark={false} />
    </div>
  );
}
