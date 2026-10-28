import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { legalAccess } from "@/features/legal/access";
import { LegalForm } from "@/features/legal/components/legal-form";
import { currentText, LEGAL_KINDS } from "@/server/services/legal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.legal");
  return { title: t("newDraft") };
}

export default function Page({ searchParams }: PageProps<"/[locale]/admin/legal/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const access = await legalAccess(typeof sp.kind === "string" ? sp.kind : undefined);
  if (!access) return <NotFoundView />;
  const locales = LEGAL_KINDS[access.kind].locales as readonly string[];
  const locale = typeof sp.locale === "string" && locales.includes(sp.locale) ? sp.locale : locales[0]!;
  const [t, current] = await Promise.all([getTranslations("admin.legal"), currentText(access.kind, locale)]);
  // Yeni sürüm, aynı dildeki güncel metnin kopyasıyla başlar
  return (
    <section>
      <PageHeader
        title={`${t("newDraft")} · ${t(`kinds.${access.kind}`)}${locales.length > 1 ? ` · ${t(`locales.${locale as "tr" | "en"}`)}` : ""}`}
        back={{ href: `/admin/legal?kind=${access.kind}`, label: t("title") }}
      />
      <LegalForm kind={access.kind} locale={locale} text={current ? { id: "", title: current.title, body: current.body } : undefined} />
    </section>
  );
}
