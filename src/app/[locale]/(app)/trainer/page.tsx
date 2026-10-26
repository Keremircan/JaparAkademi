import { School } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { AssignmentSummaryView } from "@/features/assignments/components/assignment-summary";
import { Link } from "@/i18n/navigation";
import { getSectionUser } from "@/server/auth/current-user";
import { toActor } from "@/server/services/auth";
import { myTrainees } from "@/server/services/assignments";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sections.trainer");
  return { title: t("title") };
}

/** Eğitmen paneli (Ekran 6): kursiyerlerim ve sınıf eğitimi kaydı. Pratik işaretleme 1.6'da eklenir. */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const user = await getSectionUser("trainer");
  if (!user) return <NotFoundView />;
  const [t, ts, trainees] = await Promise.all([getTranslations("assignments.trainerPanel"), getTranslations("sections.trainer"), myTrainees(toActor(user))]);
  return (
    <section className="max-w-4xl">
      <PageHeader
        title={ts("title")}
        description={t("description")}
        actions={
          <Button nativeButton={false} render={<Link href="/manage/classroom" />}>
            <School aria-hidden="true" />
            {t("classroom")}
          </Button>
        }
      />
      <h2 className="mb-3 text-lg font-semibold">{t("trainees")}</h2>
      {trainees.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {trainees.map((a) => (
            <li key={a.id}>
              <details className="rounded-2xl border">
                <summary className="flex min-h-16 cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                  <span className="min-w-40 flex-1 font-medium">{a.personName}</span>
                  <span className="text-sm text-muted-foreground">{a.positionName}</span>
                  <span className={`text-sm font-medium ${a.overdue ? "text-destructive" : ""}`}>%{a.progress}</span>
                </summary>
                <div className="border-t px-5 py-4">
                  <AssignmentSummaryView a={a} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
