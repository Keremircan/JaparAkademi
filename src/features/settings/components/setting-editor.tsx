"use client";

import { Pencil, RotateCcw, Save, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { SettingInput } from "@/server/services/settings/catalog";
import { updateSettingAction } from "../actions";

const CLASSES = ["low", "medium", "high"] as const;
const NEWLINE = String.fromCharCode(10);
type PerClass = Record<(typeof CLASSES)[number], number>;

/** Tek parametrenin düzenleyicisi. Değer sunucuda parametrenin Zod şemasıyla doğrulanır. */
export function SettingEditor({
  settingKey,
  input,
  value,
  isDefault,
  requireNote,
  eventKinds,
}: {
  settingKey: string;
  input: SettingInput;
  value: unknown;
  isDefault: boolean;
  requireNote: boolean;
  eventKinds: readonly string[];
}) {
  const t = useTranslations("settings");
  const tKinds = useTranslations("notifications.email.kinds");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<unknown>(value);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = settingKey.replace(/\./g, "-");

  if (input.kind === "readonly") return <p className="text-sm text-muted-foreground">{t("readonly")}</p>;

  const submit = (reset: boolean) =>
    startTransition(async () => {
      setError(null);
      const r = await updateSettingAction({ key: settingKey, value: reset ? undefined : draft, reset, note: note.trim() || null });
      if (!r.ok) return setError(r.error);
      setOpen(false);
      setNote("");
    });

  if (!open) {
    return (
      <Button
        variant="outline"
        className="self-start"
        onClick={() => {
          setDraft(value);
          setOpen(true);
        }}
      >
        <Pencil aria-hidden="true" />
        {t("edit")}
      </Button>
    );
  }

  const num = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-muted/40 p-4">
      {(input.kind === "int" || input.kind === "decimal") && (
        <Field id={`${id}-value`} label={t("newValue")}>
          <Input
            id={`${id}-value`}
            type="number"
            inputMode={input.kind === "int" ? "numeric" : "decimal"}
            step={input.kind === "int" ? 1 : input.step}
            className="max-w-48"
            value={Number.isNaN(draft as number) ? "" : String(draft)}
            onChange={(e) => setDraft(num(e.target.value))}
          />
        </Field>
      )}

      {input.kind === "boolean" && (
        <Field id={`${id}-value`} label={t("newValue")}>
          <NativeSelect id={`${id}-value`} className="max-w-48" value={draft ? "true" : "false"} onChange={(e) => setDraft(e.target.value === "true")}>
            <option value="true">{t("yes")}</option>
            <option value="false">{t("no")}</option>
          </NativeSelect>
        </Field>
      )}

      {input.kind === "hazardClass" && (
        <Field id={`${id}-value`} label={t("newValue")}>
          <NativeSelect id={`${id}-value`} className="max-w-72" value={(draft as string | null) ?? ""} onChange={(e) => setDraft(e.target.value || null)}>
            <option value="">{t("hazard.unset")}</option>
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {t(`hazard.${c}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}

      {input.kind === "perHazardClass" && (
        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-2 text-base font-medium">{t("newValue")}</legend>
          {CLASSES.map((c) => (
            <Field key={c} id={`${id}-${c}`} label={t(`hazard.${c}`)}>
              <Input
                id={`${id}-${c}`}
                type="number"
                inputMode="numeric"
                className="w-32"
                value={Number.isNaN((draft as PerClass)[c]) ? "" : String((draft as PerClass)[c])}
                onChange={(e) => setDraft({ ...(draft as PerClass), [c]: num(e.target.value) })}
              />
            </Field>
          ))}
        </fieldset>
      )}

      {input.kind === "list" && (
        <Field id={`${id}-value`} label={t("newValue")} hint={t("listHint")}>
          <Textarea
            id={`${id}-value`}
            rows={6}
            value={(draft as string[]).join(NEWLINE)}
            onChange={(e) => setDraft(e.target.value.split(NEWLINE))}
            onBlur={() => setDraft((draft as string[]).map((x) => x.trim()).filter(Boolean))}
            aria-describedby={`${id}-value-hint`}
          />
        </Field>
      )}

      {input.kind === "visitorTypes" && (
        <VisitorTypesEditor value={draft as VisitorTypes} onChange={setDraft} idPrefix={id} />
      )}

      {input.kind === "events" && (
        <fieldset>
          <legend className="mb-2 text-base font-medium">{t("events.legend")}</legend>
          <ul className="flex flex-col">
            {eventKinds.map((k) => {
              const selected = (draft as string[]).includes(k);
              return (
                <li key={k}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3">
                    <Checkbox
                      className="size-6"
                      checked={selected}
                      onCheckedChange={(v) =>
                        setDraft(v === true ? [...(draft as string[]), k] : (draft as string[]).filter((x) => x !== k))
                      }
                    />
                    <span>{tKinds(k as Parameters<typeof tKinds>[0])}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      <Field id={`${id}-note`} label={t("note")} optional={requireNote ? undefined : t("optional")} hint={requireNote ? t("noteRequiredHint") : undefined}>
        <Textarea
          id={`${id}-note`}
          maxLength={500}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-describedby={requireNote ? `${id}-note-hint` : undefined}
        />
      </Field>

      <FormError error={error} />

      <div className="flex flex-wrap gap-3">
        <Button disabled={pending} onClick={() => submit(false)}>
          <Save aria-hidden="true" />
          {t("save")}
        </Button>
        {!isDefault && (
          <Button variant="outline" disabled={pending} onClick={() => submit(true)}>
            <RotateCcw aria-hidden="true" />
            {t("reset")}
          </Button>
        )}
        <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          <X aria-hidden="true" />
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}

type VisitorTypeRow = { enabled: boolean; questionCount: number; passScore: number; cardMinSeconds: number; validityYears: number };
type VisitorTypes = Record<"office" | "site" | "contractor", VisitorTypeRow>;

/** Ziyaretçi tipleri tablosu (karar #126): her satır bir tip. */
function VisitorTypesEditor({ value, onChange, idPrefix }: { value: VisitorTypes; onChange: (v: VisitorTypes) => void; idPrefix: string }) {
  const t = useTranslations("settings.visitorTypes");
  const tTypes = useTranslations("visitors.types");
  const cols = ["questionCount", "passScore", "cardMinSeconds", "validityYears"] as const;
  const patch = (type: keyof VisitorTypes, p: Partial<VisitorTypeRow>) => onChange({ ...value, [type]: { ...value[type], ...p } });
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-2 pr-3 font-medium" />
            <th className="py-2 pr-3 font-medium">{t("enabled")}</th>
            {cols.map((c) => (
              <th key={c} className="py-2 pr-3 font-medium">
                {t(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(["office", "site", "contractor"] as const).map((type) => (
            <tr key={type} className="border-t">
              <th scope="row" className="py-2 pr-3 text-left font-medium">
                {tTypes(type)}
              </th>
              <td className="py-2 pr-3">
                <Checkbox
                  className="size-6"
                  aria-label={`${tTypes(type)} · ${t("enabled")}`}
                  checked={value[type].enabled}
                  onCheckedChange={(v) => patch(type, { enabled: v === true })}
                />
              </td>
              {cols.map((c) => (
                <td key={c} className="py-2 pr-3">
                  <Input
                    id={`${idPrefix}-${type}-${c}`}
                    aria-label={`${tTypes(type)} · ${t(c)}`}
                    type="number"
                    inputMode="numeric"
                    className="w-24"
                    value={Number.isNaN(value[type][c]) ? "" : String(value[type][c])}
                    onChange={(e) => patch(type, { [c]: e.target.value.trim() === "" ? Number.NaN : Number(e.target.value) })}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
