"use client";

import { Archive, Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { archiveCompetencyAction, createCompetencyAction, updateCompetencyAction } from "../actions";

type Values = { name: string; kind: "machine" | "task"; description: string; orgUnitId: string; validityMonths: string };

/** Yetkinlik tanımı: oluşturma (birim seçilir) ya da düzenleme (birim değişmez). */
export function CompetencyForm(
  props:
    | { mode: "create"; units: { id: string; name: string; parentName: string | null }[]; common: boolean }
    | { mode: "edit"; id: string; initial: Omit<Values, "orgUnitId"> },
) {
  const t = useTranslations("competencies.form");
  const tc = useTranslations("common");
  const uid = useId();
  const [v, setV] = useState<Values>(
    props.mode === "edit"
      ? { ...props.initial, orgUnitId: "" }
      : { name: "", kind: "machine", description: "", orgUnitId: props.units.length === 1 ? props.units[0]!.id : "", validityMonths: "" },
  );
  const [error, setError] = useState<{ code: string; details?: unknown } | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const set = (patch: Partial<Values>) => {
    setV((x) => ({ ...x, ...patch }));
    setSaved(false);
  };

  function submit() {
    setError(null);
    const months = v.validityMonths.trim() ? Number(v.validityMonths) : null;
    const base = { name: v.name, kind: v.kind, description: v.description.trim() || null, validityMonths: months };
    start(async () => {
      const r =
        props.mode === "create"
          ? await createCompetencyAction({ ...base, orgUnitId: v.orgUnitId === "common" ? null : v.orgUnitId || null })
          : await updateCompetencyAction(props.id, base);
      if (!r.ok) return setError({ code: r.error, details: r.details });
      setSaved(true);
      if (props.mode === "create") setV((x) => ({ ...x, name: "", description: "", validityMonths: "" }));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id={`${uid}-name`} label={t("name")} hint={t("nameHint")}>
          <Input id={`${uid}-name`} value={v.name} maxLength={200} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field id={`${uid}-kind`} label={t("kind")}>
          <NativeSelect id={`${uid}-kind`} value={v.kind} onChange={(e) => set({ kind: e.target.value as Values["kind"] })}>
            <option value="machine">{t("kinds.machine")}</option>
            <option value="task">{t("kinds.task")}</option>
          </NativeSelect>
        </Field>
        {props.mode === "create" && (
          <Field id={`${uid}-unit`} label={t("unit")} hint={t("unitHint")}>
            <NativeSelect id={`${uid}-unit`} value={v.orgUnitId} onChange={(e) => set({ orgUnitId: e.target.value })}>
              <option value="" disabled>
                {t("choose")}
              </option>
              {props.common && <option value="common">{t("common")}</option>}
              {props.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.parentName ? `${u.parentName} / ${u.name}` : u.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
        <Field id={`${uid}-validity`} label={t("validity")} hint={t("validityHint")} optional={tc("optional")}>
          <Input
            id={`${uid}-validity`}
            type="number"
            inputMode="numeric"
            min={1}
            max={240}
            value={v.validityMonths}
            onChange={(e) => set({ validityMonths: e.target.value })}
          />
        </Field>
      </div>
      <Field id={`${uid}-desc`} label={t("description")} optional={tc("optional")}>
        <Textarea id={`${uid}-desc`} rows={2} maxLength={2000} value={v.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <FormError error={error?.code} details={error?.details} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={pending || (props.mode === "create" && !v.orgUnitId)} onClick={submit}>
          {props.mode === "create" ? <Plus aria-hidden="true" /> : <Save aria-hidden="true" />}
          {pending ? tc("saving") : props.mode === "create" ? t("create") : tc("save")}
        </Button>
        {props.mode === "edit" && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(t("archiveConfirm"))) return;
              start(async () => {
                const r = await archiveCompetencyAction(props.id);
                if (!r.ok) setError({ code: r.error, details: r.details });
              });
            }}
          >
            <Archive aria-hidden="true" />
            {t("archive")}
          </Button>
        )}
        <span role="status" className="text-sm text-muted-foreground">
          {saved ? tc("saved") : ""}
        </span>
      </div>
    </div>
  );
}
