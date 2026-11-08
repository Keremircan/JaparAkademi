import { Eye, EyeOff, Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { adminAccess } from "@/features/admin/guard";
import { activeOnly, OrgTree, passiveCount } from "@/features/org/components/org-tree";
import { Link } from "@/i18n/navigation";
import { getOrgTree } from "@/server/services/org";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.org");
  return { title: t("title") };
}

export default function Page({ searchParams }: PageProps<"/[locale]/admin/org">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await adminAccess("org.manage");
  if (!access) return <NotFoundView />;
  const showPassive = (await searchParams).passive === "1";
  const [t, tNav, tDel, tree] = await Promise.all([
    getTranslations("admin.org"),
    getTranslations("sections.admin"),
    getTranslations("deletion"),
    getOrgTree(access.actor),
  ]);
  const passive = passiveCount(tree);

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
      {passive > 0 && (
        <div className="mb-4 flex justify-end">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={showPassive ? "/admin/org" : "/admin/org?passive=1"} />}>
            {showPassive ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            {showPassive ? tDel("hidePassive") : `${tDel("showPassive")} (${passive})`}
          </Button>
        </div>
      )}
      <OrgTree nodes={showPassive ? tree : activeOnly(tree)} />
    </section>
  );
}
