"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { ActionResult } from "@/features/shared/action-result";
import { CONTENT_TYPES } from "@/server/services/content/body";
import { createContentAction } from "../actions";
import { TypeIcon } from "./type-icon";

export function CreateContentForm({
  owners,
  ohsOnly,
}: {
  owners: { common: boolean; units: { id: string; name: string; parentName: string | null }[] };
  /** Yalnızca İSG içeriği hazırlayabilir (İSG uzmanı) */
  ohsOnly: boolean;
}) {
  const t = useTranslations("content.create");
  const tt = useTranslations("content.types");
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createContentAction, null);
  const [owner, setOwner] = useState(owners.common && owners.units.length === 0 ? "common" : "");

  return (
    <form action={action} className="flex max-w-3xl flex-col gap-6">
      {state && !state.ok && <FormError error={state.error} />}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-base font-medium">{t("type")}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CONTENT_TYPES.map((type, i) => (
            <label
              key={type}
              className="flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-3 has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <input type="radio" name="type" value={type} defaultChecked={i === 0} className="sr-only" />
              <TypeIcon type={type} className="mt-0.5 size-6 shrink-0" />
              <span>
                <span className="block font-medium">{tt(`${type}.label`)}</span>
                <span className="block text-sm text-muted-foreground">{tt(`${type}.hint`)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field id="title" label={t("title")}>
        <Input id="title" name="title" required minLength={3} maxLength={200} />
      </Field>

      <Field id="owner" label={t("owner")} hint={t("ownerHint")}>
        <NativeSelect id="owner" name="owner" required value={owner} onChange={(e) => setOwner(e.target.value)} aria-describedby="owner-hint">
          <option value="" disabled>
            {t("choose")}
          </option>
          {owners.common && <option value="common">{t("common")}</option>}
          {owners.units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.parentName ? `${u.parentName} / ${u.name}` : u.name}
            </option>
          ))}
        </NativeSelect>
      </Field>

      {owner === "common" && (
        <Field id="commonTarget" label={t("commonTarget")} hint={t("commonTargetHint")}>
          <NativeSelect id="commonTarget" name="commonTarget" defaultValue="all" aria-describedby="commonTarget-hint">
            <option value="all">{t("target.all")}</option>
            <option value="blue">{t("target.blue")}</option>
            <option value="white">{t("target.white")}</option>
          </NativeSelect>
        </Field>
      )}

      <label className="flex min-h-12 items-start gap-3">
        <input type="checkbox" name="isOhs" defaultChecked={ohsOnly} disabled={ohsOnly} className="mt-1 size-5 accent-primary" />
        {ohsOnly && <input type="hidden" name="isOhs" value="on" />}
        <span>
          <span className="block font-medium">{t("isOhs")}</span>
          <span className="block text-sm text-muted-foreground">{t("isOhsHint")}</span>
        </span>
      </label>

      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? t("creating") : t("submit")}
      </Button>
    </form>
  );
}
