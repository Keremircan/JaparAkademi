import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { orNull } from "@/features/admin/guard";
import { ProgramForm } from "@/features/schedules/components/program-form";
import { schedulesAccess } from "@/features/schedules/guard";
import { positionSchedules } from "@/server/services/schedules";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("schedules.manage");
  return { title: t("new") };
}

/** Yeni (vardiya) programı (karar #251). */
export default function Page({ params }: PageProps<"/[locale]/manage/schedules/[positionId]/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ positionId: string }> }) {
  const access = await schedulesAccess();
  if (!access) return <NotFoundView />;
  const { positionId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(positionId)) return <NotFoundView />;
  const data = await orNull(positionSchedules(access.actor, positionId));
  if (!data) return <NotFoundView />;
  const t = await getTranslations("schedules.manage");

  return (
    <section className="flex max-w-4xl flex-col gap-2">
      <PageHeader title={t("new")} description={`${data.position.unitName} · ${data.position.name}`} back={{ href: `/manage/schedules/${positionId}`, label: data.position.name }} />
      <ProgramForm positionId={positionId} scheduleId={null} initial={null} />
    </section>
  );
}
