import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { adminAccess } from "@/features/admin/guard";
import { LegalForm } from "@/features/legal/components/legal-form";
import { currentPersonnelText } from "@/server/services/legal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.legal");
  return { title: t("newDraft") };
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const access = await adminAccess("legal.manage");
  if (!access) return <NotFoundView />;
  const [t, current] = await Promise.all([getTranslations("admin.legal"), currentPersonnelText()]);
  // Yeni sürüm, güncel metnin kopyasıyla başlar
  return (
    <section>
      <PageHeader title={t("newDraft")} back={{ href: "/admin/legal", label: t("title") }} />
      <LegalForm text={current ? { id: "", title: current.title, body: current.body } : undefined} />
    </section>
  );
}
