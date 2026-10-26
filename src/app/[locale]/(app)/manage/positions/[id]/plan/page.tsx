import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { libraryAccess } from "@/features/content/guard";
import { PlanDesigner } from "@/features/positions/components/plan-designer";
import { Link } from "@/i18n/navigation";
import { AppError } from "@/server/errors";
import { getEditableCard, planCandidates } from "@/server/services/positions";
import { planDefaults } from "@/server/services/positions/plan-settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("positions");
  return { title: t("editPlan") };
}

export default function Page({ params }: PageProps<"/[locale]/manage/positions/[id]/plan">) {
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
  const [t, candidates, defaults] = await Promise.all([getTranslations("positions"), planCandidates(access.actor, id), planDefaults()]);

  return (
    <section>
      <PageHeader
        title={t("editPlan")}
        description={`${card.identity.positionName} · ${t("versionN", { version: card.version })}`}
        back={{ href: `/manage/positions/${id}`, label: card.identity.positionName }}
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href={`/manage/positions/${id}/card`} />}>
            <Pencil aria-hidden="true" />
            {t("editCard")}
          </Button>
        }
      />
      <PlanDesigner
        key={card.id}
        positionId={id}
        initialItems={card.plan.items}
        initialOverrides={card.plan.overrides}
        commonModules={card.commonModules}
        candidates={candidates}
        defaults={defaults}
        mode={card.mode}
      />
      <p className="mt-6 text-sm text-muted-foreground">
        {t("planSubmitHint")}{" "}
        <Link href={`/manage/positions/${id}/card#submit-heading`} className="underline underline-offset-4">
          {t("goSubmit")}
        </Link>
      </p>
    </section>
  );
}
