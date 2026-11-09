"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { keepValues } from "@/components/forms/keep-values";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { ActionResult } from "@/features/shared/action-result";
import { Link } from "@/i18n/navigation";
import { orderShifts, shiftLabel } from "@/lib/shifts";
import { savePositionAction } from "../actions";

type Option = { id: string; label: string };

export function PositionForm({
  position,
  units,
  defaultUnitId,
  positionOptions,
  shiftTypes,
}: {
  position?: {
    id: string;
    orgUnitId: string;
    name: string;
    code: string;
    collarType: "blue" | "white";
    shifts: string[];
    supervisorPositionId: string | null;
    deputyPositionId: string | null;
  };
  units: Option[];
  defaultUnitId?: string;
  positionOptions: Option[];
  /** `org.shift_types` parametresi (karar #291) */
  shiftTypes: string[];
}) {
  const t = useTranslations("admin.org");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(savePositionAction, null);
  const others = positionOptions.filter((p) => p.id !== position?.id);
  // Listeden çıkarılmış ama pozisyonda kalan vardiya da gösterilir; kaldırmak İK'nın elindedir
  const shiftOptions = orderShifts([...shiftTypes, ...(position?.shifts ?? [])], shiftTypes);

  return (
    <form {...keepValues(action)} className="flex max-w-xl flex-col gap-5">
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
      <fieldset className="flex flex-col gap-2" aria-describedby="shifts-hint">
        <legend className="mb-2 text-sm leading-none font-medium pointer-fine:text-base">
          {t("positionForm.shiftPattern")}
          <span className="font-normal text-muted-foreground"> ({tc("optional")})</span>
        </legend>
        {shiftOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("positionForm.shiftsEmpty")}</p>
        ) : (
          <div className="grid gap-x-4 sm:grid-cols-2">
            {shiftOptions.map((s) => (
              <label key={s} className="flex min-h-12 items-center gap-3 rounded-lg px-2 hover:bg-muted pointer-fine:min-h-10">
                <input type="checkbox" name="shifts" value={s} defaultChecked={position?.shifts.includes(s)} className="size-5 accent-primary" />
                <span className="tabular-nums">{shiftLabel(s)}</span>
                {!shiftTypes.includes(s) && <span className="text-sm text-muted-foreground">({t("positionForm.shiftNotInList")})</span>}
              </label>
            ))}
          </div>
        )}
        <p id="shifts-hint" className="text-sm text-muted-foreground">
          {t("positionForm.shiftHint")}{" "}
          <Link href="/admin/settings" className="underline underline-offset-4">
            {t("positionForm.shiftTypesLink")}
          </Link>
        </p>
      </fieldset>
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
      {state && !state.ok && <FormError error={state.error} details={state.details} />}
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? tc("saving") : tc("save")}
      </Button>
    </form>
  );
}
