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
  if (!access || !(can(access.actor, "content.approve_section") || can(access.actor, "content.approve_ohs"))) return <NotFoundView />;
  const [t, tt, tNav, format, queue, cards] = await Promise.all([
    getTranslations("content.queue"),
    getTranslations("content"),
    getTranslations("sections.manage"),
    getFormatter(),
    approvalQueue(access.actor),
    cardApprovalQueue(access.actor),
  ]);
  const when = (d: Date | null) => (d ? format.dateTime(d, { dateStyle: "medium", timeStyle: "short" }) : "—");

  return (
    <section className="max-w-4xl">
      <PageHeader title={t("title")} description={t("description")} back={{ href: "/manage", label: tNav("title") }} />
      {queue.length === 0 && cards.length === 0 && <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("empty")}</p>}
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
