import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { orNull } from "@/features/admin/guard";
import { contentDiffSections } from "@/features/content/compare";
import { libraryAccess } from "@/features/content/guard";
import { SectionsDiff } from "@/features/positions/components/diff-view";
import { getVersion } from "@/server/services/content";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("compare");
  return { title: t("title") };
}

export default function Page({ params, searchParams }: PageProps<"/[locale]/manage/library/[id]/compare">) {
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
  const [a, b] = await Promise.all([orNull(getVersion(access.actor, from)), orNull(getVersion(access.actor, to))]);
  if (!a || !b || a.contentId !== id || b.contentId !== id) return <NotFoundView />;
  const [t, tl] = await Promise.all([getTranslations("compare"), getTranslations("content.library")]);
  return (
    <section className="max-w-4xl">
      <PageHeader title={t("heading", { from: a.version, to: b.version })} description={b.title} back={{ href: `/manage/library/${id}`, label: tl("title") }} />
      <SectionsDiff sections={await contentDiffSections(a, b)} />
    </section>
  );
}
