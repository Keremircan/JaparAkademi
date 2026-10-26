import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { adminAccess, orNull } from "@/features/admin/guard";
import { PositionForm } from "@/features/org/components/position-form";
import { getPosition, listPositionOptions, listUnitOptions } from "@/server/services/org";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.org.positionForm");
  return { title: t("edit") };
}

export default function Page({ params }: PageProps<"/[locale]/admin/org/positions/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const access = await adminAccess("org.manage");
  if (!access) return <NotFoundView />;
  const { id } = await params;
  const position = await orNull(getPosition(access.actor, id));
  if (!position) return <NotFoundView />;
  const [t, units, positions] = await Promise.all([
    getTranslations("admin.org"),
    listUnitOptions(access.actor),
    listPositionOptions(access.actor, { includePassive: true }),
  ]);

  return (
    <section>
      <PageHeader title={t("positionForm.edit")} back={{ href: "/admin/org", label: t("title") }} />
      <PositionForm position={position} units={units} positionOptions={positions} />
    </section>
  );
}
