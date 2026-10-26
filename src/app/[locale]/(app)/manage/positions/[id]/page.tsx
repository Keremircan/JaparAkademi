import { CheckCheck, FilePlus2, GitCompare, ListOrdered, Pencil, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { ActionButton } from "@/components/forms/action-button";
import { Button } from "@/components/ui/button";
import { orNull } from "@/features/admin/guard";
import { ApprovalPanel } from "@/features/content/components/approval-panel";
import { StatusBadge } from "@/features/content/components/status-badge";
import { libraryAccess } from "@/features/content/guard";
import {
  approveCardAction,
  createCardAction,
  discardCardDraftAction,
  newCardVersionAction,
  rejectCardAction,
  reviewCardAction,
} from "@/features/positions/actions";
import { CardView } from "@/features/positions/components/card-view";
import { Link } from "@/i18n/navigation";
import { getCardOverview, getCardVersion } from "@/server/services/positions";
import { pendingStep } from "@/server/state/position-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("positions");
  return { title: t("title") };
}

export default function Page({ params, searchParams }: PageProps<"/[locale]/manage/positions/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await libraryAccess();
  if (!access) return <NotFoundView />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return <NotFoundView />;
  const o = await orNull(getCardOverview(access.actor, id));
  if (!o) return <NotFoundView />;
  const sp = await searchParams;
  const [t, tc, format] = await Promise.all([getTranslations("positions"), getTranslations("content.detail"), getFormatter()]);
  const dt = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });

  const latest = o.versions[0];
  const shown = o.versions.find((v) => v.id === sp.v) ?? latest;
  const card = shown ? await getCardVersion(access.actor, shown.id) : null;
  const step = latest ? pendingStep(latest.status) : null;
  const published = o.versions.find((v) => v.isCurrent);
  const lastRejection = latest && [...o.approvals].reverse().find((a) => a.versionId === latest.id && a.decision === "rejected");

  return (
    <section className="max-w-4xl">
      <PageHeader
        title={o.position.name}
        description={`${o.identity.departmentName ?? ""}${o.identity.unitName !== o.identity.departmentName ? ` / ${o.identity.unitName}` : ""} · ${o.position.code}`}
        back={{ href: "/manage/positions", label: t("title") }}
        actions={
          <>
            {o.can.create && (
              <ActionButton variant="default" action={createCardAction.bind(null, id)}>
                <FilePlus2 aria-hidden="true" />
                {t("create")}
              </ActionButton>
            )}
            {o.can.edit && (
              <>
                <Button nativeButton={false} render={<Link href={`/manage/positions/${id}/card`} />}>
                  <Pencil aria-hidden="true" />
                  {t("editCard")}
                </Button>
                <Button variant="outline" nativeButton={false} render={<Link href={`/manage/positions/${id}/plan`} />}>
                  <ListOrdered aria-hidden="true" />
                  {t("editPlan")}
                </Button>
              </>
            )}
            {o.can.newVersion && (
              <ActionButton variant="default" action={newCardVersionAction.bind(null, id)}>
                <FilePlus2 aria-hidden="true" />
                {t("newVersion")}
              </ActionButton>
            )}
            {o.can.discard && (
              <ActionButton variant="outline" confirmText={tc("discardConfirm")} action={discardCardDraftAction.bind(null, id)}>
                <Trash2 aria-hidden="true" />
                {tc("discard")}
              </ActionButton>
            )}
            {o.can.review && (
              <ActionButton variant="outline" confirmText={t("reviewConfirm")} action={reviewCardAction.bind(null, id)}>
                <CheckCheck aria-hidden="true" />
                {t("review")}
              </ActionButton>
            )}
          </>
        }
      />

      {!latest && <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{o.can.create ? t("noCardYet") : t("noCardReadonly")}</p>}
      {o.lastReviewedAt && (
        <p className={`mb-4 text-sm ${o.stale ? "text-amber-800 dark:text-amber-300" : "text-muted-foreground"}`} role="status">
          {t("lastReviewed", { date: format.dateTime(o.lastReviewedAt, { dateStyle: "medium" }) })}
          {o.stale && ` · ${t("staleLong")}`}
        </p>
      )}
      {lastRejection && latest?.status !== "published" && (
        <div role="status" className="mb-6 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="font-medium text-destructive">{tc("rejectedBy", { name: lastRejection.decidedByName })}</p>
          <p className="mt-1 whitespace-pre-line">{lastRejection.comment}</p>
        </div>
      )}
      {step && !o.can.approve && (
        <p role="status" className="mb-6 rounded-xl border bg-muted/50 p-4">
          {tc(step === "ohs" ? "waitingOhs" : "waitingSection")}
        </p>
      )}
      {latest && step === "ohs" && <p className="mb-6 text-sm text-muted-foreground">{t("ohsReason")}</p>}

      {card && shown && (
        <article aria-labelledby="card-heading" className="mb-8 flex flex-col gap-4 rounded-2xl border p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="card-heading" className="flex-1 text-xl font-semibold">
              {t("cardTitle")}
            </h2>
            <span className="text-xs">
              <StatusBadge status={shown.status} version={shown.version} />
            </span>
          </div>
          <CardView card={card} />
        </article>
      )}

      {o.can.approve && step && latest && (
        <div className="mb-8">
          <ApprovalPanel step={step} approve={approveCardAction.bind(null, latest.id)} reject={rejectCardAction.bind(null, latest.id)} />
        </div>
      )}

      {o.versions.length > 0 && (
        <section aria-labelledby="history-heading">
          <h2 id="history-heading" className="mb-3 text-lg font-semibold">
            {tc("history")}
          </h2>
          <ol className="flex flex-col gap-3">
            {o.versions.map((v) => {
              const decisions = o.approvals.filter((a) => a.versionId === v.id);
              const reviews = o.reviews.filter((r) => r.versionId === v.id);
              const compareTo = published && published.id !== v.id ? published : o.versions.find((x) => x.version === v.version - 1);
              return (
                <li key={v.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/manage/positions/${id}?v=${v.id}`}
                      aria-current={v.id === shown?.id ? "true" : undefined}
                      className="flex min-h-12 items-center font-medium underline-offset-4 hover:underline aria-[current]:no-underline"
                    >
                      {t("versionN", { version: v.version })}
                    </Link>
                    <span className="text-xs">
                      <StatusBadge status={v.status} version={v.version} />
                    </span>
                    {v.isCurrent && <span className="text-sm text-muted-foreground">{tc("current")}</span>}
                    {!v.isCurrent && v.publishedAt && <span className="text-sm text-muted-foreground">{tc("superseded")}</span>}
                    {compareTo && (
                      <Link
                        href={`/manage/positions/${id}/compare?from=${compareTo.version < v.version ? compareTo.id : v.id}&to=${compareTo.version < v.version ? v.id : compareTo.id}`}
                        className="ms-auto inline-flex min-h-12 items-center gap-1 text-sm underline-offset-4 hover:underline"
                      >
                        <GitCompare aria-hidden="true" className="size-4" />
                        {t("compareWith", { version: compareTo.version })}
                      </Link>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {tc("createdBy", { name: v.createdByName, date: dt(v.createdAt) })}
                    {v.publishedAt && ` · ${tc("publishedAt", { date: dt(v.publishedAt) })}`}
                  </p>
                  {v.changeNote && (
                    <p className="mt-2 whitespace-pre-line">
                      <span className="font-medium">{tc("changeNote")}: </span>
                      {v.changeNote}
                    </p>
                  )}
                  {decisions.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1 text-sm">
                      {decisions.map((a, i) => (
                        <li key={i}>
                          {tc(`decision.${a.decision}`, { step: tc(`step.${a.step}`), name: a.decidedByName, date: dt(a.decidedAt) })}
                          {a.comment && ` — ${a.comment}`}
                        </li>
                      ))}
                    </ul>
                  )}
                  {reviews.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1 text-sm">
                      {reviews.map((r, i) => (
                        <li key={i}>{t("reviewedBy", { name: r.reviewedByName, date: dt(r.reviewedAt) })}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </section>
  );
}
