import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { adminAccess } from "@/features/admin/guard";
import { SignatoriesForm } from "@/features/certification/components/signatories-form";
import { assetsInfo } from "@/server/services/media";
import { getSettings } from "@/server/services/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("certificates.signatories");
  return { title: t("title") };
}

/** Sertifika şablonu: imza yetkilileri ve taranmış imzaları (FG-7.2, karar #79). */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const access = await adminAccess("certificates.template");
  if (!access) return <NotFoundView />;
  const [t, tNav, settings] = await Promise.all([getTranslations("certificates.signatories"), getTranslations("sections.admin"), getSettings(["certificate.signatories"])]);
  const list = settings["certificate.signatories"];
  const assets = await assetsInfo(list.map((s) => s.signatureAssetId).filter((x): x is string => !!x));
  return (
    <section>
      <PageHeader title={t("title")} description={t("description")} back={{ href: "/admin", label: tNav("title") }} />
      <SignatoriesForm initial={list.map((s) => ({ name: s.name, title: s.title, signature: s.signatureAssetId ? (assets.get(s.signatureAssetId) ?? null) : null }))} />
    </section>
  );
}
