import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { orNull } from "@/features/admin/guard";
import { BriefingEditor } from "@/features/visitors/components/briefing-editor";
import { securityAccess } from "@/features/visitors/guard";
import { getSetting } from "@/server/services/settings";
import { getBriefing } from "@/server/services/visitors";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("visitors.cards.briefings");
  return { title: t("title") };
}

export default function Page({ params }: PageProps<"/[locale]/security/briefings/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f-]{36}$/;

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const access = await securityAccess("visitor_briefings.manage");
  if (!access) return <NotFoundView />;
  const { id } = await params;
  const data = UUID.test(id) ? await orNull(getBriefing(access.actor, id)) : null;
  if (!data || data.briefing.publishedAt) return <NotFoundView />;
  const [t, types] = await Promise.all([getTranslations("visitors"), getSetting("visitor.types")]);
  const { briefing } = data;
  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <PageHeader
        title={t("briefings.editTitle", { type: t(`types.${briefing.visitorType}`), version: briefing.version })}
        description={t("briefings.editHint")}
        back={{ href: "/security/briefings", label: t("cards.briefings.title") }}
      />
      <BriefingEditor
        id={briefing.id}
        requiredQuestions={types[briefing.visitorType].questionCount}
        initialCards={data.cards.map((c) => ({ key: c.id, titleTr: c.titleTr, bodyTr: c.bodyTr, titleEn: c.titleEn, bodyEn: c.bodyEn, asset: c.asset }))}
        initialQuestions={data.questions.map((q) => ({
          key: q.id,
          stemTr: q.stemTr,
          stemEn: q.stemEn,
          options: q.optionsTr.map((tr, i) => ({ tr, en: q.optionsEn[i] ?? "" })),
          correctIndex: q.correctIndex,
        }))}
      />
    </section>
  );
}
