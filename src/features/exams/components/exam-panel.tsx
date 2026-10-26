import { ClipboardCheck } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { ExamInfo } from "@/server/services/exams";
import { ExamStart } from "./exam-start";

/** Kursiyerin sınav modülü ekranı: kurallar, kalan hak, engel nedeni ve başlatma. */
export async function ExamPanel({ info }: { info: ExamInfo }) {
  const [t, format] = await Promise.all([getTranslations("exams.start"), getFormatter()]);
  const r = info.rules;
  return (
    <div className="flex flex-col gap-5 rounded-2xl border p-5">
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <ClipboardCheck aria-hidden="true" />
        {t("heading")}
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        <li>{t("rules.questions", { count: r.questionCount })}</li>
        <li>{t("rules.duration", { minutes: r.durationMin })}</li>
        <li>{t("rules.passScore", { score: r.passScore })}</li>
        <li>{t("rules.attempts", { left: info.left, used: info.used })}</li>
      </ul>
      <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
        <li>{t("notes.oneAtATime")}</li>
        <li>{t("notes.autosave")}</li>
        <li>{t("notes.tabLeave")}</li>
        <li>{t("notes.ohsCritical")}</li>
        {r.proctorRequired && <li>{t("notes.proctor")}</li>}
      </ul>
      {info.last && (
        <p>
          {t("last", { score: info.last.score, passed: info.last.passed ? "yes" : "no" })}{" "}
          <Link href={`/exam/${info.last.attemptId}`} className="inline-flex min-h-12 items-center underline underline-offset-4">
            {t("viewResult")}
          </Link>
        </p>
      )}
      {info.block === "completed" ? null : info.block ? (
        <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          {info.block === "cooldown" && info.cooldownUntil
            ? t("block.cooldown", { date: format.dateTime(info.cooldownUntil, { dateStyle: "medium", timeStyle: "short" }) })
            : t(`block.${info.block}`)}
        </p>
      ) : (
        <ExamStart assignmentModuleId={info.assignmentModuleId} proctorRequired={r.proctorRequired} resume={!!info.openAttemptId} />
      )}
    </div>
  );
}
