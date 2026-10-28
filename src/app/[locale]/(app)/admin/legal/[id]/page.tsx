import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { orNull } from "@/features/admin/guard";
import { legalAccess } from "@/features/legal/access";
import { LegalForm } from "@/features/legal/components/legal-form";
import { ForbiddenError } from "@/server/errors";
import { getLegalText, LEGAL_KINDS } from "@/server/services/legal";

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
  const access = await legalAccess();
  if (!access) return <NotFoundView />;
  const { id } = await params;
  const text = await orNull(
    getLegalText(access.actor, id).catch((err) => {
      if (err instanceof ForbiddenError) return null;
      throw err;
    }),
  );
  if (!text || text.publishedAt) return <NotFoundView />;
  const t = await getTranslations("admin.legal");
  const multi = LEGAL_KINDS[text.kind].locales.length > 1;
  return (
    <section>
      <PageHeader
        title={`${t("version", { version: text.version })} · ${t(`kinds.${text.kind}`)}${multi ? ` · ${t(`locales.${text.locale as "tr" | "en"}`)}` : ""}`}
        back={{ href: `/admin/legal?kind=${text.kind}`, label: t("title") }}
      />
      <LegalForm kind={text.kind} locale={text.locale} text={{ id: text.id, title: text.title, body: text.body }} />
    </section>
  );
}
