import { PERMISSIONS } from "@/server/authz/policy";
import type { Role } from "@/server/authz/roles";

/**
 * Menü bölümleri ve hangi rollerin gördüğü (tek kaynak).
 * Menüde görünmek yalnızca kolaylıktır; her sayfa ayrıca sunucuda requireSection ile korunur.
 */
export const NAV_KEYS = ["home", "learn", "trainer", "manage", "reports", "security", "admin", "profile"] as const;
export type NavKey = (typeof NAV_KEYS)[number];

type NavItem = { key: NavKey; href: string; roles: readonly Role[] | "all" };

export const NAV_ITEMS: readonly NavItem[] = [
  { key: "home", href: "/", roles: "all" },
  { key: "learn", href: "/learn", roles: "all" },
  { key: "trainer", href: "/trainer", roles: ["trainer"] },
  { key: "manage", href: "/manage", roles: ["trainer", "section_manager", "ohs_specialist", "hr"] },
  { key: "reports", href: "/reports", roles: PERMISSIONS["reports.view"] },
  { key: "security", href: "/security", roles: ["security"] },
  { key: "admin", href: "/admin", roles: ["hr", "sysadmin"] },
  { key: "profile", href: "/profile", roles: "all" },
];

export function canSeeNav(key: NavKey, roles: readonly Role[]): boolean {
  const item = NAV_ITEMS.find((i) => i.key === key);
  if (!item) return false;
  return item.roles === "all" || item.roles.some((r) => roles.includes(r));
}

export function visibleNav(roles: readonly Role[]): NavItem[] {
  return NAV_ITEMS.filter((i) => canSeeNav(i.key, roles));
}

/** Mobil alt sekme: en fazla 5 öğe; fazlası "Daha fazla" sayfasına taşınır. */
export const MAX_BOTTOM_TABS = 5;

export function bottomTabs<T>(items: readonly T[]): { tabs: T[]; hasMore: boolean } {
  if (items.length <= MAX_BOTTOM_TABS) return { tabs: [...items], hasMore: false };
  return { tabs: items.slice(0, MAX_BOTTOM_TABS - 1), hasMore: true };
}
