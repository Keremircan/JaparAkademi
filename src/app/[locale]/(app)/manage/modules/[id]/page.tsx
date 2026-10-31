import { Archive } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { ActionButton } from "@/components/forms/action-button";
import { orNull } from "@/features/admin/guard";
import { libraryAccess } from "@/features/content/guard";
import { archiveModuleAction } from "@/features/modules/actions";
import { ModuleForm } from "@/features/modules/components/module-form";
import { ModuleContentsEditor, ModuleTasksEditor } from "@/features/modules/components/module-items-editor";
import { Link } from "@/i18n/navigation";
import { getModule } from "@/server/services/modules";
import { listQuizQuestions } from "@/server/services/quiz";
import { QuizEditor } from "@/features/modules/components/quiz-editor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("modules");
  return { title: t("title") };
}

export default function Page({ params }: PageProps<"/[locale]/manage/modules/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const access = await libraryAccess();
  if (!access) return <NotFoundView />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return <NotFoundView />;
  const m = await orNull(getModule(access.actor, id));
  if (!m) return <NotFoundView />;
  const [t, tt, quiz] = await Promise.all([
    getTranslations("modules"),
    getTranslations("content.types"),
    m.kind === "theory" ? listQuizQuestions(access.actor, m.id) : Promise.resolve([]),
  ]);

  return (
    <section className="max-w-4xl">
      <PageHeader
        title={m.title}
        description={[t(`kinds.${m.kind}.label`), m.ownerName ?? t("commonFor", { target: t(`targets.${m.commonTarget ?? "all"}`) }), t("usedInPlans", { n: m.usedInPlans })].join(" · ")}
        back={{ href: "/manage/modules", label: t("title") }}
        actions={
          m.can.archive && (
            <ActionButton variant="destructive" confirmText={t("archiveConfirm")} action={archiveModuleAction.bind(null, m.id)}>
              <Archive aria-hidden="true" />
              {t("archive")}
            </ActionButton>
          )
        }
      />
      {m.archived && (
        <p role="status" className="mb-6 rounded-xl border bg-muted p-4">
          {t("archivedNote")}
        </p>
      )}
      {m.usedInPlans > 0 && m.can.edit && <p className="mb-6 rounded-xl border bg-muted/50 p-4 text-sm">{t("changeNote")}</p>}
      {m.isCardModule && <p className="mb-6 rounded-xl border bg-muted/50 p-4 text-sm">{t("cardModuleNote")}</p>}

      {m.can.edit ? (
        <div className="flex flex-col gap-10">
          <ModuleForm
            mode="edit"
            moduleId={m.id}
            isCommon={m.ownerOrgUnitId === null}
            canEditRemote={m.can.editRemote}
            isCardModule={m.isCardModule}
            values={{
              title: m.title,
              description: m.description,
              durationMin: m.durationMin,
              isOhs: m.isOhs,
              ohsTopic: m.ohsTopic,
              remoteAllowed: m.remoteAllowed,
              validityMonths: m.validityMonths,
              commonTarget: m.commonTarget,
              commonSortOrder: m.commonSortOrder,
            }}
          />
          {m.kind === "theory" && !m.isCardModule && <ModuleContentsEditor key={m.contents.map((c) => c.id).join()} moduleId={m.id} initial={m.contents} />}
          {m.kind === "theory" && <QuizEditor key={quiz.map((q) => q.id).join()} moduleId={m.id} initial={quiz} />}
          {m.kind === "practice" && <ModuleTasksEditor key={m.tasks.map((x) => x.id).join()} moduleId={m.id} initial={m.tasks} competencies={m.competencyOptions} />}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <dl className="grid grid-cols-1 gap-3 rounded-2xl border p-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">{t("form.durationMin")}</dt>
              <dd>{t("minutes", { n: m.durationMin })}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t("form.validityMonths")}</dt>
              <dd>{m.validityMonths ? t("validity", { n: m.validityMonths }) : t("noValidity")}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t("form.remoteAllowed")}</dt>
              <dd>{m.remoteAllowed ? t("yes") : t("classroomOnly")}</dd>
            </div>
            {m.description && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted-foreground">{t("form.description")}</dt>
                <dd className="whitespace-pre-line">{m.description}</dd>
              </div>
            )}
          </dl>
          {m.kind === "theory" && m.contents.length > 0 && (
            <ol className="flex flex-col divide-y rounded-xl border">
              {m.contents.map((c) => (
                <li key={c.id}>
                  <Link href={`/manage/library/${c.id}`} className="flex min-h-12 items-center px-4 hover:bg-muted">
                    {c.title} <span className="ms-2 text-sm text-muted-foreground">{tt(`${c.type as "text"}.label`)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          {m.kind === "practice" && (
            <ol className="flex flex-col divide-y rounded-xl border">
              {m.tasks.map((x, i) => (
                <li key={x.id} className="flex min-h-12 items-center gap-2 px-4 py-2">
                  <span className="text-sm text-muted-foreground">{i + 1}.</span>
                  <span className="flex-1">{x.title}</span>
                  {x.isCritical && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-sm text-destructive">{t("items.critical")}</span>}
                  {x.competencyName && <span className="rounded-full bg-muted px-2 py-0.5 text-sm">{x.competencyName}</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
