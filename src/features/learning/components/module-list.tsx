import { CheckCircle2, Circle, CircleDot, Lock, PlayCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AssignmentSummary, ModuleSummary } from "@/server/services/assignments";

function StatusIcon({ m }: { m: ModuleSummary }) {
  if (m.status === "completed" || m.status === "waived") return <CheckCircle2 aria-hidden="true" className="size-6 shrink-0 text-emerald-600" />;
  if (m.status === "locked") return <Lock aria-hidden="true" className="size-6 shrink-0 text-muted-foreground" />;
  if (m.status === "in_progress" || m.status === "review_required") return <CircleDot aria-hidden="true" className="size-6 shrink-0 text-primary" />;
  if (m.status === "available") return <PlayCircle aria-hidden="true" className="size-6 shrink-0 text-primary" />;
  return <Circle aria-hidden="true" className="size-6 shrink-0" />;
}

/** Atamanın modül listesi (kursiyer ve yönetici görünümü). */
export async function ModuleList({ assignment, linkable }: { assignment: AssignmentSummary; linkable: boolean }) {
  const t = await getTranslations("learn");
  const tk = await getTranslations("modules.kinds");
  return (
    <ol className="flex flex-col gap-2">
      {assignment.modules.map((m, i) => {
        const open = linkable && m.status !== "locked";
        const body = (
          <>
            <StatusIcon m={m} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                <span className="sr-only">{t(`status.${m.status}`)}: </span>
                {i + 1}. {m.title}
              </span>
              <span className="block text-sm text-muted-foreground">
                {tk(`${m.kind}.label`)} · {t("minutes", { n: m.durationMin })}
                {m.isCommon && ` · ${t("common")}`}
                {!m.isRequired && ` · ${t("optional")}`}
                {m.itemsTotal > 0 && m.status !== "completed" && ` · ${t("steps", { done: m.itemsDone, total: m.itemsTotal })}`}
                {m.completedVia && m.completedVia !== "online" && ` · ${t(`via.${m.completedVia}`)}`}
              </span>
              {m.lock && (
                <span className="block text-sm text-muted-foreground">
                  {m.lock.kind === "trainer" ? t("lock.trainer") : t("lock.prerequisites", { list: m.lock.titles.join(", ") })}
                </span>
              )}
              {!m.remoteAllowed && m.status !== "completed" && <span className="block text-sm text-amber-800 dark:text-amber-300">{t("classroomOnly")}</span>}
            </span>
          </>
        );
        return (
          <li key={m.id}>
            {open ? (
              <Link
                href={`/learn/${assignment.id}/${m.moduleId}`}
                aria-current={m.id === assignment.nextModuleId ? "step" : undefined}
                className="flex min-h-16 items-center gap-3 rounded-xl border px-4 py-3 hover:bg-muted aria-[current=step]:border-primary aria-[current=step]:bg-primary/5"
              >
                {body}
              </Link>
            ) : (
              <div className={`flex min-h-16 items-center gap-3 rounded-xl border px-4 py-3 ${m.status === "locked" ? "opacity-70" : ""}`}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
