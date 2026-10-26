import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { ActionButton } from "@/components/forms/action-button";
import { revokeProctorSessionAction } from "@/features/exams/actions";
import { ProctorPanel } from "@/features/exams/components/proctor-panel";
import { getSectionUser } from "@/server/auth/current-user";
import { can } from "@/server/authz/policy";
import { toActor } from "@/server/services/auth";
import { myProctorSessions } from "@/server/services/exams/proctor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("exams.proctor");
  return { title: t("title") };
}

/** Gözetmen kodu (SPEC Bölüm 6): eğitmen, bölüm sorumlusu, İSG uzmanı ve İK. */
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
  if (!can(actor, "proctor.issue_code")) return <NotFoundView />;
  const [t, tNav, format, sessions] = await Promise.all([getTranslations("exams.proctor"), getTranslations("sections.manage"), getFormatter(), myProctorSessions(actor)]);
  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} back={{ href: "/manage", label: tNav("title") }} />
      <ProctorPanel />
      {sessions.length > 0 && (
        <section aria-labelledby="active-heading">
          <h2 id="active-heading" className="mb-3 text-lg font-semibold">
            {t("active")}
          </h2>
          <ul className="divide-y rounded-2xl border">
            {sessions.map((s) => (
              <li key={s.id} className="flex min-h-16 flex-wrap items-center gap-3 px-5 py-3">
                <span className="flex-1">
                  {s.location ?? t("noLocation")}
                  <span className="block text-sm text-muted-foreground">
                    {t("until", { time: format.dateTime(s.expiresAt, { timeStyle: "short" }) })}
                  </span>
                </span>
                <ActionButton variant="outline" confirmText={t("revokeConfirm")} action={revokeProctorSessionAction.bind(null, s.id)}>
                  {t("revoke")}
                </ActionButton>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
