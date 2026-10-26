import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { orNull } from "@/features/admin/guard";
import { libraryAccess } from "@/features/content/guard";
import { cardDiffSections } from "@/features/positions/compare";
import { SectionsDiff } from "@/features/positions/components/diff-view";
import { getCardVersion } from "@/server/services/positions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("compare");
  return { title: t("title") };
}

export default function Page({ params, searchParams }: PageProps<"/[locale]/manage/positions/[id]/compare">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f-]{36}$/;

async function Content({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await libraryAccess();
  if (!access) return <NotFoundView />;
  const { id } = await params;
  const { from, to } = await searchParams;
  if (typeof from !== "string" || typeof to !== "string" || !UUID.test(from) || !UUID.test(to)) return <NotFoundView />;
  const [a, b] = await Promise.all([orNull(getCardVersion(access.actor, from)), orNull(getCardVersion(access.actor, to))]);
  if (!a || !b || a.positionId !== id || b.positionId !== id) return <NotFoundView />;
  const [t, tp] = await Promise.all([getTranslations("compare"), getTranslations("positions")]);

  return (
    <section className="max-w-4xl">
      <PageHeader
        title={t("heading", { from: a.version, to: b.version })}
        description={a.identity.positionName}
        back={{ href: `/manage/positions/${id}`, label: tp("title") }}
      />
      <SectionsDiff sections={await cardDiffSections(a, b)} />
    </section>
  );
}
