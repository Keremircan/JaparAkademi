"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/features/shared/action-result";
import type { ModuleKind } from "@/server/services/modules";
import { createModuleAction, updateModuleAction } from "../actions";

const KINDS: ModuleKind[] = ["theory", "practice", "theory_exam", "practice_exam"];

type Values = {
  title: string;
  description: string | null;
  durationMin: number;
  isOhs: boolean;
  remoteAllowed: boolean;
  validityMonths: number | null;
  commonTarget: "all" | "blue" | "white" | null;
  commonSortOrder: number | null;
};

/** Modül oluşturma ve ayar düzenleme formu. */
export function ModuleForm(
  props:
    | { mode: "create"; owners: { common: boolean; units: { id: string; name: string; parentName: string | null }[] }; ohsOnly: boolean }
    | { mode: "edit"; moduleId: string; values: Values; isCommon: boolean; canEditRemote: boolean; isCardModule: boolean },
) {
  const t = useTranslations("modules.form");
  const tk = useTranslations("modules.kinds");
  const tc = useTranslations("common");
  const action = props.mode === "create" ? createModuleAction : updateModuleAction.bind(null, props.moduleId);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  const v: Partial<Values> = props.mode === "edit" ? props.values : { isOhs: props.ohsOnly, remoteAllowed: true, durationMin: 30 };
  const [owner, setOwner] = useState(props.mode === "create" && props.owners.common && props.owners.units.length === 0 ? "common" : "");
  const isCommon = props.mode === "edit" ? props.isCommon : owner === "common";
  const remoteLocked = props.mode === "edit" ? !props.canEditRemote : false;

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-5">
      {state && !state.ok && <FormError error={state.error} />}
      {state?.ok && (
        <p role="status" className="text-sm text-muted-foreground">
          {tc("saved")}
        </p>
      )}
      {props.mode === "create" && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-base font-medium">{t("kind")}</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {KINDS.map((k, i) => (
                <label key={k} className="flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-3 has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
                  <input type="radio" name="kind" value={k} defaultChecked={i === 0} className="sr-only" />
                  <span>
                    <span className="block font-medium">{tk(`${k}.label`)}</span>
                    <span className="block text-sm text-muted-foreground">{tk(`${k}.hint`)}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field id="owner" label={t("owner")} hint={t("ownerHint")}>
            <NativeSelect id="owner" name="owner" required value={owner} onChange={(e) => setOwner(e.target.value)} aria-describedby="owner-hint">
              <option value="" disabled>
                {t("choose")}
              </option>
              {props.owners.common && <option value="common">{t("common")}</option>}
              {props.owners.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.parentName ? `${u.parentName} / ${u.name}` : u.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </>
      )}

      <Field id="title" label={t("title")}>
        <Input id="title" name="title" required minLength={3} maxLength={200} defaultValue={v.title} readOnly={props.mode === "edit" && props.isCardModule} />
      </Field>
      <Field id="description" label={t("description")} optional={tc("optional")}>
        <Textarea id="description" name="description" rows={3} maxLength={2000} defaultValue={v.description ?? ""} />
      </Field>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field id="durationMin" label={t("durationMin")}>
          <Input id="durationMin" name="durationMin" type="number" inputMode="numeric" required min={1} max={100000} defaultValue={v.durationMin} />
        </Field>
        <Field id="validityMonths" label={t("validityMonths")} hint={t("validityHint")}>
          <Input id="validityMonths" name="validityMonths" type="number" inputMode="numeric" min={1} max={240} defaultValue={v.validityMonths ?? ""} aria-describedby="validityMonths-hint" />
        </Field>
      </div>

      {isCommon && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="commonTarget" label={t("commonTarget")}>
            <NativeSelect id="commonTarget" name="commonTarget" defaultValue={v.commonTarget ?? "all"}>
              <option value="all">{t("target.all")}</option>
              <option value="blue">{t("target.blue")}</option>
              <option value="white">{t("target.white")}</option>
            </NativeSelect>
          </Field>
          <Field id="commonSortOrder" label={t("commonSortOrder")} hint={t("commonSortOrderHint")}>
            <Input id="commonSortOrder" name="commonSortOrder" type="number" inputMode="numeric" min={0} max={1000} defaultValue={v.commonSortOrder ?? ""} aria-describedby="commonSortOrder-hint" />
          </Field>
        </div>
      )}

      <label className="flex min-h-12 items-start gap-3">
        <input type="checkbox" name="isOhs" defaultChecked={v.isOhs} className="mt-1 size-5 accent-primary" />
        <span>
          <span className="block font-medium">{t("isOhs")}</span>
          <span className="block text-sm text-muted-foreground">{t("isOhsHint")}</span>
        </span>
      </label>
      <label className="flex min-h-12 items-start gap-3">
        <input type="checkbox" name="remoteAllowed" defaultChecked={v.remoteAllowed} disabled={remoteLocked} className="mt-1 size-5 accent-primary" />
        {remoteLocked && v.remoteAllowed && <input type="hidden" name="remoteAllowed" value="on" />}
        <span>
          <span className="block font-medium">{t("remoteAllowed")}</span>
          <span className="block text-sm text-muted-foreground">{remoteLocked ? t("remoteLocked") : t("remoteHint")}</span>
        </span>
      </label>

      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? tc("saving") : props.mode === "create" ? t("create") : tc("save")}
      </Button>
    </form>
  );
}
