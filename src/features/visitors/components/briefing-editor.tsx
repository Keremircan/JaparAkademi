"use client";

import { ArrowDown, ArrowUp, Plus, Save, Send, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MediaField } from "@/features/content/components/media-upload";
import { useRouter } from "@/i18n/navigation";
import type { AssetInfo } from "@/server/services/media";
import { discardBriefingDraftAction, publishBriefingAction, saveBriefingDraftAction } from "../actions";

export type EditorCard = { key: string; titleTr: string; bodyTr: string; titleEn: string; bodyEn: string; asset: AssetInfo | null };
export type EditorQuestion = { key: string; stemTr: string; stemEn: string; options: { tr: string; en: string }[]; correctIndex: number };

let seq = 0;
const newKey = () => `n${++seq}`;

/** Bilgilendirme paketi taslak editörü (karar #127): kartlar ve kontrol soruları, her metin TR + EN. */
export function BriefingEditor({
  id,
  requiredQuestions,
  initialCards,
  initialQuestions,
}: {
  id: string;
  requiredQuestions: number;
  initialCards: EditorCard[];
  initialQuestions: EditorQuestion[];
}) {
  const t = useTranslations("visitors.briefings");
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [questions, setQuestions] = useState(initialQuestions);
  const [error, setError] = useState<{ code: string; details?: unknown } | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const move = <T,>(list: T[], i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return list;
    const copy = [...list];
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    return copy;
  };
  const patchCard = (i: number, p: Partial<EditorCard>) => setCards((cs) => cs.map((c, k) => (k === i ? { ...c, ...p } : c)));
  const patchQuestion = (i: number, p: Partial<EditorQuestion>) => setQuestions((qs) => qs.map((q, k) => (k === i ? { ...q, ...p } : q)));

  const payload = () => ({
    cards: cards.map((c) => ({ titleTr: c.titleTr, bodyTr: c.bodyTr, titleEn: c.titleEn, bodyEn: c.bodyEn, mediaAssetId: c.asset?.id ?? null })),
    questions: questions.map((q) => ({
      stemTr: q.stemTr,
      stemEn: q.stemEn,
      optionsTr: q.options.map((o) => o.tr),
      optionsEn: q.options.map((o) => o.en),
      correctIndex: q.correctIndex,
    })),
  });

  const run = (publish: boolean) =>
    startTransition(async () => {
      setError(null);
      setSaved(false);
      const r = await saveBriefingDraftAction(id, payload());
      if (!r.ok) return setError({ code: r.error, details: r.details });
      if (!publish) return setSaved(true);
      const p = await publishBriefingAction(id);
      if (!p.ok) return setError({ code: p.error });
      router.push("/security/briefings");
    });

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="cards-title" className="flex flex-col gap-4">
        <h2 id="cards-title" className="text-xl font-semibold">
          {t("cards")}
        </h2>
        {cards.map((c, i) => (
          <fieldset key={c.key} className="flex flex-col gap-4 rounded-2xl border p-4">
            <legend className="px-1 font-medium">{t("cardN", { n: i + 1 })}</legend>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-3">
                <Field id={`${c.key}-ttr`} label={t("titleTr")}>
                  <Input id={`${c.key}-ttr`} maxLength={200} value={c.titleTr} onChange={(e) => patchCard(i, { titleTr: e.target.value })} />
                </Field>
                <Field id={`${c.key}-btr`} label={t("bodyTr")}>
                  <Textarea id={`${c.key}-btr`} rows={4} maxLength={5000} value={c.bodyTr} onChange={(e) => patchCard(i, { bodyTr: e.target.value })} />
                </Field>
              </div>
              <div className="flex flex-col gap-3" lang="en">
                <Field id={`${c.key}-ten`} label={t("titleEn")}>
                  <Input id={`${c.key}-ten`} maxLength={200} value={c.titleEn} onChange={(e) => patchCard(i, { titleEn: e.target.value })} />
                </Field>
                <Field id={`${c.key}-ben`} label={t("bodyEn")}>
                  <Textarea id={`${c.key}-ben`} rows={4} maxLength={5000} value={c.bodyEn} onChange={(e) => patchCard(i, { bodyEn: e.target.value })} />
                </Field>
              </div>
            </div>
            <MediaField label={t("media")} kinds={["image", "video"]} asset={c.asset} onChange={(asset) => patchCard(i, { asset })} optional />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="icon" aria-label={t("moveUp")} disabled={i === 0} onClick={() => setCards((cs) => move(cs, i, -1))}>
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button variant="outline" size="icon" aria-label={t("moveDown")} disabled={i === cards.length - 1} onClick={() => setCards((cs) => move(cs, i, 1))}>
                <ArrowDown aria-hidden="true" />
              </Button>
              <Button variant="ghost" onClick={() => setCards((cs) => cs.filter((_, k) => k !== i))}>
                <Trash2 aria-hidden="true" />
                {t("remove")}
              </Button>
            </div>
          </fieldset>
        ))}
        <Button
          variant="outline"
          className="self-start"
          onClick={() => setCards((cs) => [...cs, { key: newKey(), titleTr: "", bodyTr: "", titleEn: "", bodyEn: "", asset: null }])}
        >
          <Plus aria-hidden="true" />
          {t("addCard")}
        </Button>
      </section>

      <section aria-labelledby="questions-title" className="flex flex-col gap-4">
        <h2 id="questions-title" className="text-xl font-semibold">
          {t("questions")}
        </h2>
        <p className="text-sm text-muted-foreground">{requiredQuestions > 0 ? t("questionsRequired", { count: requiredQuestions }) : t("questionsNone")}</p>
        {questions.map((q, i) => (
          <fieldset key={q.key} className="flex flex-col gap-4 rounded-2xl border p-4">
            <legend className="px-1 font-medium">{t("questionN", { n: i + 1 })}</legend>
            <div className="grid gap-4 md:grid-cols-2">
              <Field id={`${q.key}-str`} label={t("stemTr")}>
                <Textarea id={`${q.key}-str`} rows={2} maxLength={500} value={q.stemTr} onChange={(e) => patchQuestion(i, { stemTr: e.target.value })} />
              </Field>
              <Field id={`${q.key}-sen`} label={t("stemEn")}>
                <Textarea id={`${q.key}-sen`} rows={2} maxLength={500} value={q.stemEn} onChange={(e) => patchQuestion(i, { stemEn: e.target.value })} lang="en" />
              </Field>
            </div>
            <div role="radiogroup" aria-label={t("correct")} className="flex flex-col gap-3">
              {q.options.map((o, k) => (
                <div key={k} className="grid items-end gap-3 md:grid-cols-[auto_1fr_1fr_auto]">
                  <label className="flex min-h-12 items-center gap-2">
                    <input type="radio" name={`${q.key}-correct`} className="size-5" checked={q.correctIndex === k} onChange={() => patchQuestion(i, { correctIndex: k })} />
                    <span className="text-sm">{t("correctShort")}</span>
                  </label>
                  <Input
                    aria-label={t("optionTr", { n: k + 1 })}
                    maxLength={200}
                    value={o.tr}
                    onChange={(e) => patchQuestion(i, { options: q.options.map((x, j) => (j === k ? { ...x, tr: e.target.value } : x)) })}
                  />
                  <Input
                    aria-label={t("optionEn", { n: k + 1 })}
                    lang="en"
                    maxLength={200}
                    value={o.en}
                    onChange={(e) => patchQuestion(i, { options: q.options.map((x, j) => (j === k ? { ...x, en: e.target.value } : x)) })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("removeOption")}
                    disabled={q.options.length <= 2}
                    onClick={() =>
                      patchQuestion(i, {
                        options: q.options.filter((_, j) => j !== k),
                        correctIndex: q.correctIndex === k ? 0 : q.correctIndex > k ? q.correctIndex - 1 : q.correctIndex,
                      })
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={q.options.length >= 6} onClick={() => patchQuestion(i, { options: [...q.options, { tr: "", en: "" }] })}>
                <Plus aria-hidden="true" />
                {t("addOption")}
              </Button>
              <Button variant="ghost" onClick={() => setQuestions((qs) => qs.filter((_, k) => k !== i))}>
                <Trash2 aria-hidden="true" />
                {t("remove")}
              </Button>
            </div>
          </fieldset>
        ))}
        <Button
          variant="outline"
          className="self-start"
          onClick={() =>
            setQuestions((qs) => [
              ...qs,
              { key: newKey(), stemTr: "", stemEn: "", options: [{ tr: "", en: "" }, { tr: "", en: "" }], correctIndex: 0 },
            ])
          }
        >
          <Plus aria-hidden="true" />
          {t("addQuestion")}
        </Button>
      </section>

      <div className="sticky bottom-0 flex flex-col gap-3 border-t bg-background py-4">
        <FormError error={error?.code} />
        {saved && (
          <p role="status" className="text-emerald-700 dark:text-emerald-400">
            {t("saved")}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" disabled={pending} onClick={() => run(false)}>
            <Save aria-hidden="true" />
            {t("save")}
          </Button>
          <Button disabled={pending} onClick={() => run(true)}>
            <Send aria-hidden="true" />
            {t("publish")}
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (!window.confirm(t("discardConfirm"))) return;
                const r = await discardBriefingDraftAction(id);
                if (!r.ok) return setError({ code: r.error });
                router.push("/security/briefings");
              })
            }
          >
            <Trash2 aria-hidden="true" />
            {t("discard")}
          </Button>
        </div>
      </div>
    </div>
  );
}
