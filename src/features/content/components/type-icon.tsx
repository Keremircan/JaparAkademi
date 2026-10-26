import { ClipboardList, FileSpreadsheet, FileText, Images, ListChecks, ListOrdered, PlayCircle, type LucideProps } from "lucide-react";
import type { ContentType } from "@/server/services/content/body";

const ICONS = {
  text: FileText,
  pdf: FileText,
  video: PlayCircle,
  gallery: Images,
  instruction: ListOrdered,
  checklist: ListChecks,
  form_template: FileSpreadsheet,
} satisfies Record<ContentType, unknown>;

export function TypeIcon({ type, ...props }: { type: ContentType } & LucideProps) {
  const Icon = ICONS[type] ?? ClipboardList;
  return <Icon aria-hidden="true" {...props} />;
}
