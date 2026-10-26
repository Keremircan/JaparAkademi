import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { AssignmentSummaryView } from "@/features/assignments/components/assignment-summary";
import { getSectionUser } from "@/server/auth/current-user";
import { hasAnyRole } from "@/server/authz/policy";
import { toActor } from "@/server/services/auth";
import { teamProgress } from "@/server/services/assignments";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("assignments.team");
  return { title: t("title") };
}

/** Ekip ilerlemesi (karar #57): bölüm sorumlusu kapsamındaki, İK tüm açık eğitimler. */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const user = await getSectionUser("manage");
  if (!user) return <NotFoundView />;
  const actor = toActor(user);
  if (!hasAnyRole(actor, ["section_manager", "hr"])) return <NotFoundView />;
  const [t, tNav, rows] = await Promise.all([getTranslations("assignments.team"), getTranslations("sections.manage"), teamProgress(actor)]);
  const sorted = [...rows].sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.personName.localeCompare(b.personName, "tr"));
  return (
    <section className="max-w-4xl">
      <PageHeader title={t("title")} description={t("description")} back={{ href: "/manage", label: tNav("title") }} />
      {sorted.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sorted.map((a) => (
            <li key={a.id}>
              <details className="rounded-2xl border">
                <summary className="flex min-h-16 cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                  <span className="w-24 font-mono text-sm text-muted-foreground">{a.sicilNo}</span>
                  <span className="min-w-40 flex-1 font-medium">{a.personName}</span>
                  <span className="text-sm text-muted-foreground">{a.positionName}</span>
                  <span className={`text-sm font-medium ${a.overdue ? "text-destructive" : ""}`}>
                    %{a.progress}
                    {a.overdue && ` · ${t("overdue")}`}
                  </span>
                </summary>
                <div className="border-t px-5 py-4">
                  <AssignmentSummaryView a={a} viewer={actor} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
