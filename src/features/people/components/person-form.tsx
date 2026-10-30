"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { ActionResult } from "@/features/shared/action-result";
import { Link } from "@/i18n/navigation";
import { createPersonAction, type CreatePersonResult, updatePersonAction } from "../actions";
import { ChannelPicker, InvitePanel } from "./invite-controls";

type PositionOption = { id: string; label: string };

export type PersonFormValues = {
  userId: string;
  sicilNo: string;
  fullName: string;
  positionId: string | null;
  nationalIdMasked: string | null;
  phone: string | null;
  email: string | null;
  employmentType: "employee" | "intern";
  hireDate: string | null;
  trainingRequired: boolean;
};

export function PersonForm({
  person,
  positions,
  mailEnabled = false,
}: {
  person?: PersonFormValues;
  positions: PositionOption[];
  mailEnabled?: boolean;
}) {
  const t = useTranslations("admin.people");
  const tc = useTranslations("common");
  const isEdit = !!person;
  type FormState = ActionResult<CreatePersonResult | void> | null;
  const submit = (isEdit ? updatePersonAction.bind(null, person.userId) : createPersonAction) as (
    prev: FormState,
    formData: FormData,
  ) => Promise<FormState>;
  const [state, action, pending] = useActionState<FormState, FormData>(submit, null);
  const [positionId, setPositionId] = useState(person?.positionId ?? "");
  const [sicilNo, setSicilNo] = useState("");
  const ti = useTranslations("invite.panel");

  if (!isEdit && state?.ok && state.data) {
    const created = state.data as CreatePersonResult;
    const toDetail = (
      <Button className="self-start" nativeButton={false} render={<Link href={`/admin/people/${created.userId}`} />}>
        {ti("toDetail")}
      </Button>
    );
    if (!created.invite) {
      return (
        <div role="status" className="flex max-w-xl flex-col gap-4 rounded-2xl border border-primary/30 bg-muted p-6">
          <h2 className="text-xl font-semibold">{ti("createdTitle")}</h2>
          <p>{ti("createdNoInvite")}</p>
          <div className="flex flex-wrap gap-2">
            {toDetail}
            <Button variant="outline" nativeButton={false} render={<Link href="/admin/people/invites" />}>
              {ti("toInvites")}
            </Button>
          </div>
        </div>
      );
    }
    return (
      <InvitePanel title={ti("createdTitle")} invite={created.invite}>
        <Button className="self-start" nativeButton={false} render={<Link href={`/admin/people/${created.userId}`} />}>
          {ti("toDetail")}
        </Button>
      </InvitePanel>
    );
  }

  return (
    <form action={action} className="flex max-w-xl flex-col gap-5">
      {state && !state.ok && <FormError error={state.error} details={state.details} />}
      {isEdit ? (
        <p className="text-muted-foreground">
          {t("form.sicil")}: <span className="font-medium text-foreground">{person.sicilNo}</span>
        </p>
      ) : (
        <Field id="sicilNo" label={t("form.sicil")} hint={t("form.sicilHint")}>
          <Input
            id="sicilNo"
            name="sicilNo"
            required
            maxLength={32}
            autoComplete="off"
            aria-describedby="sicilNo-hint"
            value={sicilNo}
            onChange={(e) => setSicilNo(e.target.value)}
          />
        </Field>
      )}
      <Field id="fullName" label={t("form.fullName")}>
        <Input id="fullName" name="fullName" required maxLength={160} defaultValue={person?.fullName} autoComplete="off" />
      </Field>
      <Field id="positionId" label={t("form.position")} hint={positionId ? undefined : t("form.noPositionWarning")}>
        <NativeSelect id="positionId" name="positionId" value={positionId} onChange={(e) => setPositionId(e.target.value)}>
          <option value="">{t("form.noPosition")}</option>
          {positions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="hireDate" label={t("form.hireDate")} optional={tc("optional")}>
        <Input id="hireDate" name="hireDate" type="date" defaultValue={person?.hireDate ?? ""} />
      </Field>
      <Field id="employmentType" label={t("form.employmentType")}>
        <NativeSelect id="employmentType" name="employmentType" defaultValue={person?.employmentType ?? "employee"}>
          <option value="employee">{t("form.employmentTypes.employee")}</option>
          <option value="intern">{t("form.employmentTypes.intern")}</option>
        </NativeSelect>
      </Field>
      <Field
        id="nationalId"
        label={t("form.nationalId")}
        hint={isEdit && person.nationalIdMasked ? `${person.nationalIdMasked} · ${t("form.nationalIdHint")}` : t("form.nationalIdHint")}
        optional={tc("optional")}
      >
        <Input
          id="nationalId"
          name="nationalId"
          inputMode="numeric"
          maxLength={11}
          autoComplete="off"
          aria-describedby="nationalId-hint"
        />
      </Field>
      <Field id="phone" label={t("form.phone")} optional={tc("optional")}>
        <Input id="phone" name="phone" type="tel" maxLength={30} defaultValue={person?.phone ?? ""} />
      </Field>
      <Field id="email" label={t("form.email")} optional={tc("optional")}>
        <Input id="email" name="email" type="email" maxLength={200} defaultValue={person?.email ?? ""} />
      </Field>
      <Label htmlFor="trainingRequired" className="flex min-h-12 cursor-pointer items-start gap-3 py-2 text-base font-normal">
        <Checkbox
          id="trainingRequired"
          name="trainingRequired"
          defaultChecked={person?.trainingRequired ?? false}
          className="mt-0.5 size-6"
          aria-labelledby="trainingRequired-label"
          aria-describedby="trainingRequired-hint"
        />
        <span className="flex flex-col gap-1">
          <span id="trainingRequired-label">{t("form.trainingRequired")}</span>
          <span id="trainingRequired-hint" className="text-sm text-muted-foreground">
            {t("form.trainingRequiredHint")}
          </span>
        </span>
      </Label>
      {!isEdit && <ChannelPicker mailEnabled={mailEnabled} allowNone />}
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? tc("saving") : tc("save")}
      </Button>
    </form>
  );
}
