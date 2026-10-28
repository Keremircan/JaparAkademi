"use client";

import { Check, FileDown, Flag, RefreshCw, RotateCcw, Siren } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { saveEvacuationCache, type CachedPerson } from "@/lib/evacuation-cache";
import { cn } from "@/lib/utils";
import { endRollcallAction, refreshRollcallAction, setSafeAction, startRollcallAction } from "../actions";

export type BoardPerson = {
  visitId: string;
  fullName: string;
  companyName: string | null;
  typeLabel: string;
  hostName: string;
  badgeNo: string | null;
  checkedInLabel: string;
  safe: boolean;
};

/**
 * Tahliye yoklaması (FG-8.1, kararlar #157–161): telefonda büyük dokunma alanları. Liste her açılışta cihaza
 * kaydedilir (bağlantısız okuma); işaretleme bağlantı ister.
 */
export function EvacuationBoard({
  rollcall,
  people,
  savedLabel,
}: {
  rollcall: { id: string; kind: "drill" | "real"; startedLabel: string; startedAt: string } | null;
  people: BoardPerson[];
  savedLabel: string;
}) {
  const t = useTranslations("evacuation");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const safe = people.filter((p) => p.safe).length;
  const missing = people.length - safe;

  // Son liste cihaza (karar #160)
  useEffect(() => {
    const cached: CachedPerson[] = people.map((p) => ({
      name: p.fullName,
      company: p.companyName,
      type: p.typeLabel,
      host: p.hostName,
      badge: p.badgeNo,
      checkedIn: p.checkedInLabel,
      safe: p.safe,
    }));
    void saveEvacuationCache({ savedAt: new Date().toISOString(), rollcall: rollcall ? { kind: t(`kinds.${rollcall.kind}`), startedAt: rollcall.startedLabel } : null, people: cached }).then(() =>
      setSaved(true),
    );
  }, [people, rollcall, t]);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "unexpected");
    });

  return (
    <div className="flex flex-col gap-5">
      {rollcall ? (
        <div className={cn("flex flex-col gap-3 rounded-2xl border-2 p-4", rollcall.kind === "real" ? "border-destructive" : "border-amber-500")}>
          <p className="flex items-center gap-2 text-lg font-semibold">
            <Siren aria-hidden="true" className="size-6" />
            {t("open", { kind: t(`kinds.${rollcall.kind}`), time: rollcall.startedLabel })}
          </p>
          <p className="text-2xl font-bold" role="status">
            {t("progress", { safe, total: people.length })}
            {missing > 0 && <span className="ml-3 text-destructive">{t("missing", { count: missing })}</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const r = await refreshRollcallAction(rollcall.id);
                  if (!r.ok) return setError(r.error);
                  setNotice(t("refreshed", { count: r.data }));
                })
              }
            >
              <RefreshCw aria-hidden="true" />
              {t("refresh")}
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(missing > 0 ? t("endConfirmMissing", { count: missing }) : t("endConfirm"))) return;
                act(() => endRollcallAction(rollcall.id));
              }}
            >
              <Flag aria-hidden="true" />
              {t("end")}
            </Button>
            <a href={`/api/security/evacuation/pdf?rollcall=${rollcall.id}`} className="inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 font-medium hover:bg-muted">
              <FileDown aria-hidden="true" className="size-5" />
              {t("pdfRollcall")}
            </a>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {(["drill", "real"] as const).map((kind) => (
            <Button
              key={kind}
              size="lg"
              variant={kind === "real" ? "destructive" : "default"}
              disabled={pending}
              onClick={() => {
                if (!window.confirm(t("startConfirm"))) return;
                act(() => startRollcallAction(kind));
              }}
            >
              <Siren aria-hidden="true" />
              {t("start")}: {kind === "drill" ? t("startDrill") : t("startReal")}
            </Button>
          ))}
          <a href={`/api/security/evacuation/pdf?list=inside`} className="inline-flex min-h-14 items-center gap-2 rounded-lg border px-4 font-medium hover:bg-muted">
            <FileDown aria-hidden="true" className="size-5" />
            {t("pdfInside")}
          </a>
        </div>
      )}
      <FormError error={error} />
      {notice && (
        <p role="status" className="text-emerald-700 dark:text-emerald-400">
          {notice}
        </p>
      )}

      {people.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("insideEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {people.map((p) => (
            <li
              key={p.visitId}
              className={cn("flex flex-wrap items-center gap-3 rounded-2xl border p-4", p.safe && "border-emerald-600 bg-emerald-600/5")}
            >
              <span className="min-w-48 flex-1">
                <span className="block text-lg font-medium">{p.fullName}</span>
                <span className="block text-sm text-muted-foreground">
                  {p.typeLabel}
                  {p.companyName && ` · ${p.companyName}`} · {p.hostName}
                  {p.badgeNo && ` · ${p.badgeNo}`} · {p.checkedInLabel}
                </span>
              </span>
              {rollcall &&
                (p.safe ? (
                  <Button variant="outline" disabled={pending} onClick={() => act(() => setSafeAction(rollcall.id, p.visitId, false))} aria-label={`${t("unmark")}: ${p.fullName}`}>
                    <RotateCcw aria-hidden="true" />
                    {t("unmark")}
                  </Button>
                ) : (
                  <Button size="lg" disabled={pending} onClick={() => act(() => setSafeAction(rollcall.id, p.visitId, true))} aria-label={`${t("markSafe")}: ${p.fullName}`}>
                    <Check aria-hidden="true" />
                    {t("markSafe")}
                  </Button>
                ))}
            </li>
          ))}
        </ul>
      )}
      {saved && <p className="text-sm text-muted-foreground">{t("offlineSaved", { time: savedLabel })}</p>}
    </div>
  );
}
