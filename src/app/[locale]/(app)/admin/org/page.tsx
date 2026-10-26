import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { adminAccess } from "@/features/admin/guard";
import { OrgTree } from "@/features/org/components/org-tree";
import { Link } from "@/i18n/navigation";
import { getOrgTree } from "@/server/services/org";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.org");
  return { title: t("title") };
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const access = await adminAccess("org.manage");
  if (!access) return <NotFoundView />;
  const [t, tNav, tree] = await Promise.all([
    getTranslations("admin.org"),
    getTranslations("sections.admin"),
    getOrgTree(access.actor),
  ]);

  return (
    <section className="max-w-5xl">
      <PageHeader
        title={t("title")}
        description={t("intro")}
        back={{ href: "/admin", label: tNav("title") }}
        actions={
          <Button nativeButton={false} render={<Link href="/admin/org/units/new?kind=department" />}>
            <Plus aria-hidden="true" />
            {t("addDepartment")}
          </Button>
        }
      />
      <OrgTree nodes={tree} />
    </section>
  );
}
