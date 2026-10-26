import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { adminAccess } from "@/features/admin/guard";
import { Link } from "@/i18n/navigation";
import { waitingForTraining } from "@/server/services/assignments";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("assignments.waiting");
  return { title: t("title") };
}

/** Eğitimi bekleyenler (karar #49): eğitimi gereken ama planı atanamamış personel. */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const access = await adminAccess("assignments.manage");
  if (!access) return <NotFoundView />;
  const [t, tp, rows] = await Promise.all([getTranslations("assignments.waiting"), getTranslations("admin.people"), waitingForTraining(access.actor)]);
  return (
    <section className="max-w-4xl">
      <PageHeader title={t("title")} description={t("description")} back={{ href: "/admin/people", label: tp("title") }} />
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-2xl border">
          {rows.map((r) => (
            <li key={r.userId}>
              <Link href={`/admin/people/${r.userId}`} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-muted">
                <span className="w-24 font-mono text-sm text-muted-foreground">{r.sicilNo}</span>
                <span className="min-w-40 flex-1 font-medium">{r.fullName}</span>
                <span className="text-sm text-muted-foreground">{r.positionName ?? "—"}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t(`reason.${r.reason}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
