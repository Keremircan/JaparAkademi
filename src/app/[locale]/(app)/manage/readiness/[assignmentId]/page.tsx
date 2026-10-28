import { CheckCircle2, Circle, Clock } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { ActionButton } from "@/components/forms/action-button";
import { issueAttendanceAction } from "@/features/certification/actions";
import { CertificateList } from "@/features/certification/components/certificate-list";
import { ProcessPanel, ReadinessPanel } from "@/features/certification/components/decision-panels";
import { ExamAttemptList } from "@/features/exams/components/attempt-list";
import { PracticalList } from "@/features/practice/components/practical-list";
import { getSectionUser } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import { toActor } from "@/server/services/auth";
import { canIssueAttendance, certificatesForUser } from "@/server/services/certificates";
import { readinessReview } from "@/server/services/readiness";
import { getSettings } from "@/server/services/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("readiness");
  return { title: t("title") };
}

/** İşe başlama onayı (Ekran 9, FG-7.1) ve tüm haklarda başarısızlık kararı (SPEC 3.1): sonuçlar tek ekranda. */
export default function Page({ params }: PageProps<"/[locale]/manage/readiness/[assignmentId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ assignmentId: string }> }) {
  const user = await getSectionUser("manage");
  if (!user) return <NotFoundView />;
  const actor = toActor(user);
  const { assignmentId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(assignmentId)) return <NotFoundView />;
  const view = await readinessReview(actor, assignmentId).catch((err: unknown) => {
    if (err instanceof AppError) return null;
    throw err;
  });
  if (!view) return <NotFoundView />;
  const [t, tNav, format, certs, canIssue, settings] = await Promise.all([
    getTranslations("readiness"),
    getTranslations("sections.manage"),
    getFormatter(),
    certificatesForUser(actor, view.person.userId).catch(() => []),
    canIssueAttendance(actor, view.person.userId),
    getSettings(["decision.extra_attempts_default"]),
  ]);
  const dt = (d: Date) => format.dateTime(d, { dateStyle: "medium" });
  const completed = view.modules.filter((m) => m.status === "completed");
  const reopenable = completed.map((m) => ({ id: m.id, title: m.title }));
  const failedExams = view.modules
    .filter((m) => (m.kind === "theory_exam" || m.kind === "practice_exam") && m.status !== "completed")
    .map((m) => ({ id: m.id, title: m.title }));

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        title={view.person.name}
        description={`${view.person.positionName} · ${view.person.unitName}${view.person.sicilNo ? ` · ${view.person.sicilNo}` : ""}`}
        back={{ href: "/manage/approvals", label: tNav("title") }}
      />
      {view.reason === "recertification" && (
        <p className="rounded-2xl border border-sky-600/40 bg-sky-600/5 p-4">{t("recertNotice")}</p>
      )}
      <p className="rounded-2xl border p-4" role="status">
        {t(`status.${view.status}`)}
        {view.person.trainerName && ` · ${t("trainer", { name: view.person.trainerName })}`}
      </p>

      <section aria-labelledby="modules-heading" className="flex flex-col gap-2">
        <h2 id="modules-heading" className="text-lg font-semibold">
          {t("modules")}
        </h2>
        <ul className="divide-y rounded-2xl border">
          {view.modules.map((m) => (
            <li key={m.id} className="flex min-h-14 flex-wrap items-center gap-3 px-4 py-2">
              {m.status === "completed" ? (
                <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-emerald-600" />
              ) : m.status === "review_required" ? (
                <Clock aria-hidden="true" className="size-5 shrink-0 text-amber-600" />
              ) : (
                <Circle aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-48 flex-1">
                <span className="block">
                  {m.title}
                  {m.isOhs && <span className="ms-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs">{t("ohs")}</span>}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {t(`kinds.${m.kind}`)} · {t(`moduleStatus.${m.status}`)}
                  {m.completedAt && ` · ${dt(m.completedAt)}`}
                  {m.completedVia && ` · ${t(`via.${m.completedVia}`)}`}
                  {m.expiresAt && ` · ${t("validUntil", { date: dt(m.expiresAt) })}`}
                  {m.attemptsLeft !== null && ` · ${t("attemptsLeft", { count: m.attemptsLeft })}`}
                </span>
              </span>
              {canIssue && m.status === "completed" && !m.isOhs && (
                <ActionButton action={issueAttendanceAction.bind(null, m.id)}>{t("issueAttendance")}</ActionButton>
              )}
            </li>
          ))}
        </ul>
      </section>

      <ExamAttemptList actor={actor} assignmentId={view.assignmentId} />
      <PracticalList actor={actor} assignmentId={view.assignmentId} />

      {view.can.readiness && <ReadinessPanel assignmentId={view.assignmentId} reopenable={reopenable} />}
      {view.can.process && (
        <ProcessPanel assignmentId={view.assignmentId} exams={failedExams} reopenable={reopenable} defaultExtra={settings["decision.extra_attempts_default"]} />
      )}

      {view.history.length > 0 && (
        <section aria-labelledby="history-heading" className="flex flex-col gap-2">
          <h2 id="history-heading" className="text-lg font-semibold">
            {t("history")}
          </h2>
          <ul className="divide-y rounded-2xl border">
            {view.history.map((h) => (
              <li key={h.id} className="flex flex-col gap-1 px-4 py-3">
                <span className="font-medium">{t(`decisions.${h.decision}`)}</span>
                <span className="text-sm text-muted-foreground">
                  {h.byName} · {dt(h.at)}
                </span>
                {h.text && <span>{h.text}</span>}
                {h.moduleTitles.length > 0 && <span className="text-sm text-muted-foreground">{t("modulesList", { list: h.moduleTitles.join(", ") })}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {certs.length > 0 && (
        <section aria-labelledby="certs-heading" className="flex flex-col gap-2">
          <h2 id="certs-heading" className="text-lg font-semibold">
            {t("certificates")}
          </h2>
          <CertificateList items={certs} />
        </section>
      )}
    </section>
  );
}
