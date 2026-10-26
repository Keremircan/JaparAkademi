import { getFormatter, getTranslations } from "next-intl/server";
import { ModuleList } from "@/features/learning/components/module-list";
import type { AssignmentSummary } from "@/server/services/assignments";

/** Atama özeti (yönetici görünümü): durum, ilerleme, hedef tarih, eğitmen ve modüller. */
export async function AssignmentSummaryView({ a, showModules = true }: { a: AssignmentSummary; showModules?: boolean }) {
  const [t, format] = await Promise.all([getTranslations("assignments"), getFormatter()]);
  const date = (d: string) => format.dateTime(new Date(`${d}T12:00:00`), { dateStyle: "medium" });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{t("planOf", { position: a.positionName, version: a.cardVersion })}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t(`status.${a.status}`)}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t(`reason.${a.reason}`)}</span>
      </div>
      <div className="flex flex-col gap-1">
        <progress max={100} value={a.progress} className="h-3 w-full accent-primary" aria-label={t("progress", { percent: a.progress })} />
        <p className="text-sm text-muted-foreground">
          {t("progress", { percent: a.progress })} · {t("startedOn", { date: date(a.startDate) })}
          {a.targetDate && (
            <span className={a.overdue ? "text-destructive" : undefined}>
              {" "}
              · {t("target", { date: date(a.targetDate) })}
              {a.overdue && ` (${t("overdue")})`}
            </span>
          )}
          {` · ${a.trainerName ? t("trainer", { name: a.trainerName }) : t("noTrainer")}`}
        </p>
        {a.cancelReason && <p className="text-sm">{t("cancelled", { reason: a.cancelReason })}</p>}
      </div>
      {showModules && <ModuleList assignment={a} linkable={false} />}
    </div>
  );
}
