import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { adminAccess, orNull } from "@/features/admin/guard";
import { UnitForm } from "@/features/org/components/unit-form";
import { getOrgUnit } from "@/server/services/org";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.org.unitForm");
  return { title: t("edit") };
}

export default function Page({ params }: PageProps<"/[locale]/admin/org/units/[id]">) {
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
  const unit = await orNull(getOrgUnit(access.actor, id));
  if (!unit) return <NotFoundView />;
  const parent = unit.parentId ? await orNull(getOrgUnit(access.actor, unit.parentId)) : null;
  const t = await getTranslations("admin.org");

  return (
    <section>
      <PageHeader title={t("unitForm.edit")} back={{ href: "/admin/org", label: t("title") }} />
      <UnitForm
        unit={{ id: unit.id, name: unit.name, code: unit.code }}
        kind={unit.kind}
        parent={parent ? { id: parent.id, name: parent.name } : null}
      />
    </section>
  );
}
