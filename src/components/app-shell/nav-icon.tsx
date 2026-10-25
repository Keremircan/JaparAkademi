import {
  BarChart3,
  ClipboardCheck,
  Ellipsis,
  GraduationCap,
  House,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { NavKey } from "@/features/app-shell/navigation";

const ICONS: Record<NavKey | "more", LucideIcon> = {
  home: House,
  learn: GraduationCap,
  trainer: ClipboardCheck,
  manage: LayoutDashboard,
  reports: BarChart3,
  security: ShieldCheck,
  admin: Settings,
  profile: UserRound,
  more: Ellipsis,
};

export function NavIcon({ name, className }: { name: NavKey | "more"; className?: string }) {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" className={className} />;
}
