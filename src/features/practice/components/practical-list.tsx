import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Actor } from "@/server/authz/actor";
import { practicalExamsForAssignment } from "@/server/services/practice";

/** Pratik sınav formları (yönetici görünümü): deneme, değerlendiren, puan ve durum. */
export async function PracticalList({ actor, assignmentId }: { actor: Actor; assignmentId: string }) {
  const rows = await practicalExamsForAssignment(actor, assignmentId).catch(() => []);
  if (rows.length === 0) return null;
  const [t, format] = await Promise.all([getTranslations("practice.list"), getFormatter()]);
  return (
    <section aria-label={t("title")} className="flex flex-col gap-2">
      <h3 className="font-medium">{t("title")}</h3>
      <ul className="divide-y rounded-xl border text-sm">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/trainer/evaluations/${r.id}`} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 hover:bg-muted">
              <span className="flex-1 font-medium">{t("attemptN", { title: r.moduleTitle, n: r.attemptNo })}</span>
              <span className="text-muted-foreground">
                {t("evaluator", { name: r.evaluatorName })}
                {r.submittedAt && ` · ${format.dateTime(r.submittedAt, { dateStyle: "medium" })}`}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${r.status === "final" ? (r.passed ? "bg-emerald-500/15" : "bg-destructive/15") : "bg-muted"}`}>
                {r.status === "final" ? `${t("score", { score: r.score ?? 0 })} · ${r.passed ? t("passed") : t("failed")}` : t(`status.${r.status}`)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
