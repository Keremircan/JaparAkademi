"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { ActionResult } from "@/features/shared/action-result";
import { savePositionAction } from "../actions";

type Option = { id: string; label: string };

export function PositionForm({
  position,
  units,
  defaultUnitId,
  positionOptions,
}: {
  position?: {
    id: string;
    orgUnitId: string;
    name: string;
    code: string;
    collarType: "blue" | "white";
    shiftPattern: string | null;
    supervisorPositionId: string | null;
    deputyPositionId: string | null;
  };
  units: Option[];
  defaultUnitId?: string;
  positionOptions: Option[];
}) {
  const t = useTranslations("admin.org");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(savePositionAction, null);
  const others = positionOptions.filter((p) => p.id !== position?.id);

  return (
    <form action={action} className="flex max-w-xl flex-col gap-5">
      {state && !state.ok && <FormError error={state.error} details={state.details} />}
      <input type="hidden" name="id" value={position?.id ?? ""} />
      <Field id="orgUnitId" label={t("positionForm.orgUnit")}>
        <NativeSelect id="orgUnitId" name="orgUnitId" required defaultValue={position?.orgUnitId ?? defaultUnitId ?? ""}>
          <option value="" disabled>
            —
          </option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="name" label={t("positionForm.name")}>
        <Input id="name" name="name" required defaultValue={position?.name} maxLength={120} />
      </Field>
      <Field id="code" label={t("positionForm.code")} hint={t("unitForm.codeHint")}>
        <Input id="code" name="code" required defaultValue={position?.code} maxLength={24} aria-describedby="code-hint" />
      </Field>
      <Field id="collarType" label={t("positionForm.collarType")}>
        <NativeSelect id="collarType" name="collarType" required defaultValue={position?.collarType ?? "blue"}>
          <option value="blue">{t("collar.blue")}</option>
          <option value="white">{t("collar.white")}</option>
        </NativeSelect>
      </Field>
      <Field id="shiftPattern" label={t("positionForm.shiftPattern")} hint={t("positionForm.shiftHint")} optional={tc("optional")}>
        <Input id="shiftPattern" name="shiftPattern" defaultValue={position?.shiftPattern ?? ""} maxLength={120} />
      </Field>
      <Field id="supervisorPositionId" label={t("positionForm.supervisor")} optional={tc("optional")}>
        <NativeSelect id="supervisorPositionId" name="supervisorPositionId" defaultValue={position?.supervisorPositionId ?? ""}>
          <option value="">{t("positionForm.none")}</option>
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="deputyPositionId" label={t("positionForm.deputy")} optional={tc("optional")}>
        <NativeSelect id="deputyPositionId" name="deputyPositionId" defaultValue={position?.deputyPositionId ?? ""}>
          <option value="">{t("positionForm.none")}</option>
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? tc("saving") : tc("save")}
      </Button>
    </form>
  );
}
