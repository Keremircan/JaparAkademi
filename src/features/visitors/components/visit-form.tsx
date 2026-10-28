"use client";

import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { createVisitAction, updateVisitAction } from "../actions";

type VisitorType = "office" | "site" | "contractor";

export type VisitFormValues = {
  visitorType: VisitorType;
  plannedDate: string;
  fullName: string;
  companyName: string;
  contractorCompanyId: string;
  phone: string;
  email: string;
  note: string;
};

/**
 * Ön kayıt formu (SPEC 8.2/1). `security` modunda ev sahibi sicil no ve kimlik no alanları görünür (karar #129);
 * ev sahibi modunda kimlik alanı yoktur.
 */
export function VisitForm({
  mode,
  base,
  types,
  companies,
  minDate,
  visitId,
  initial,
}: {
  mode: "host" | "security";
  /** Kayıt sonrası gidilecek liste yolu (ör. /visits ya da /security/visits). */
  base: string;
  types: readonly VisitorType[];
  companies: { id: string; name: string }[];
  minDate: string;
  visitId?: string;
  initial?: VisitFormValues;
}) {
  const t = useTranslations("visitors.form");
  const tTypes = useTranslations("visitors.types");
  const router = useRouter();
  const [v, setV] = useState<VisitFormValues>(
    initial ?? { visitorType: types[0] ?? "office", plannedDate: minDate, fullName: "", companyName: "", contractorCompanyId: "", phone: "", email: "", note: "" },
  );
  const [hostSicil, setHostSicil] = useState("");
  const [idKind, setIdKind] = useState<"" | "tc" | "passport">("");
  const [idNumber, setIdNumber] = useState("");
  const [idCountry, setIdCountry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<VisitFormValues>) => setV((x) => ({ ...x, ...patch }));

  const submit = () =>
    startTransition(async () => {
      setError(null);
      setSaved(false);
      const payload = {
        ...v,
        companyName: v.companyName || null,
        contractorCompanyId: v.visitorType === "contractor" ? v.contractorCompanyId || null : null,
        phone: v.phone || null,
        email: v.email || null,
        note: v.note || null,
        hostSicilNo: mode === "security" && !visitId ? hostSicil || null : null,
        id: mode === "security" && idKind && idNumber ? { idKind, idNumber, idCountry: idKind === "passport" ? idCountry : null } : null,
      };
      if (visitId) {
        const r = await updateVisitAction(visitId, payload);
        if (!r.ok) return setError(r.error);
        setSaved(true);
      } else {
        const r = await createVisitAction(payload);
        if (!r.ok) return setError(r.error);
        router.push(`${base}/${r.data.id}`);
      }
    });

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Field id="visit-type" label={t("type")}>
        <NativeSelect id="visit-type" value={v.visitorType} onChange={(e) => set({ visitorType: e.target.value as VisitorType })}>
          {types.map((type) => (
            <option key={type} value={type}>
              {tTypes(type)}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="visit-date" label={t("date")}>
        <Input id="visit-date" type="date" min={minDate} value={v.plannedDate} onChange={(e) => set({ plannedDate: e.target.value })} className="max-w-56" />
      </Field>
      <Field id="visit-name" label={t("fullName")}>
        <Input id="visit-name" maxLength={200} autoComplete="off" value={v.fullName} onChange={(e) => set({ fullName: e.target.value })} />
      </Field>
      {v.visitorType === "contractor" ? (
        <Field id="visit-company" label={t("contractor")} hint={companies.length === 0 ? t("noCompanies") : undefined}>
          <NativeSelect id="visit-company" value={v.contractorCompanyId} onChange={(e) => set({ contractorCompanyId: e.target.value })}>
            <option value="">{t("chooseCompany")}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : (
        <Field id="visit-company-name" label={t("companyName")} optional={t("optional")}>
          <Input id="visit-company-name" maxLength={200} value={v.companyName} onChange={(e) => set({ companyName: e.target.value })} />
        </Field>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="visit-phone" label={t("phone")} optional={t("optional")}>
          <Input id="visit-phone" type="tel" inputMode="tel" maxLength={30} value={v.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <Field id="visit-email" label={t("email")} optional={t("optional")} hint={t("emailHint")}>
          <Input id="visit-email" type="email" maxLength={200} value={v.email} onChange={(e) => set({ email: e.target.value })} aria-describedby="visit-email-hint" />
        </Field>
      </div>

      {mode === "security" && (
        <fieldset className="flex flex-col gap-4 rounded-2xl border p-4">
          <legend className="px-1 text-base font-medium">{t("idLegend")}</legend>
          {!visitId && (
            <Field id="visit-host" label={t("hostSicil")} optional={t("optional")} hint={t("hostSicilHint")}>
              <Input id="visit-host" maxLength={30} value={hostSicil} onChange={(e) => setHostSicil(e.target.value)} aria-describedby="visit-host-hint" className="max-w-56" />
            </Field>
          )}
          <Field id="visit-id-kind" label={t("idKind")} optional={t("optional")}>
            <NativeSelect id="visit-id-kind" value={idKind} onChange={(e) => setIdKind(e.target.value as "" | "tc" | "passport")} className="max-w-56">
              <option value="">{t("idNone")}</option>
              <option value="tc">{t("idTc")}</option>
              <option value="passport">{t("idPassport")}</option>
            </NativeSelect>
          </Field>
          {idKind && (
            <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
              {idKind === "passport" && (
                <Field id="visit-id-country" label={t("idCountry")}>
                  <Input id="visit-id-country" maxLength={2} value={idCountry} onChange={(e) => setIdCountry(e.target.value.toUpperCase())} />
                </Field>
              )}
              <Field id="visit-id-number" label={t("idNumber")}>
                <Input id="visit-id-number" inputMode={idKind === "tc" ? "numeric" : "text"} autoComplete="off" maxLength={30} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
              </Field>
            </div>
          )}
        </fieldset>
      )}

      <Field id="visit-note" label={t("note")} optional={t("optional")}>
        <Textarea id="visit-note" rows={2} maxLength={500} value={v.note} onChange={(e) => set({ note: e.target.value })} />
      </Field>
      <FormError error={error} />
      {saved && (
        <p role="status" className="text-emerald-700 dark:text-emerald-400">
          {t("saved")}
        </p>
      )}
      <Button size="lg" className="self-start" disabled={pending || v.fullName.trim().length < 2} onClick={submit}>
        <Save aria-hidden="true" />
        {visitId ? t("save") : t("create")}
      </Button>
    </div>
  );
}
