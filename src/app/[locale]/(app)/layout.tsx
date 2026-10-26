import { getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { ShellSkeleton } from "@/components/app-shell/shell-skeleton";
import { bottomTabs, visibleNav } from "@/features/app-shell/navigation";
import { requireUser } from "@/server/auth/current-user";

/** Oturum gerektiren tüm sayfaların kabuğu. Oturum okuması Suspense içinde yapılır (cacheComponents). */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("common");

  return (
    <Suspense fallback={<ShellSkeleton label={t("loading")} />}>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  );
}

async function AuthenticatedShell({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const items = visibleNav(user.roles).map(({ key, href }) => ({ key, href }));
  const { tabs, hasMore } = bottomTabs(items);

  return (
    <AppShell fullName={user.fullName} items={items} tabs={tabs} hasMore={hasMore}>
      {children}
    </AppShell>
  );
}
