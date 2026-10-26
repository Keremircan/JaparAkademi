import { getFormatter, getTranslations } from "next-intl/server";
import type { Actor } from "@/server/authz/actor";
import { attemptsForAssignment } from "@/server/services/exams";

/** Sınav denemeleri (yönetici görünümü, karar #64): puan, sonuç, gözetmen, sekme çıkışı, sesli okuma. Soru ve cevap gösterilmez. */
export async function ExamAttemptList({ actor, assignmentId }: { actor: Actor; assignmentId: string }) {
  const attempts = await attemptsForAssignment(actor, assignmentId).catch(() => []);
  if (attempts.length === 0) return null;
  const [t, format] = await Promise.all([getTranslations("exams.attempts"), getFormatter()]);
  return (
    <section aria-label={t("title")} className="flex flex-col gap-2">
      <h3 className="font-medium">{t("title")}</h3>
      <ul className="divide-y rounded-xl border text-sm">
        {attempts.map((x) => (
          <li key={x.id} className="flex flex-col gap-1 px-4 py-3">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{t("attemptN", { title: x.moduleTitle, n: x.attemptNo })}</span>
              {x.submittedAt ? (
                <span className={`rounded-full px-2 py-0.5 text-xs ${x.passed ? "bg-emerald-500/15" : "bg-destructive/15"}`}>
                  {t("score", { score: x.score ?? 0 })} · {x.passed ? t("passed") : x.failReason === "ohs_critical" ? t("failedCritical") : t("failed")}
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t("inProgress")}</span>
              )}
            </span>
            <span className="text-muted-foreground">
              {format.dateTime(x.startedAt, { dateStyle: "medium", timeStyle: "short" })}
              {x.submitReason === "timeout" && ` · ${t("timeout")}`}
              {` · ${x.proctorName ? t("proctor", { name: x.proctorName }) : t("noProctor")}`}
              {` · ${t("tabLeaves", { count: x.tabLeaveCount })}`}
              {x.ttsUsed && ` · ${t("tts")}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
