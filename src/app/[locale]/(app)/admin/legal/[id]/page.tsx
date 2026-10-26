import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { adminAccess, orNull } from "@/features/admin/guard";
import { LegalForm } from "@/features/legal/components/legal-form";
import { getLegalText } from "@/server/services/legal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.legal");
  return { title: t("title") };
}

export default function Page({ params }: PageProps<"/[locale]/admin/legal/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const access = await adminAccess("legal.manage");
  if (!access) return <NotFoundView />;
  const { id } = await params;
  const text = await orNull(getLegalText(access.actor, id));
  if (!text || text.publishedAt) return <NotFoundView />;
  const t = await getTranslations("admin.legal");
  return (
    <section>
      <PageHeader title={t("version", { version: text.version })} back={{ href: "/admin/legal", label: t("title") }} />
      <LegalForm text={{ id: text.id, title: text.title, body: text.body }} />
    </section>
  );
}
