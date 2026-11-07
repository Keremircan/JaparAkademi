"use client";

import { Bell, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { NavKey } from "@/features/app-shell/navigation";
import { signOutAction } from "@/features/auth/actions";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icon";

export type ShellNavItem = { key: NavKey; href: string };

type Props = {
  fullName: string;
  items: ShellNavItem[];
  tabs: ShellNavItem[];
  hasMore: boolean;
  /** Okunmamış bildirim sayısı (SPEC 10.2). */
  unread: number;
  children: ReactNode;
};

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Uygulama kabuğu: masaüstünde yan menü, mobilde üst başlık + alt sekme bar'ı.
 * Menü öğeleri sunucuda kullanıcının rollerine göre hesaplanıp gelir.
 */
export function AppShell({ fullName, items, tabs, hasMore, unread, children }: Props) {
  const t = useTranslations();
  const pathname = usePathname();
  const moreActive = hasMore && !tabs.some((tab) => isActive(pathname, tab.href));

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-background focus:px-4 focus:py-3"
      >
        {t("common.skipToContent")}
      </a>

      {/* Masaüstü yan menü */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-sidebar lg:flex">
        <div className="flex items-center justify-between gap-2 py-2 ps-5 pe-2">
          <span className="text-base font-semibold">{t("app.name")}</span>
          <BellLink unread={unread} active={isActive(pathname, "/notifications")} />
        </div>
        <nav aria-label={t("nav.mainMenu")} className="flex-1 px-3">
          <ul className="flex flex-col gap-1">
            {items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-md px-3 text-base hover:bg-sidebar-accent pointer-fine:min-h-9",
                      active && "bg-sidebar-accent font-semibold",
                    )}
                  >
                    <NavIcon name={item.key} className="size-5" />
                    {t(`nav.${item.key}`)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t p-3">
          <p className="truncate px-3 pb-2 text-sm text-muted-foreground">{fullName}</p>
          {/* Çıkış kırmızı metinle ayırt edilir (iş paketi 3.8, karar #249) */}
          <form action={signOutAction}>
            <Button
              type="submit"
              variant="ghost"
              className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
            >
              <LogOut aria-hidden="true" />
              {t("auth.signOut")}
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobil üst başlık */}
        <header className="sticky top-0 z-20 flex min-h-14 items-center border-b bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
          <span className="flex-1 text-base font-semibold">{t("app.name")}</span>
          <BellLink unread={unread} active={isActive(pathname, "/notifications")} />
        </header>

        <main id="main" className="flex-1 px-4 py-5 pb-24 lg:px-8 lg:py-8 lg:pb-8">
          {children}
        </main>

        {/* Mobil alt sekme bar'ı */}
        <nav
          aria-label={t("nav.mainMenu")}
          className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        >
          <ul className="flex">
            {tabs.map((tab) => (
              <TabLink key={tab.key} item={tab} active={isActive(pathname, tab.href)} label={t(`nav.${tab.key}`)} />
            ))}
            {hasMore && (
              <TabLink item={{ key: "more", href: "/more" }} active={moreActive} label={t("nav.more")} />
            )}
          </ul>
        </nav>
      </div>
    </div>
  );
}

function TabLink({
  item,
  active,
  label,
}: {
  item: { key: NavKey | "more"; href: string };
  active: boolean;
  label: string;
}) {
  return (
    <li className="flex-1">
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-xs text-muted-foreground",
          active && "font-semibold text-foreground",
        )}
      >
        <NavIcon name={item.key} className="size-6" />
        <span className="truncate">{label}</span>
      </Link>
    </li>
  );
}

/** Bildirim zili: ikon + okunmamış sayısı (ekran okuyucu için metinle). */
function BellLink({ unread, active }: { unread: number; active: boolean }) {
  const t = useTranslations("notifications");
  return (
    <Link
      href="/notifications"
      aria-current={active ? "page" : undefined}
      aria-label={unread ? t("bellUnread", { count: unread }) : t("bell")}
      className="relative flex size-12 items-center justify-center rounded-lg hover:bg-muted aria-[current=page]:bg-muted pointer-fine:size-9"
    >
      <Bell aria-hidden="true" className="size-6 pointer-fine:size-5" />
      {unread > 0 && (
        <span aria-hidden="true" className="absolute top-1 right-1 min-w-5 rounded-full pointer-fine:-top-0.5 pointer-fine:-right-0.5 bg-destructive px-1 text-center text-xs font-semibold leading-5 text-white dark:bg-red-600">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
