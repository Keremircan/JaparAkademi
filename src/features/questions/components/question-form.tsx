"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { MediaField } from "@/features/content/components/media-upload";
import type { AssetInfo } from "@/server/services/media";
import { TRUE_FALSE_OPTIONS } from "@/lib/questions";
import { createQuestionAction, updateQuestionAction } from "../actions";

type Values = {
  type: "single_choice" | "true_false";
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  topic: string;
  difficulty: number;
  isOhsCritical: boolean;
  moduleIds: string[];
};

/** Soru formu (oluşturma ve düzenleme). Doğru/yanlış sorusunda şıklar sabittir. */
export function QuestionForm(
  props: {
    topics: string[];
    modules: { id: string; title: string; ownerName: string | null }[];
    initial?: Values;
    image: AssetInfo | null;
  } & (
    | { mode: "create"; owners: { common: boolean; ohsOnly: boolean; units: { id: string; name: string; parentName: string | null }[] } }
    | { mode: "edit"; questionId: string; isOhs: boolean }
  ),
) {
  const t = useTranslations("questions.form");
  const tc = useTranslations("common");
  const listId = useId();
  const [v, setV] = useState<Values>(
    props.initial ?? { type: "single_choice", stem: "", options: ["", "", ""], correctIndex: 0, explanation: "", topic: "", difficulty: 1, isOhsCritical: false, moduleIds: [] },
  );
  const [owner, setOwner] = useState(props.mode === "create" && props.owners.units.length === 0 && props.owners.common ? "common" : "");
  const [isOhs, setIsOhs] = useState(props.mode === "create" ? props.owners.ohsOnly : props.isOhs);
  const [image, setImage] = useState<AssetInfo | null>(props.image);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<Values>) => {
    setV((x) => ({ ...x, ...patch }));
    setNotice(null);
  };
  const options = v.type === "true_false" ? TRUE_FALSE_OPTIONS : v.options;
  const needsApproval = isOhs || owner === "common" || v.isOhsCritical;

  function save() {
    setError(null);
    const payload = {
      type: v.type,
      stem: v.stem,
      options,
      correctIndex: v.correctIndex,
      explanation: v.explanation.trim() || null,
      topic: v.topic,
      difficulty: v.difficulty,
      isOhsCritical: v.isOhsCritical,
      mediaAssetId: image?.id ?? null,
      moduleIds: v.moduleIds,
    };
    startTransition(async () => {
      if (props.mode === "create") {
        const r = await createQuestionAction({ ...payload, ownerOrgUnitId: owner === "common" ? null : owner || null, isOhs: owner === "common" || isOhs });
        if (r && !r.ok) setError(r.error);
      } else {
        const r = await updateQuestionAction(props.questionId, payload);
        if (!r.ok) setError(r.error);
        else setNotice(r.data.status === "ohs_review" ? t("savedPending") : tc("saved"));
      }
    });
  }

  const shown = props.modules.filter((m) => !filter || m.title.toLocaleLowerCase("tr-TR").includes(filter.toLocaleLowerCase("tr-TR")) || v.moduleIds.includes(m.id));

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      {props.mode === "create" && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="owner" label={t("owner")}>
            <NativeSelect id="owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="" disabled>
                {t("choose")}
              </option>
              {props.owners.common && <option value="common">{t("commonOhs")}</option>}
              {props.owners.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.parentName ? `${u.parentName} / ${u.name}` : u.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <label className="flex min-h-12 items-center gap-3 self-end">
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={isOhs || owner === "common"}
              disabled={props.owners.ohsOnly || owner === "common"}
              onChange={(e) => setIsOhs(e.target.checked)}
            />
            <span>{t("isOhs")}</span>
          </label>
        </div>
      )}

      <Field id="type" label={t("type")}>
        <NativeSelect id="type" value={v.type} onChange={(e) => set({ type: e.target.value as Values["type"], correctIndex: 0 })}>
          <option value="single_choice">{t("singleChoice")}</option>
          <option value="true_false">{t("trueFalse")}</option>
        </NativeSelect>
      </Field>
      <Field id="stem" label={t("stem")}>
        <Textarea id="stem" rows={3} maxLength={2000} value={v.stem} onChange={(e) => set({ stem: e.target.value })} />
      </Field>
      <MediaField label={t("image")} optional kinds={["image"]} asset={image} onChange={setImage} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">{t("options")}</legend>
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name="correct"
              className="size-5 accent-primary"
              checked={v.correctIndex === i}
              onChange={() => set({ correctIndex: i })}
              aria-label={t("markCorrect", { letter: String.fromCharCode(65 + i) })}
            />
            <span className="w-6 font-mono text-sm">{String.fromCharCode(65 + i)}</span>
            {v.type === "true_false" ? (
              <span>{o}</span>
            ) : (
              <>
                <Input
                  aria-label={t("optionN", { letter: String.fromCharCode(65 + i) })}
                  maxLength={500}
                  value={o}
                  onChange={(e) => set({ options: v.options.map((x, k) => (k === i ? e.target.value : x)) })}
                />
                {v.options.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("removeOption", { letter: String.fromCharCode(65 + i) })}
                    onClick={() => set({ options: v.options.filter((_, k) => k !== i), correctIndex: v.correctIndex >= i && v.correctIndex > 0 ? v.correctIndex - 1 : v.correctIndex })}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </>
            )}
          </div>
        ))}
        {v.type === "single_choice" && v.options.length < 5 && (
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => set({ options: [...v.options, ""] })}>
            <Plus aria-hidden="true" />
            {t("addOption")}
          </Button>
        )}
      </fieldset>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field id="topic" label={t("topic")} hint={t("topicHint")}>
          <Input id="topic" list={listId} maxLength={100} value={v.topic} onChange={(e) => set({ topic: e.target.value })} aria-describedby="topic-hint" />
          <datalist id={listId}>
            {props.topics.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </Field>
        <Field id="difficulty" label={t("difficulty")}>
          <NativeSelect id="difficulty" value={String(v.difficulty)} onChange={(e) => set({ difficulty: Number(e.target.value) })}>
            {[1, 2, 3].map((d) => (
              <option key={d} value={d}>
                {t(`difficulties.${d as 1 | 2 | 3}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <label className="flex min-h-12 items-start gap-3">
        <input type="checkbox" className="mt-1 size-5 accent-primary" checked={v.isOhsCritical} onChange={(e) => set({ isOhsCritical: e.target.checked })} />
        <span>
          <span className="block font-medium">{t("ohsCritical")}</span>
          <span className="block text-sm text-muted-foreground">{t("ohsCriticalHint")}</span>
        </span>
      </label>
      <Field id="explanation" label={t("explanation")} optional={tc("optional")} hint={t("explanationHint")}>
        <Textarea id="explanation" rows={2} maxLength={2000} value={v.explanation} onChange={(e) => set({ explanation: e.target.value })} aria-describedby="explanation-hint" />
      </Field>

      <fieldset className="flex flex-col gap-2 rounded-xl border p-4">
        <legend className="font-medium">{t("modules")}</legend>
        <p className="text-sm text-muted-foreground">{t("modulesHint")}</p>
        <Input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("filterModules")} aria-label={t("filterModules")} />
        <div className="flex max-h-64 flex-col overflow-y-auto">
          {shown.map((m) => (
            <label key={m.id} className="flex min-h-12 items-center gap-3">
              <input
                type="checkbox"
                className="size-5 accent-primary"
                checked={v.moduleIds.includes(m.id)}
                onChange={(e) => set({ moduleIds: e.target.checked ? [...v.moduleIds, m.id] : v.moduleIds.filter((x) => x !== m.id) })}
              />
              <span>
                {m.title} <span className="text-sm text-muted-foreground">· {m.ownerName ?? t("common")}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {needsApproval && <p className="rounded-xl border bg-muted/50 p-3 text-sm">{t("approvalNote")}</p>}
      <FormError error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" disabled={pending || (props.mode === "create" && !owner)} onClick={save}>
          <Save aria-hidden="true" />
          {pending ? tc("saving") : tc("save")}
        </Button>
        <span role="status" className="text-sm text-muted-foreground">
          {notice ?? ""}
        </span>
      </div>
    </div>
  );
}
