import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { ContentEditor } from "@/features/content/components/content-editor";
import { libraryAccess } from "@/features/content/guard";
import { AppError } from "@/server/errors";
import { getEditableVersion, listTags } from "@/server/services/content";
import { bodyAssetIds } from "@/server/services/content/body";
import { assetsInfo } from "@/server/services/media";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("content.editor");
  return { title: t("heading") };
}

export default function Page({ params }: PageProps<"/[locale]/manage/library/[id]/edit">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const access = await libraryAccess();
  if (!access) return <NotFoundView />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return <NotFoundView />;
  // Düzenlenebilir sürüm yoksa ya da yetki yoksa 404 görünümü
  const version = await getEditableVersion(access.actor, id).catch((err: unknown) => {
    if (err instanceof AppError) return null;
    throw err;
  });
  if (!version) return <NotFoundView />;

  const [t, tt, tags, assets] = await Promise.all([
    getTranslations("content.editor"),
    getTranslations("content"),
    listTags(access.actor),
    assetsInfo([...bodyAssetIds(version.type, version.body), ...(version.en ? bodyAssetIds(version.type, version.en.body) : [])]),
  ]);
  return (
    <section>
      <PageHeader
        title={t("heading")}
        description={`${tt(`types.${version.type}.label`)} · ${tt("versionN", { version: version.version })}`}
        back={{ href: `/manage/library/${id}`, label: version.title }}
      />
      <ContentEditor
        contentId={id}
        type={version.type}
        version={version.version}
        isOhs={version.isOhs}
        initial={{ title: version.title, body: version.body, tagIds: version.tagIds, en: version.en }}
        assets={[...assets.values()]}
        tagGroups={tags}
        submitHint={t(`outcome.${version.submitOutcome}`)}
      />
    </section>
  );
}
