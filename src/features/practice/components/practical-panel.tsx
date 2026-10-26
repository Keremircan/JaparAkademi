import { ClipboardCheck } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { PracticalExamInfo } from "@/server/services/practice";

/** Kursiyerin pratik sınav modülü ekranı: kurallar, hak, durum ve geçmiş formlar. Değerlendirmeyi eğitmen başlatır. */
export async function PracticalPanel({ info }: { info: PracticalExamInfo }) {
  const [t, format] = await Promise.all([getTranslations("practice.exam"), getFormatter()]);
  return (
    <div className="flex flex-col gap-4 rounded-2xl border p-5">
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <ClipboardCheck aria-hidden="true" />
        {t("heading")}
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        <li>{t("passScore", { score: info.rules.passScore })}</li>
        <li>{t("attempts", { left: info.left, used: info.used })}</li>
      </ul>
      <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
        <li>{t("notes.criteria")}</li>
        <li>{t("notes.critical")}</li>
        <li>{t("notes.signatures")}</li>
        <li>{t("notes.fail")}</li>
      </ul>
      {info.block !== "completed" && (
        <p role="status" className="rounded-xl border bg-muted/40 p-4">
          {info.open ? t(`open.${info.open.status as "draft"}`) : info.block ? t(`block.${info.block}`) : t("ready")}
        </p>
      )}
      {info.history.length > 0 && (
        <section aria-labelledby="practical-history">
          <h3 id="practical-history" className="mb-2 font-medium">
            {t("history")}
          </h3>
          <ul className="divide-y rounded-xl border">
            {info.history.map((h) => (
              <li key={h.id}>
                <Link href={`/trainer/evaluations/${h.id}`} className="flex min-h-12 flex-wrap items-center gap-3 px-4 py-2 hover:bg-muted">
                  <span className="flex-1">{t("attemptN", { n: h.attemptNo })}</span>
                  <span className="text-sm text-muted-foreground">{format.dateTime(h.createdAt, { dateStyle: "medium" })}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {h.status === "final" ? `${t("score", { score: h.score ?? 0 })} · ${h.passed ? t("passed") : t("failed")}` : t(`status.${h.status}`)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
