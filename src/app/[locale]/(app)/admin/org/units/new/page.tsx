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
  const t = await getTranslations("admin.org");
  return { title: t("title") };
}

export default function Page({ searchParams }: PageProps<"/[locale]/admin/org/units/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await adminAccess("org.manage");
  if (!access) return <NotFoundView />;
  const sp = await searchParams;
  const kind = sp.kind === "section" ? "section" : "department";
  const parentId = typeof sp.parentId === "string" ? sp.parentId : null;
  const parent = kind === "section" && parentId ? await orNull(getOrgUnit(access.actor, parentId)) : null;
  if (kind === "section" && !parent) return <NotFoundView />;
  const t = await getTranslations("admin.org");

  return (
    <section>
      <PageHeader
        title={kind === "department" ? t("unitForm.newDepartment") : t("unitForm.newSection")}
        back={{ href: "/admin/org", label: t("title") }}
      />
      <UnitForm kind={kind} parent={parent ? { id: parent.id, name: parent.name } : null} />
    </section>
  );
}
