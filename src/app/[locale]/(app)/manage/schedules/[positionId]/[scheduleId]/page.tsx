import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { orNull } from "@/features/admin/guard";
import { ProgramForm } from "@/features/schedules/components/program-form";
import { schedulesAccess } from "@/features/schedules/guard";
import { getWorkSchedule } from "@/server/services/schedules";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("schedules.manage");
  return { title: t("editProgram") };
}

const UUID = /^[0-9a-f-]{36}$/;

/** Programı düzenleme ya da kaldırma (kararlar #251–253). */
export default function Page({ params }: PageProps<"/[locale]/manage/schedules/[positionId]/[scheduleId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ positionId: string; scheduleId: string }> }) {
  const access = await schedulesAccess();
  if (!access) return <NotFoundView />;
  const { positionId, scheduleId } = await params;
  if (!UUID.test(positionId) || !UUID.test(scheduleId)) return <NotFoundView />;
  const program = await orNull(getWorkSchedule(access.actor, scheduleId));
  if (!program || program.positionId !== positionId) return <NotFoundView />;
  const t = await getTranslations("schedules.manage");

  return (
    <section className="flex max-w-4xl flex-col gap-2">
      <PageHeader title={t("editProgram")} description={program.name} back={{ href: `/manage/schedules/${positionId}`, label: t("title") }} />
      <ProgramForm
        positionId={positionId}
        scheduleId={program.id}
        initial={{ name: program.name, kind: program.kind, days: program.days, startTime: program.startTime, items: program.items }}
      />
    </section>
  );
}
