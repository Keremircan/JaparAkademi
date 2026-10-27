"use client";

import { Check, PenLine, Star, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PracticalCriterion } from "@/server/services/practice";
import type { AssetInfo } from "@/server/services/media";
import { discardPracticalDraftAction, savePracticalDraftAction, signPracticalExamAction } from "../actions";
import { PhotoList } from "./photo-list";
import { SignaturePad } from "./signature-pad";

type Criterion = Pick<PracticalCriterion, "taskId" | "title" | "isCritical" | "result" | "note">;

/**
 * Pratik değerlendirme formu (Ekran 7, FG-6.2). Her değişiklik taslak olarak kaydedilir (karar #71).
 * Tüm kriterler işaretlenince kursiyer ve değerlendiren imzalar; imzadan sonra form değişmez.
 */
export function PracticalForm({
  id,
  traineeName,
  evaluatorName,
  passScore,
  initialCriteria,
  initialNote,
  initialPhotos,
}: {
  id: string;
  traineeName: string;
  evaluatorName: string;
  passScore: number;
  initialCriteria: Criterion[];
  initialNote: string | null;
  initialPhotos: AssetInfo[];
}) {
  const t = useTranslations("practice.form");
  const [criteria, setCriteria] = useState(initialCriteria);
  const [note, setNote] = useState(initialNote ?? "");
  const [photos, setPhotos] = useState(initialPhotos);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [step, setStep] = useState<"evaluate" | "sign">("evaluate");
  const [traineeSig, setTraineeSig] = useState<string | null>(null);
  const [trainerSig, setTrainerSig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const first = useRef(true);

  const payload = () => ({
    criteria: criteria.map((c) => ({ taskId: c.taskId, result: c.result, note: c.note?.trim() || null })),
    note: note.trim() || null,
    photoAssetIds: photos.map((p) => p.id),
  });

  // Taslak otomatik kayıt (yazmayı bekleyerek)
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (step !== "evaluate") return;
    const timer = setTimeout(async () => {
      setSaved("saving");
      const r = await savePracticalDraftAction(id, payload());
      setSaved(r.ok ? "saved" : "idle");
      if (!r.ok) setError(r.error);
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criteria, note, photos]);

  const set = (taskId: string, patch: Partial<Criterion>) => setCriteria((cs) => cs.map((c) => (c.taskId === taskId ? { ...c, ...patch } : c)));
  const answered = criteria.filter((c) => c.result !== null).length;
  const complete = answered === criteria.length;
  const score = complete ? Math.round((criteria.filter((c) => c.result === "pass").length / criteria.length) * 100) : null;
  const criticalFail = criteria.some((c) => c.isCritical && c.result === "fail");
  const passed = score !== null && !criticalFail && score >= passScore;

  if (step === "sign") {
    return (
      <div className="flex max-w-3xl flex-col gap-5">
        <div className={`rounded-2xl border-2 p-5 ${passed ? "border-emerald-600" : "border-destructive"}`} role="status">
          <p className="text-2xl font-bold">{t("scorePreview", { score: score ?? 0 })}</p>
          <p>{passed ? t("willPass") : criticalFail ? t("willFailCritical") : t("willFail", { passScore })}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t("signIntro")}</p>
        </div>
        <SignaturePad label={t("traineeSignature", { name: traineeName })} onChange={setTraineeSig} />
        <SignaturePad label={t("trainerSignature", { name: evaluatorName })} onChange={setTrainerSig} />
        <FormError error={error} />
        <div className="flex flex-wrap gap-3">
          <Button
            size="lg"
            disabled={pending || !traineeSig || !trainerSig}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const r = await signPracticalExamAction(id, { ...payload(), traineeSignature: traineeSig!, trainerSignature: trainerSig! });
                if (!r.ok) setError(r.error);
              })
            }
          >
            <PenLine aria-hidden="true" />
            {t("submitSigned")}
          </Button>
          <Button size="lg" variant="outline" disabled={pending} onClick={() => setStep("evaluate")}>
            {t("backToForm")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <p className="text-sm text-muted-foreground" role="status">
        {t("progress", { answered, total: criteria.length })}
        {saved === "saving" ? ` · ${t("saving")}` : saved === "saved" ? ` · ${t("saved")}` : ""}
      </p>
      <ol className="flex flex-col gap-3">
        {criteria.map((c, i) => (
          <li key={c.taskId} className="flex flex-col gap-3 rounded-2xl border p-4">
            <fieldset className="flex flex-col gap-3">
              <legend className="font-medium">
                {i + 1}. {c.title}
                {c.isCritical && (
                  <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 align-middle text-xs">
                    <Star aria-hidden="true" className="size-3" />
                    {t("critical")}
                  </span>
                )}
              </legend>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 px-3 font-medium has-checked:border-emerald-600 has-checked:bg-emerald-500/10 has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
                  <input type="radio" className="sr-only" name={`c-${c.taskId}`} checked={c.result === "pass"} onChange={() => set(c.taskId, { result: "pass" })} />
                  <Check aria-hidden="true" />
                  {t("pass")}
                </label>
                <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 px-3 font-medium has-checked:border-destructive has-checked:bg-destructive/10 has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
                  <input type="radio" className="sr-only" name={`c-${c.taskId}`} checked={c.result === "fail"} onChange={() => set(c.taskId, { result: "fail" })} />
                  <X aria-hidden="true" />
                  {t("fail")}
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">{t("criterionNote")}</span>
                <Textarea rows={1} className="min-h-12" maxLength={1000} value={c.note ?? ""} onChange={(e) => set(c.taskId, { note: e.target.value })} />
              </label>
            </fieldset>
          </li>
        ))}
      </ol>
      <label className="flex flex-col gap-1">
        <span className="font-medium">{t("generalNote")}</span>
        <Textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <PhotoList label={t("photos")} value={photos} onChange={setPhotos} />
      <FormError error={error} />
      {!complete && <p className="text-sm text-muted-foreground">{t("completeFirst")}</p>}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-10 flex items-center justify-between gap-2 rounded-2xl border bg-background/95 p-3 backdrop-blur lg:bottom-4">
        <Button
          size="lg"
          disabled={!complete}
          onClick={() => {
            setStep("sign");
            window.scrollTo({ top: 0 });
          }}
        >
          <PenLine aria-hidden="true" />
          {t("toSign")}
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (window.confirm(t("discardConfirm"))) startTransition(async () => void (await discardPracticalDraftAction(id)));
          }}
        >
          <Trash2 aria-hidden="true" />
          {t("discard")}
        </Button>
      </div>
    </div>
  );
}
