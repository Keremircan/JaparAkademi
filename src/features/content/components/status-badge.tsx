import { useTranslations } from "next-intl";
import type { VersionStatus } from "@/server/state/content";

const STYLE: Record<VersionStatus, string> = {
  draft: "bg-muted",
  section_review: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  ohs_review: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  published: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  rejected: "bg-destructive/10 text-destructive",
};

export function StatusBadge({ status, version }: { status: VersionStatus; version: number }) {
  const t = useTranslations("content.status");
  return <span className={`rounded-full px-2 py-0.5 ${STYLE[status]}`}>{t(status, { version })}</span>;
}
