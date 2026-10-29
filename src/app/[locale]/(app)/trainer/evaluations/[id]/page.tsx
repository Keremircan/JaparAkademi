import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { PracticalForm } from "@/features/practice/components/practical-form";
import { PracticalResult } from "@/features/practice/components/practical-result";
import { SecondSign } from "@/features/practice/components/second-sign";
import { requireUser } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import { toActor } from "@/server/services/auth";
import { assetsInfo } from "@/server/services/media";
import { getPracticalExam } from "@/server/services/practice";
import { OwnerActingNotice } from "@/features/admin/owner-notice";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("practice.form");
  return { title: t("title") };
}

/** Pratik değerlendirme formu (Ekran 7): değerlendiren doldurur ve imzalatır; bölüm sorumlusu 2. imzayı atar. */
export default function Page({ params }: PageProps<"/[locale]/trainer/evaluations/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return <NotFoundView />;
  const view = await getPracticalExam(toActor(user), id).catch((err: unknown) => {
    if (err instanceof AppError) return null;
    throw err;
  });
  if (!view) return <NotFoundView />;
  const t = await getTranslations("practice.form");
  const isTrainee = view.trainee.userId === user.userId;
  const back = isTrainee ? { href: "/learn", label: t("backLearn") } : { href: "/trainer", label: t("backTrainer") };
  const header = (
    <>
      <PageHeader title={view.title} description={t("subtitle", { name: view.trainee.name, n: view.attemptNo })} back={back} />
      {view.can.edit && <OwnerActingNotice actor={toActor(user)} permission="practice.mark" role="trainer" />}
      {view.can.secondSign && <OwnerActingNotice actor={toActor(user)} permission="practice.second_signature" role="section_manager" />}
    </>
  );

  if (view.can.edit) {
    const photos = await assetsInfo(view.photoAssetIds);
    return (
      <section>
        {header}
        <PracticalForm
          key={view.id}
          id={view.id}
          traineeName={view.trainee.name}
          evaluatorName={view.evaluatorName}
          passScore={view.passScore}
          initialCriteria={view.criteria}
          initialNote={view.note}
          initialPhotos={[...photos.values()]}
        />
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-6">
      {header}
      <PracticalResult view={view} />
      {view.can.secondSign && <SecondSign id={view.id} managerName={user.fullName} />}
    </section>
  );
}
