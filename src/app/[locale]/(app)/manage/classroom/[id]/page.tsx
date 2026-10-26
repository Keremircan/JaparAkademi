import { FileText, Send } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { ActionButton } from "@/components/forms/action-button";
import { orNull } from "@/features/admin/guard";
import { approveClassroomAction, rejectClassroomAction, submitClassroomAction } from "@/features/classroom/actions";
import { ClassroomForm } from "@/features/classroom/components/classroom-form";
import { ApprovalPanel } from "@/features/content/components/approval-panel";
import { libraryAccess } from "@/features/content/guard";
import { classroomModules, getClassroomSession } from "@/server/services/classroom";
import { assetsInfo } from "@/server/services/media";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("classroom");
  return { title: t("title") };
}

export default function Page({ params }: PageProps<"/[locale]/manage/classroom/[id]">) {
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
  const s = await orNull(getClassroomSession(access.actor, id));
  if (!s) return <NotFoundView />;
  const [t, format] = await Promise.all([getTranslations("classroom"), getFormatter()]);
  const form = s.scannedFormAssetId ? ((await assetsInfo([s.scannedFormAssetId])).get(s.scannedFormAssetId) ?? null) : null;
  const lastRejection = [...s.decisions].reverse().find((d) => d.decision === "rejected");

  return (
    <section className="max-w-4xl">
      <PageHeader
        title={s.module.title}
        description={`${t(`status.${s.status}`)} · ${t("recordedBy", { name: s.recordedByName })}`}
        back={{ href: "/manage/classroom", label: t("title") }}
        actions={
          s.can.submit && (
            <ActionButton variant="default" confirmText={t("submitConfirm")} action={submitClassroomAction.bind(null, s.id)}>
              <Send aria-hidden="true" />
              {t("submit")}
            </ActionButton>
          )
        }
      />
      {lastRejection && s.status !== "approved" && (
        <div role="status" className="mb-6 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="font-medium text-destructive">{t("rejectedBy", { name: lastRejection.decidedByName })}</p>
          <p className="mt-1 whitespace-pre-line">{lastRejection.comment}</p>
        </div>
      )}
      {s.status === "approved" && (
        <p role="status" className="mb-6 rounded-xl border border-emerald-600/40 bg-emerald-500/10 p-4">
          {t("approvedNote")}
        </p>
      )}

      {s.can.edit ? (
        <ClassroomForm
          id={s.id}
          modules={await classroomModules(access.actor)}
          form={form}
          initial={{
            moduleId: s.module.id,
            trainer: { userId: s.trainerUserId, name: s.trainerName, sicilNo: "" },
            sessionDate: s.sessionDate,
            durationMin: s.durationMin,
            location: s.location,
            notes: s.notes ?? "",
            attendees: s.attendees.map((a) => ({ userId: a.userId, name: a.name, sicilNo: a.sicilNo })),
          }}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <dl className="grid grid-cols-1 gap-3 rounded-2xl border p-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">{t("form.date")}</dt>
              <dd>{format.dateTime(new Date(`${s.sessionDate}T12:00:00`), { dateStyle: "long" })}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t("form.duration")}</dt>
              <dd>{t("minutes", { n: s.durationMin })}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t("form.location")}</dt>
              <dd>{s.location}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t("form.trainer")}</dt>
              <dd>{s.trainerName}</dd>
            </div>
            {s.notes && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted-foreground">{t("form.notes")}</dt>
                <dd className="whitespace-pre-line">{s.notes}</dd>
              </div>
            )}
            {form && (
              <div className="sm:col-span-2">
                <a href={`/api/media/${form.id}/file`} target="_blank" rel="noopener" className="inline-flex min-h-12 items-center gap-2 underline underline-offset-4">
                  <FileText aria-hidden="true" className="size-5" />
                  {t("form.scannedForm")}: {form.originalName}
                </a>
              </div>
            )}
          </dl>
          <section aria-labelledby="att-heading">
            <h2 id="att-heading" className="mb-3 text-lg font-semibold">
              {t("form.attendees", { count: s.attendees.length })}
            </h2>
            <ul className="divide-y rounded-2xl border">
              {s.attendees.map((a) => (
                <li key={a.userId} className="flex min-h-12 flex-wrap items-center gap-x-3 px-5 py-2">
                  <span className="w-24 font-mono text-sm text-muted-foreground">{a.sicilNo}</span>
                  <span className="flex-1">{a.name}</span>
                  {!a.hasModule && <span className="text-sm text-muted-foreground">{t("noModule")}</span>}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {s.can.approve && (
        <div className="mt-8">
          <ApprovalPanel step={s.module.isOhs ? "ohs" : "section"} approve={approveClassroomAction.bind(null, s.id)} reject={rejectClassroomAction.bind(null, s.id)} />
        </div>
      )}
    </section>
  );
}
