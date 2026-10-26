import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { libraryAccess } from "@/features/content/guard";
import { Link } from "@/i18n/navigation";
import { can } from "@/server/authz/policy";
import { listClassroomSessions, type ClassroomListItem } from "@/server/services/classroom";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("classroom");
  return { title: t("title") };
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const access = await libraryAccess();
  if (!access) return <NotFoundView />;
  const [t, tNav, format, data] = await Promise.all([
    getTranslations("classroom"),
    getTranslations("sections.manage"),
    getFormatter(),
    listClassroomSessions(access.actor),
  ]);
  const row = (s: ClassroomListItem) => (
    <li key={s.id}>
      <Link href={`/manage/classroom/${s.id}`} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-muted">
        <span className="min-w-48 flex-1">
          <span className="block font-medium">{s.moduleTitle}</span>
          <span className="block text-sm text-muted-foreground">
            {format.dateTime(new Date(`${s.sessionDate}T12:00:00`), { dateStyle: "medium" })} · {s.location} · {s.trainerName} · {t("attendeeCount", { count: s.attendeeCount })}
          </span>
        </span>
        {s.isOhs && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-300">{t("ohs")}</span>}
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t(`status.${s.status}`)}</span>
      </Link>
    </li>
  );
  return (
    <section className="max-w-4xl">
      <PageHeader
        title={t("title")}
        description={t("description")}
        back={{ href: "/manage", label: tNav("title") }}
        actions={
          can(access.actor, "classroom.record") && (
            <Button nativeButton={false} render={<Link href="/manage/classroom/new" />}>
              <Plus aria-hidden="true" />
              {t("new")}
            </Button>
          )
        }
      />
      {data.pending.length > 0 && (
        <section aria-labelledby="pending-heading" className="mb-8">
          <h2 id="pending-heading" className="mb-3 text-lg font-semibold">
            {t("pending")}
          </h2>
          <ul className="divide-y rounded-2xl border">{data.pending.map(row)}</ul>
        </section>
      )}
      <h2 className="mb-3 text-lg font-semibold">{t("mine")}</h2>
      {data.mine.length === 0 ? <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("empty")}</p> : <ul className="divide-y rounded-2xl border">{data.mine.map(row)}</ul>}
    </section>
  );
}
