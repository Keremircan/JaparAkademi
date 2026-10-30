import { Archive } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { ActionButton } from "@/components/forms/action-button";
import { orNull } from "@/features/admin/guard";
import { ApprovalPanel } from "@/features/content/components/approval-panel";
import { approveQuestionAction, archiveQuestionAction, rejectQuestionAction } from "@/features/questions/actions";
import { QuestionForm } from "@/features/questions/components/question-form";
import { questionsAccess } from "@/features/questions/guard";
import { assetsInfo } from "@/server/services/media";
import { getQuestion, listTopics, questionModuleOptions } from "@/server/services/questions";
import { ImageStage, RegionShapes } from "@/features/questions/components/hotspot-image";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("questions");
  return { title: t("title") };
}

export default function Page({ params }: PageProps<"/[locale]/manage/questions/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const access = await questionsAccess();
  if (!access) return <NotFoundView />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return <NotFoundView />;
  const q = await orNull(getQuestion(access.actor, id));
  if (!q) return <NotFoundView />;
  const [t, format, topics, modules] = await Promise.all([getTranslations("questions"), getFormatter(), listTopics(access.actor), questionModuleOptions(access.actor)]);
  const v = q.editable;
  const image = v?.mediaAssetId ? ((await assetsInfo([v.mediaAssetId])).get(v.mediaAssetId) ?? null) : null;
  const dt = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });
  const pendingVersion = q.versions.find((x) => x.status === "ohs_review");
  const lastRejection = [...q.decisions].reverse().find((d) => d.decision === "rejected" && d.versionId === v?.id);

  return (
    <section className="max-w-4xl">
      <PageHeader
        title={t("detailTitle")}
        description={`${q.ownerName ?? t("form.common")}${q.isOhs ? ` · ${t("ohs")}` : ""}`}
        back={{ href: "/manage/questions", label: t("title") }}
        actions={
          q.can.archive && (
            <ActionButton variant="destructive" confirmText={t("archiveConfirm")} action={archiveQuestionAction.bind(null, q.id)}>
              <Archive aria-hidden="true" />
              {t("archiveButton")}
            </ActionButton>
          )
        }
      />
      {q.archived && <p className="mb-6 rounded-xl border bg-muted p-4">{t("archivedNote")}</p>}
      {pendingVersion && <p className="mb-6 rounded-xl border bg-sky-500/10 p-4">{t("pendingNote", { version: pendingVersion.version })}</p>}
      {lastRejection && v?.status === "rejected" && (
        <div role="status" className="mb-6 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="font-medium text-destructive">{t("rejectedBy", { name: lastRejection.decidedByName })}</p>
          <p className="mt-1 whitespace-pre-line">{lastRejection.comment}</p>
        </div>
      )}

      {q.can.edit && v ? (
        <QuestionForm
          key={v.id}
          mode="edit"
          questionId={q.id}
          isOhs={q.isOhs}
          topics={topics}
          modules={modules}
          image={image}
          initial={{
            type: v.type,
            stem: v.stem,
            options: v.options,
            correctIndex: v.correctIndex,
            pairs: v.pairs,
            regions: v.regions,
            explanation: v.explanation ?? "",
            topic: v.topic,
            difficulty: v.difficulty,
            isOhsCritical: v.isOhsCritical,
            moduleIds: q.modules.map((m) => m.id),
          }}
        />
      ) : (
        v && (
          <article className="flex flex-col gap-3 rounded-2xl border p-5">
            <p className="text-lg font-medium">{v.stem}</p>
            <p className="text-sm text-muted-foreground">{t(`form.typeLabels.${v.type}`)}</p>
            {v.type === "hotspot" && v.mediaAssetId ? (
              // Doğru bölgeler yalnızca soru bankasını görebilenlere gösterilir
              <ImageStage src={`/api/media/${v.mediaAssetId}/image`} overlay={<RegionShapes regions={v.regions ?? []} />} />
            ) : (
              v.mediaAssetId && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/media/${v.mediaAssetId}/image`} alt="" className="max-h-80 w-full rounded-xl border object-contain" />
              )
            )}
            {v.type === "matching" && (
              <ol className="flex flex-col gap-1">
                {(v.pairs ?? []).map((p, i) => (
                  <li key={i}>
                    {i + 1}. {p.left} ↔ <span className="font-medium text-emerald-700 dark:text-emerald-400">{p.right}</span>
                  </li>
                ))}
              </ol>
            )}
            {(v.type === "single_choice" || v.type === "true_false") && (
              <ol className="flex flex-col gap-1">
                {v.options.map((o, i) => (
                  <li key={i} className={i === v.correctIndex ? "font-medium text-emerald-700 dark:text-emerald-400" : ""}>
                    {String.fromCharCode(65 + i)}) {o} {i === v.correctIndex && `(${t("correct")})`}
                  </li>
                ))}
              </ol>
            )}
            <p className="text-sm text-muted-foreground">
              {v.topic} · {t(`form.difficulties.${v.difficulty as 1}`)}
              {v.isOhsCritical && ` · ${t("critical")}`}
            </p>
            {v.explanation && <p className="text-sm">{v.explanation}</p>}
            <p className="text-sm text-muted-foreground">{q.modules.map((m) => m.title).join(", ")}</p>
          </article>
        )
      )}

      {q.can.approve && pendingVersion && (
        <div className="mt-8">
          <ApprovalPanel step="ohs" approve={approveQuestionAction.bind(null, pendingVersion.id)} reject={rejectQuestionAction.bind(null, pendingVersion.id)} />
        </div>
      )}

      <section aria-labelledby="versions-heading" className="mt-8">
        <h2 id="versions-heading" className="mb-3 text-lg font-semibold">
          {t("versions")}
        </h2>
        <ol className="flex flex-col gap-2">
          {q.versions.map((x) => (
            <li key={x.id} className="rounded-xl border px-4 py-3">
              <span className="font-medium">{t("versionN", { version: x.version })}</span> · {t(`versionStatus.${x.status}`)}
              {x.used && ` · ${t("used")}`}
              <span className="block text-sm text-muted-foreground">
                {x.createdByName} · {dt(x.createdAt)}
              </span>
              {q.decisions
                .filter((d) => d.versionId === x.id)
                .map((d, i) => (
                  <span key={i} className="block text-sm">
                    {t(`decision.${d.decision}`, { name: d.decidedByName, date: dt(d.decidedAt) })}
                    {d.comment && ` — ${d.comment}`}
                  </span>
                ))}
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
