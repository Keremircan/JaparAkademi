import { CheckCircle2, Star, XCircle } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { PracticalExamView } from "@/server/services/practice";

/** Pratik sınav formunun salt okunur görünümü: kriterler, puan, imzalar, fotoğraflar. */
export async function PracticalResult({ view }: { view: PracticalExamView }) {
  const [t, format] = await Promise.all([getTranslations("practice.result"), getFormatter()]);
  const dt = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-muted px-3 py-1 text-sm">{t(`status.${view.status}`)}</span>
        <span className="text-sm text-muted-foreground">{t("evaluator", { name: view.evaluatorName })}</span>
      </div>
      {view.status === "returned" && view.returnReason && (
        <p className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">{t("returned", { name: view.managerName ?? "—", reason: view.returnReason })}</p>
      )}
      {view.score !== null && (
        <div className={`flex items-center gap-3 rounded-2xl border-2 p-5 ${view.passed ? "border-emerald-600" : "border-destructive"}`} role="status">
          {view.passed ? <CheckCircle2 aria-hidden="true" className="size-10 text-emerald-600" /> : <XCircle aria-hidden="true" className="size-10 text-destructive" />}
          <div>
            <p className="text-2xl font-bold">{t("score", { score: view.score })}</p>
            <p>
              {view.passed ? t("passed") : t("failed")} · {t("passScore", { score: view.passScore })}
            </p>
            {view.failReason === "critical" && <p className="text-destructive">{t("critical")}</p>}
            {view.status === "awaiting_second_signature" && <p className="text-sm text-muted-foreground">{t("awaitingNote")}</p>}
          </div>
        </div>
      )}
      <section aria-labelledby="criteria-heading">
        <h2 id="criteria-heading" className="mb-2 text-lg font-semibold">
          {t("criteria")}
        </h2>
        <ol className="divide-y rounded-2xl border">
          {view.criteria.map((c, i) => (
            <li key={c.taskId} className="flex flex-col gap-1 px-4 py-3">
              <span className="flex items-center gap-2">
                {c.result === "pass" ? (
                  <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-emerald-600" />
                ) : c.result === "fail" ? (
                  <XCircle aria-hidden="true" className="size-5 shrink-0 text-destructive" />
                ) : null}
                <span className="flex-1">
                  {i + 1}. {c.title}
                  {c.isCritical && <Star aria-label={t("criticalTask")} className="ms-1 inline size-4 text-amber-600" />}
                </span>
                <span className="text-sm font-medium">{c.result ? t(`results.${c.result}`) : t("results.none")}</span>
              </span>
              {c.note && <span className="ps-7 text-sm text-muted-foreground">{c.note}</span>}
            </li>
          ))}
        </ol>
      </section>
      {view.note && (
        <p className="rounded-2xl border p-4">
          <span className="font-medium">{t("note")}: </span>
          {view.note}
        </p>
      )}
      {view.photoAssetIds.length > 0 && (
        <section aria-labelledby="photos-heading">
          <h2 id="photos-heading" className="mb-2 text-lg font-semibold">
            {t("photos")}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {view.photoAssetIds.map((id) => (
              <li key={id}>
                <a href={`/api/media/${id}/file`} target="_blank" rel="noreferrer" aria-label={t("openPhoto")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/media/${id}/thumb`} alt="" className="size-24 rounded-lg border object-cover" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {view.signatures.length > 0 && (
        <section aria-labelledby="signatures-heading">
          <h2 id="signatures-heading" className="mb-2 text-lg font-semibold">
            {t("signatures")}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {view.signatures.map((s) => (
              <li key={s.imageAssetId} className="flex flex-col gap-1 rounded-xl border p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/media/${s.imageAssetId}/file`} alt={t("signatureOf", { name: s.signerName })} className="h-20 w-full rounded-md bg-white object-contain" />
                <span className="text-sm font-medium">{t(`roles.${s.role}`)}</span>
                <span className="text-sm text-muted-foreground">
                  {s.signerName} · {dt(s.signedAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
