import { ListOrdered } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { libraryAccess } from "@/features/content/guard";
import { CardEditor } from "@/features/positions/components/card-editor";
import { Link } from "@/i18n/navigation";
import { AppError } from "@/server/errors";
import { assetsInfo } from "@/server/services/media";
import { getEditableCard } from "@/server/services/positions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("positions");
  return { title: t("editCard") };
}

export default function Page({ params }: PageProps<"/[locale]/manage/positions/[id]/card">) {
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
  const card = await getEditableCard(access.actor, id).catch((err: unknown) => {
    if (err instanceof AppError) return null;
    throw err;
  });
  if (!card) return <NotFoundView />;
  const t = await getTranslations("positions");
  const diagramId = card.sections.workflow.diagramAssetId;
  const diagram = diagramId ? ((await assetsInfo([diagramId])).get(diagramId) ?? null) : null;

  return (
    <section>
      <PageHeader
        title={t("editCard")}
        description={`${card.identity.positionName} · ${t("versionN", { version: card.version })}`}
        back={{ href: `/manage/positions/${id}`, label: card.identity.positionName }}
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href={`/manage/positions/${id}/plan`} />}>
            <ListOrdered aria-hidden="true" />
            {t("editPlan")}
          </Button>
        }
      />
      <CardEditor
        positionId={id}
        version={card.version}
        mode={card.mode}
        identity={card.identity}
        initial={card.sections}
        diagram={diagram}
        linkedContents={card.linkedContents}
      />
    </section>
  );
}
