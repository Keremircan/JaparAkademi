import { FileText, MonitorSmartphone, Network, Users } from "lucide-react";
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
  const t = await getTranslations("sections.admin");
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
  const user = await getSectionUser("admin");
  if (!user) return <NotFoundView />;
  const actor = toActor(user);
  const t = await getTranslations();

  const cards = [
    { key: "org", href: "/admin/org", icon: Network, show: can(actor, "org.manage") },
    { key: "people", href: "/admin/people", icon: Users, show: can(actor, "people.view") },
    { key: "legal", href: "/admin/legal", icon: FileText, show: can(actor, "legal.manage") },
    { key: "devices", href: "/admin/devices", icon: MonitorSmartphone, show: can(actor, "devices.manage") },
  ] as const;

  return (
    <section className="max-w-4xl">
      <PageHeader title={t("sections.admin.title")} description={t("sections.admin.description")} />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards
          .filter((c) => c.show)
          .map(({ key, href, icon: Icon }) => (
            <li key={key}>
              <Link href={href} className="flex min-h-24 items-start gap-4 rounded-2xl border bg-card p-5 hover:bg-muted">
                <Icon aria-hidden="true" className="mt-0.5 size-7 shrink-0" />
                <span>
                  <span className="block text-lg font-medium">{t(`admin.cards.${key}.title`)}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{t(`admin.cards.${key}.description`)}</span>
                </span>
              </Link>
            </li>
          ))}
      </ul>
    </section>
  );
}
