import { Archive, FilePlus2, GitCompare, Pencil, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { ActionButton } from "@/components/forms/action-button";
import { Button } from "@/components/ui/button";
import { orNull } from "@/features/admin/guard";
import { approveVersionAction, archiveContentAction, discardDraftAction, newVersionAction, rejectVersionAction } from "@/features/content/actions";
import { ApprovalPanel } from "@/features/content/components/approval-panel";
import { ContentRenderer } from "@/features/content/components/content-renderer";
import { StatusBadge } from "@/features/content/components/status-badge";
import { libraryAccess } from "@/features/content/guard";
import { Link } from "@/i18n/navigation";
import { getContent, getVersion } from "@/server/services/content";
import { bodyAssetIds } from "@/server/services/content/body";
import { assetsInfo } from "@/server/services/media";
import { pendingStep } from "@/server/state/content";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("content.library");
  return { title: t("title") };
}

export default function Page({ params, searchParams }: PageProps<"/[locale]/manage/library/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await libraryAccess();
  if (!access) return <NotFoundView />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return <NotFoundView />;
  const content = await orNull(getContent(access.actor, id));
  if (!content) return <NotFoundView />;
  const sp = await searchParams;

  // Gösterilen sürüm: ?v= ile seçilen, yoksa en son sürüm
  const latest = content.versions[0]!;
  const shown = content.versions.find((v) => v.id === sp.v) ?? latest;
  const version = await getVersion(access.actor, shown.id);
  const [t, tt, tl, format, assets] = await Promise.all([
    getTranslations("content.detail"),
    getTranslations("content"),
    getTranslations("content.library"),
    getFormatter(),
    assetsInfo(bodyAssetIds(version.type, version.body)),
  ]);
  const step = pendingStep(latest.status);
  const dt = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });
  const prev = (version: number) => content.versions.find((x) => x.version === version - 1);
  const lastRejection = [...content.approvals].reverse().find((a) => a.versionId === latest.id && a.decision === "rejected");

  return (
    <section className="max-w-4xl">
      <PageHeader
        title={content.title}
        description={[
          tt(`types.${content.type}.label`),
          content.ownerName ?? `${tt("common")} · ${tt(`target.${content.commonTarget ?? "all"}`)}`,
          content.isOhs ? tt("ohs") : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        back={{ href: "/manage/library", label: tl("title") }}
        actions={
          <>
            {content.can.edit && (
              <Button nativeButton={false} render={<Link href={`/manage/library/${id}/edit`} />}>
                <Pencil aria-hidden="true" />
                {t("edit")}
              </Button>
            )}
            {content.can.newVersion && (
              <ActionButton variant="default" action={newVersionAction.bind(null, id)}>
                <FilePlus2 aria-hidden="true" />
                {t("newVersion")}
              </ActionButton>
            )}
            {content.can.discard && (
              <ActionButton variant="outline" confirmText={t("discardConfirm")} action={discardDraftAction.bind(null, id)}>
                <Trash2 aria-hidden="true" />
                {t("discard")}
              </ActionButton>
            )}
            {content.can.archive && (
              <ActionButton variant="destructive" confirmText={t("archiveConfirm")} action={archiveContentAction.bind(null, id)}>
                <Archive aria-hidden="true" />
                {t("archive")}
              </ActionButton>
            )}
          </>
        }
      />

      {content.archivedAt && (
        <p role="status" className="mb-6 rounded-xl border bg-muted p-4">
          {t("archivedAt", { date: dt(content.archivedAt) })}
        </p>
      )}
      {lastRejection && latest.status !== "published" && (
        <div role="status" className="mb-6 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="font-medium text-destructive">{t("rejectedBy", { name: lastRejection.decidedByName })}</p>
          <p className="mt-1 whitespace-pre-line">{lastRejection.comment}</p>
        </div>
      )}
      {step && !content.can.approve && (
        <p role="status" className="mb-6 rounded-xl border bg-muted/50 p-4">
          {t(step === "ohs" ? "waitingOhs" : "waitingSection")}
        </p>
      )}

      {content.tags.length > 0 && (
        <ul className="mb-6 flex flex-wrap gap-2" aria-label={tt("tags.title")}>
          {content.tags.map((tag) => (
            <li key={tag.id}>
              <Link href={`/manage/library?tag=${tag.id}`} className="flex min-h-10 items-center rounded-full border px-3 text-sm hover:bg-muted">
                <span className="sr-only">{tt(`tags.types.${tag.typeKey}`)}: </span>
                {tag.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <article aria-labelledby="preview-heading" className="mb-8 flex flex-col gap-4 rounded-2xl border p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="preview-heading" className="flex-1 text-xl font-semibold">
            {version.title}
          </h2>
          <span className="text-xs">
            <StatusBadge status={shown.status} version={shown.version} />
          </span>
        </div>
        <ContentRenderer type={version.type} title={version.title} body={version.body} assets={assets} />
      </article>

      {content.can.approve && step && (
        <div className="mb-8">
          <ApprovalPanel step={step} approve={approveVersionAction.bind(null, latest.id)} reject={rejectVersionAction.bind(null, latest.id)} />
        </div>
      )}

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-3 text-lg font-semibold">
          {t("history")}
        </h2>
        <ol className="flex flex-col gap-3">
          {content.versions.map((v) => {
            const decisions = content.approvals.filter((a) => a.versionId === v.id);
            return (
              <li key={v.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/manage/library/${id}?v=${v.id}`}
                    aria-current={v.id === shown.id ? "true" : undefined}
                    className="flex min-h-12 items-center font-medium underline-offset-4 hover:underline aria-[current]:no-underline"
                  >
                    {tt("versionN", { version: v.version })}
                  </Link>
                  <span className="text-xs">
                    <StatusBadge status={v.status} version={v.version} />
                  </span>
                  {v.isCurrent && <span className="text-sm text-muted-foreground">{t("current")}</span>}
                  {!v.isCurrent && v.publishedAt && <span className="text-sm text-muted-foreground">{t("superseded")}</span>}
                  {prev(v.version) && (
                    <Link
                      href={`/manage/library/${id}/compare?from=${prev(v.version)!.id}&to=${v.id}`}
                      className="ms-auto inline-flex min-h-12 items-center gap-1 text-sm underline-offset-4 hover:underline"
                    >
                      <GitCompare aria-hidden="true" className="size-4" />
                      {t("compareWith", { version: v.version - 1 })}
                    </Link>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("createdBy", { name: v.createdByName, date: dt(v.createdAt) })}
                  {v.publishedAt && ` · ${t("publishedAt", { date: dt(v.publishedAt) })}`}
                </p>
                {v.changeNote && (
                  <p className="mt-2 whitespace-pre-line">
                    <span className="font-medium">{t("changeNote")}: </span>
                    {v.changeNote}
                  </p>
                )}
                {v.requireReread && <p className="mt-1 text-sm">{t("rereadRequired")}</p>}
                {decisions.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1 text-sm">
                    {decisions.map((a, i) => (
                      <li key={i}>
                        {t(`decision.${a.decision}`, { step: t(`step.${a.step}`), name: a.decidedByName, date: dt(a.decidedAt) })}
                        {a.comment && ` — ${a.comment}`}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </section>
  );
}
