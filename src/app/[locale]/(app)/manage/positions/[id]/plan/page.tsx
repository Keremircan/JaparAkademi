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
import { questionIndexForModules } from "@/server/services/questions";
import { getSettings } from "@/server/services/settings";

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
  const theoryIds = [
    ...card.commonModules.filter((m) => m.kind === "theory").map((m) => m.id),
    ...card.plan.items.filter((i) => i.kind === "theory").map((i) => i.moduleId),
    ...candidates.filter((c) => c.kind === "theory").map((c) => c.id),
  ];
  const [questionIndex, poolSettings] = await Promise.all([
    questionIndexForModules(access.actor, [...new Set(theoryIds)]),
    getSettings(["exam.question_pool_min_ratio"]),
  ]);

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
        questionIndex={questionIndex}
        poolMinRatio={poolSettings["exam.question_pool_min_ratio"]}
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
