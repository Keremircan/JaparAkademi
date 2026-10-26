import { Boxes, BriefcaseBusiness, ClipboardCheck, Library, School, Users } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Link } from "@/i18n/navigation";
import { can, hasAnyRole } from "@/server/authz/policy";
import { listClassroomSessions } from "@/server/services/classroom";
import { getSectionUser } from "@/server/auth/current-user";
import { toActor } from "@/server/services/auth";
import { approvalQueue } from "@/server/services/content";
import { cardApprovalQueue } from "@/server/services/positions";
import { canUseLibrary } from "@/server/services/content/access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sections.manage");
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
  const user = await getSectionUser("manage");
  if (!user) return <NotFoundView />;
  const actor = toActor(user);
  const canApprove = can(actor, "content.approve_section") || can(actor, "content.approve_ohs");
  const [t, queue, cardQueue] = await Promise.all([
    getTranslations(),
    canApprove ? approvalQueue(actor) : Promise.resolve([]),
    canApprove ? cardApprovalQueue(actor) : Promise.resolve([]),
  ]);
  const classroom = canUseLibrary(actor) ? await listClassroomSessions(actor) : { pending: [], mine: [] };
  const pending = queue.length + cardQueue.length;

  const cards = [
    { key: "approvals", href: "/manage/approvals", icon: ClipboardCheck, show: canApprove, badge: pending || null },
    { key: "team", href: "/manage/team", icon: Users, show: hasAnyRole(actor, ["section_manager", "hr"]), badge: null },
    { key: "classroom", href: "/manage/classroom", icon: School, show: canUseLibrary(actor), badge: classroom.pending.length || null },
    { key: "positions", href: "/manage/positions", icon: BriefcaseBusiness, show: canUseLibrary(actor), badge: null },
    { key: "modules", href: "/manage/modules", icon: Boxes, show: canUseLibrary(actor), badge: null },
    { key: "library", href: "/manage/library", icon: Library, show: canUseLibrary(actor), badge: null },
  ] as const;

  return (
    <section className="max-w-4xl">
      <PageHeader title={t("sections.manage.title")} description={t("sections.manage.description")} />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards
          .filter((c) => c.show)
          .map(({ key, href, icon: Icon, badge }) => (
            <li key={key}>
              <Link href={href} className="flex min-h-24 items-start gap-4 rounded-2xl border bg-card p-5 hover:bg-muted">
                <Icon aria-hidden="true" className="mt-0.5 size-7 shrink-0" />
                <span className="flex-1">
                  <span className="flex items-center gap-2 text-lg font-medium">
                    {t(`manage.cards.${key}.title`)}
                    {badge && (
                      <span className="rounded-full bg-primary px-2.5 py-0.5 text-sm text-primary-foreground">
                        <span className="sr-only">{t("manage.pendingCount", { count: badge })}</span>
                        <span aria-hidden="true">{badge}</span>
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">{t(`manage.cards.${key}.description`)}</span>
                </span>
              </Link>
            </li>
          ))}
      </ul>
    </section>
  );
}
