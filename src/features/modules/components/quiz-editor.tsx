"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { saveQuizAction } from "../actions";

type Q = { key: string; id?: string; type: "single_choice" | "true_false"; stem: string; options: string[]; correctIndex: number; explanation: string };
let seq = 0;

/** Ara değerlendirme soruları (FG-4.3, karar #53): 0 ya da 3–5 soru; not etkisi yok. */
export function QuizEditor({
  moduleId,
  initial,
}: {
  moduleId: string;
  initial: { id: string; type: "single_choice" | "true_false"; stem: string; options: string[]; correctIndex: number; explanation: string | null }[];
}) {
  const t = useTranslations("modules.quiz");
  const tc = useTranslations("common");
  const [items, setItems] = useState<Q[]>(() => initial.map((q) => ({ ...q, key: q.id, explanation: q.explanation ?? "" })));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const tf = [t("true"), t("false")];

  const change = (i: number, patch: Partial<Q>) => {
    setItems((list) => list.map((q, j) => (j === i ? { ...q, ...patch } : q)));
    setSaved(false);
  };

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await saveQuizAction(
        moduleId,
        items.map((q) => ({
          id: q.id,
          type: q.type,
          stem: q.stem,
          options: q.type === "true_false" ? tf : q.options,
          correctIndex: q.correctIndex,
          explanation: q.explanation.trim() || null,
        })),
      );
      if (!r.ok) return setError(r.error);
      setSaved(true);
    });
  }

  return (
    <section aria-labelledby="quiz-heading" className="flex flex-col gap-3">
      <h2 id="quiz-heading" className="text-lg font-semibold">
        {t("heading")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      <ol className="flex flex-col gap-4">
        {items.map((q, i) => (
          <li key={q.key} className="flex flex-col gap-3 rounded-xl border p-4">
            <div className="flex items-center gap-2">
              <span className="flex-1 font-medium">{t("questionN", { n: i + 1 })}</span>
              <NativeSelect
                aria-label={t("type")}
                value={q.type}
                onChange={(e) => change(i, { type: e.target.value as Q["type"], correctIndex: 0 })}
                className="w-44"
              >
                <option value="single_choice">{t("singleChoice")}</option>
                <option value="true_false">{t("trueFalse")}</option>
              </NativeSelect>
              <Button type="button" variant="ghost" size="icon" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={t("remove", { n: i + 1 })}>
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">{t("stem")}</span>
              <Textarea rows={2} maxLength={1000} value={q.stem} onChange={(e) => change(i, { stem: e.target.value })} />
            </label>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">{t("options")}</legend>
              {(q.type === "true_false" ? tf : q.options).map((o, k) => (
                <div key={k} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${q.key}`}
                    checked={q.correctIndex === k}
                    onChange={() => change(i, { correctIndex: k })}
                    aria-label={t("markCorrect", { n: k + 1 })}
                    className="size-5 accent-primary"
                  />
                  {q.type === "true_false" ? (
                    <span>{o}</span>
                  ) : (
                    <>
                      <Input
                        aria-label={t("optionN", { n: k + 1 })}
                        maxLength={300}
                        value={o}
                        onChange={(e) => change(i, { options: q.options.map((x, m) => (m === k ? e.target.value : x)) })}
                      />
                      {q.options.length > 2 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => change(i, { options: q.options.filter((_, m) => m !== k), correctIndex: q.correctIndex >= k && q.correctIndex > 0 ? q.correctIndex - 1 : q.correctIndex })}
                          aria-label={t("removeOption", { n: k + 1 })}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              ))}
              {q.type === "single_choice" && q.options.length < 6 && (
                <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => change(i, { options: [...q.options, ""] })}>
                  <Plus aria-hidden="true" />
                  {t("addOption")}
                </Button>
              )}
            </fieldset>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                {t("explanation")} <span className="font-normal text-muted-foreground">({tc("optional")})</span>
              </span>
              <Textarea rows={2} maxLength={2000} value={q.explanation} onChange={(e) => change(i, { explanation: e.target.value })} />
            </label>
          </li>
        ))}
      </ol>
      {items.length < 5 && (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => setItems([...items, { key: `n${++seq}`, type: "single_choice", stem: "", options: ["", "", ""], correctIndex: 0, explanation: "" }])}
        >
          <Plus aria-hidden="true" />
          {t("add")}
        </Button>
      )}
      <FormError error={error} />
      <div className="flex items-center gap-3">
        <Button type="button" disabled={pending} onClick={save}>
          <Save aria-hidden="true" />
          {pending ? tc("saving") : tc("save")}
        </Button>
        <span role="status" className="text-sm text-muted-foreground">
          {saved ? tc("saved") : ""}
        </span>
      </div>
    </section>
  );
}
