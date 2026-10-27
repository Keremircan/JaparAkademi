import { ClipboardCheck, KeyRound, ListChecks, School } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { ActionButton } from "@/components/forms/action-button";
import { Button } from "@/components/ui/button";
import { AssignmentSummaryView } from "@/features/assignments/components/assignment-summary";
import { startPracticalExamAction } from "@/features/practice/actions";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/current-user";
import { hasAnyRole, hasRole } from "@/server/authz/policy";
import { toActor } from "@/server/services/auth";
import { myTrainees } from "@/server/services/assignments";
import { evaluatorOverview } from "@/server/services/practice";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sections.trainer");
  return { title: t("title") };
}

/**
 * Eğitmen paneli (Ekran 6): pratik görev işaretleme, pratik sınav, gözetmen kodu, sınıf eğitimi.
 * Bölüm sorumlusu da kapsamındaki kursiyerleri buradan değerlendirir (karar #66).
 */
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
  if (!hasAnyRole(actor, ["trainer", "section_manager"])) return <NotFoundView />;
  const [t, tp, ts, overview, trainees] = await Promise.all([
    getTranslations("assignments.trainerPanel"),
    getTranslations("practice.panel"),
    getTranslations("sections.trainer"),
    evaluatorOverview(actor),
    hasRole(actor, "trainer") ? myTrainees(actor) : Promise.resolve([]),
  ]);
  return (
    <section className="max-w-4xl">
      <PageHeader
        title={ts("title")}
        description={tp("description")}
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/manage/proctor" />}>
              <KeyRound aria-hidden="true" />
              {tp("proctor")}
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/manage/classroom" />}>
              <School aria-hidden="true" />
              {t("classroom")}
            </Button>
          </>
        }
      />

      <h2 className="mb-3 text-lg font-semibold">{tp("evaluate")}</h2>
      {overview.length === 0 ? (
        <p className="mb-8 rounded-2xl border border-dashed p-6 text-muted-foreground">{tp("empty")}</p>
      ) : (
        <ul className="mb-8 flex flex-col gap-3">
          {overview.map((o) => (
            <li key={o.assignmentId} className="flex flex-col gap-3 rounded-2xl border p-4">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-lg font-medium">{o.name}</span>
                {o.positionName && <span className="text-sm text-muted-foreground">{o.positionName}</span>}
              </div>
              {o.practice.map((m) => (
                <div key={m.assignmentModuleId} className="flex flex-wrap items-center gap-3">
                  <span className="min-w-48 flex-1">
                    <span className="block">{m.title}</span>
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <progress max={m.total || 1} value={m.independent} className="h-2 w-32 accent-primary" aria-hidden="true" />
                      {tp("independentOf", { done: m.independent, total: m.total })} · {tp(`moduleStatus.${m.status}`)}
                    </span>
                  </span>
                  <Button variant={m.status === "locked" ? "outline" : "default"} nativeButton={false} render={<Link href={`/trainer/practice/${m.assignmentModuleId}`} />}>
                    <ListChecks aria-hidden="true" />
                    {m.status === "locked" || m.status === "completed" ? tp("viewTasks") : tp("markTasks")}
                  </Button>
                </div>
              ))}
              {o.exams.map((x) => (
                <div key={x.assignmentModuleId} className="flex flex-wrap items-center gap-3">
                  <span className="min-w-48 flex-1">
                    <span className="block">{x.title}</span>
                    <span className="text-sm text-muted-foreground">
                      {x.openStatus ? tp(`formStatus.${x.openStatus}`) : tp(`moduleStatus.${x.status}`)}
                    </span>
                  </span>
                  {x.openResultId ? (
                    <Button nativeButton={false} render={<Link href={`/trainer/evaluations/${x.openResultId}`} />}>
                      <ClipboardCheck aria-hidden="true" />
                      {x.openStatus === "draft" ? tp("continueExam") : tp("viewExam")}
                    </Button>
                  ) : x.status === "available" || x.status === "in_progress" ? (
                    <ActionButton variant="default" action={startPracticalExamAction.bind(null, x.assignmentModuleId)}>
                      <ClipboardCheck aria-hidden="true" />
                      {tp("startExam")}
                    </ActionButton>
                  ) : null}
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}

      {trainees.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-semibold">{t("trainees")}</h2>
          <ul className="flex flex-col gap-3">
            {trainees.map((a) => (
              <li key={a.id}>
                <details className="rounded-2xl border">
                  <summary className="flex min-h-16 cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                    <span className="min-w-40 flex-1 font-medium">{a.personName}</span>
                    <span className="text-sm text-muted-foreground">{a.positionName}</span>
                    <span className={`text-sm font-medium ${a.overdue ? "text-destructive" : ""}`}>%{a.progress}</span>
                  </summary>
                  <div className="border-t px-5 py-4">
                    <AssignmentSummaryView a={a} viewer={actor} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
