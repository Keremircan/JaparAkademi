import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { TypeIcon } from "@/features/content/components/type-icon";
import { libraryAccess } from "@/features/content/guard";
import { Link } from "@/i18n/navigation";
import { can } from "@/server/authz/policy";
import { approvalQueue } from "@/server/services/content";
import { cardApprovalQueue } from "@/server/services/positions";
import { questionApprovalQueue } from "@/server/services/questions";
import { secondSignatureQueue } from "@/server/services/practice";
import { decisionQueue, readinessQueue, type PendingPerson } from "@/server/services/readiness";
import { hasRole } from "@/server/authz/policy";
import { listClassroomSessions } from "@/server/services/classroom";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("content.queue");
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
  const access = await libraryAccess();
  if (!access || !(can(access.actor, "content.approve_section") || can(access.actor, "content.approve_ohs") || hasRole(access.actor, "section_manager") || hasRole(access.actor, "hr")))
    return <NotFoundView />;
  const [t, tt, tNav, format, queue, cards, questionQueue] = await Promise.all([
    getTranslations("content.queue"),
    getTranslations("content"),
    getTranslations("sections.manage"),
    getFormatter(),
    approvalQueue(access.actor),
    cardApprovalQueue(access.actor),
    questionApprovalQueue(access.actor),
  ]);
  const [secondSign, readiness, decisions] = await Promise.all([secondSignatureQueue(access.actor), readinessQueue(access.actor), decisionQueue(access.actor)]);
  const classroom = (await listClassroomSessions(access.actor)).pending;
  const when = (d: Date | null) => (d ? format.dateTime(d, { dateStyle: "medium", timeStyle: "short" }) : "—");

  return (
    <section className="max-w-4xl">
      <PageHeader title={t("title")} description={t("description")} back={{ href: "/manage", label: tNav("title") }} />
      {classroom.length > 0 && (
        <section aria-labelledby="classroom-heading" className="mb-8">
          <h2 id="classroom-heading" className="mb-3 text-lg font-semibold">
            {t("classroomHeading")}
          </h2>
          <ul className="divide-y rounded-2xl border">
            {classroom.map((c) => (
              <li key={c.id}>
                <Link href={`/manage/classroom/${c.id}`} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-muted">
                  <span className="min-w-48 flex-1">
                    <span className="block font-medium">{c.moduleTitle}</span>
                    <span className="block text-sm text-muted-foreground">
                      {c.trainerName} · {c.location}
                    </span>
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t(c.isOhs ? "step.ohs" : "step.section")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {queue.length === 0 && cards.length === 0 && classroom.length === 0 && questionQueue.length === 0 && secondSign.length === 0 && readiness.length === 0 && decisions.length === 0 && <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("empty")}</p>}
      {cards.length > 0 && (
        <section aria-labelledby="cards-heading" className="mb-8">
          <h2 id="cards-heading" className="mb-3 text-lg font-semibold">
            {t("cardsHeading")}
          </h2>
          <ul className="divide-y rounded-2xl border">
            {cards.map((c) => (
              <li key={c.versionId}>
                <Link href={`/manage/positions/${c.positionId}`} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-muted">
                  <span className="min-w-48 flex-1">
                    <span className="block font-medium">
                      {c.positionName} <span className="font-normal text-muted-foreground">· {tt("versionN", { version: c.version })}</span>
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {c.unitName} · {t("submittedBy", { name: c.submittedByName ?? "—", date: when(c.submittedAt) })}
                    </span>
                    {c.changeNote && <span className="mt-1 block text-sm">{c.changeNote}</span>}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t(`step.${c.step}`)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <PeopleSection id="readiness" title={t("readinessHeading")} people={readiness} when={when} />
      <PeopleSection id="decisions" title={t("decisionsHeading")} people={decisions} when={when} />
      {secondSign.length > 0 && (
        <section aria-labelledby="practical-heading" className="mb-8">
          <h2 id="practical-heading" className="mb-3 text-lg font-semibold">
            {t("practicalHeading")}
          </h2>
          <ul className="divide-y rounded-2xl border">
            {secondSign.map((x) => (
              <li key={x.id}>
                <Link href={`/trainer/evaluations/${x.id}`} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-muted">
                  <span className="min-w-48 flex-1">
                    <span className="block font-medium">
                      {x.traineeName} <span className="font-normal text-muted-foreground">· {x.title}</span>
                    </span>
                    <span className="block text-sm text-muted-foreground">{t("submittedBy", { name: x.evaluatorName, date: when(x.submittedAt) })}</span>
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t("practicalScore", { score: x.score ?? 0, passed: x.passed ? "yes" : "no" })}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {questionQueue.length > 0 && (
        <section aria-labelledby="questions-heading" className="mb-8">
          <h2 id="questions-heading" className="mb-3 text-lg font-semibold">
            {t("questionsHeading")}
          </h2>
          <ul className="divide-y rounded-2xl border">
            {questionQueue.map((q) => (
              <li key={q.versionId}>
                <Link href={`/manage/questions/${q.questionId}`} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-muted">
                  <span className="min-w-48 flex-1">
                    <span className="line-clamp-2 block font-medium">{q.stem}</span>
                    <span className="block text-sm text-muted-foreground">
                      {q.ownerName ?? tt("common")} · {q.topic} · {t("submittedBy", { name: q.createdByName, date: when(q.createdAt) })}
                    </span>
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t("step.ohs")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {queue.length > 0 && (
        <section aria-labelledby="contents-heading">
          <h2 id="contents-heading" className="mb-3 text-lg font-semibold">
            {t("contentsHeading")}
          </h2>
          <ul className="divide-y rounded-2xl border">
            {queue.map((q) => (
              <li key={q.versionId}>
                <Link href={`/manage/library/${q.contentId}`} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-muted">
                  <TypeIcon type={q.type} className="size-6 shrink-0 text-muted-foreground" />
                  <span className="min-w-48 flex-1">
                    <span className="block font-medium">
                      {q.title} <span className="font-normal text-muted-foreground">· {tt("versionN", { version: q.version })}</span>
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {q.ownerName ?? tt("common")} · {t("submittedBy", { name: q.submittedByName ?? "—", date: when(q.submittedAt) })}
                    </span>
                    {q.changeNote && <span className="mt-1 block text-sm">{q.changeNote}</span>}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t(`step.${q.step}`)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

/** İşe başlama onayı ve karar bekleyen kişiler (Ekran 9'a gider). */
function PeopleSection({ id, title, people, when }: { id: string; title: string; people: PendingPerson[]; when: (d: Date | null) => string }) {
  if (people.length === 0) return null;
  return (
    <section aria-labelledby={`${id}-heading`} className="mb-8">
      <h2 id={`${id}-heading`} className="mb-3 text-lg font-semibold">
        {title}
      </h2>
      <ul className="divide-y rounded-2xl border">
        {people.map((x) => (
          <li key={x.assignmentId}>
            <Link href={`/manage/readiness/${x.assignmentId}`} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-muted">
              <span className="min-w-48 flex-1">
                <span className="block font-medium">{x.name}</span>
                <span className="block text-sm text-muted-foreground">
                  {x.positionName} · {x.unitName}
                </span>
              </span>
              <span className="text-sm text-muted-foreground">{when(x.since)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
