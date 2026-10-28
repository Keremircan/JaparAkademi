import { BookOpenCheck, Building2, CalendarClock, DoorOpen, ShieldBan } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Link } from "@/i18n/navigation";
import { can } from "@/server/authz/policy";
import { getSectionUser } from "@/server/auth/current-user";
import { toActor } from "@/server/services/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sections.security");
  return { title: t("title") };
}

/** Güvenlik bölümü (SPEC Bölüm 8, iş paketi 2.2): güvenlik ve İSG uzmanı (karar #129). */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const user = await getSectionUser("security");
  if (!user) return <NotFoundView />;
  const actor = toActor(user);
  const t = await getTranslations();
  const cards = [
    { key: "gate", href: "/security/gate", icon: DoorOpen, show: can(actor, "visits.view_all") },
    { key: "visits", href: "/security/visits", icon: CalendarClock, show: can(actor, "visits.view_all") },
    { key: "contractors", href: "/security/contractors", icon: Building2, show: can(actor, "contractors.manage") },
    { key: "blacklist", href: "/security/blacklist", icon: ShieldBan, show: can(actor, "blacklist.manage") },
    { key: "briefings", href: "/security/briefings", icon: BookOpenCheck, show: can(actor, "visitor_briefings.manage") },
  ] as const;
  return (
    <section className="max-w-4xl">
      <PageHeader title={t("sections.security.title")} description={t("sections.security.description")} />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards
          .filter((c) => c.show)
          .map(({ key, href, icon: Icon }) => (
            <li key={key}>
              <Link href={href} className="flex min-h-24 items-start gap-4 rounded-2xl border bg-card p-5 hover:bg-muted">
                <Icon aria-hidden="true" className="mt-0.5 size-7 shrink-0" />
                <span>
                  <span className="block text-lg font-medium">{t(`visitors.cards.${key}.title`)}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{t(`visitors.cards.${key}.description`)}</span>
                </span>
              </Link>
            </li>
          ))}
      </ul>
    </section>
  );
}
