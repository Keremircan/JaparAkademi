"use client";

import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { saveCompanyAction } from "../actions";

type Values = { name: string; taxNo: string; responsibleName: string; phone: string; email: string; contractEnd: string };

/** Taşeron firma kartı (FG-8.3). Yeni kayıtta firma sayfasına gidilir. */
export function CompanyForm({ id, initial }: { id?: string; initial?: Values }) {
  const t = useTranslations("visitors.companies");
  const tf = useTranslations("visitors.form");
  const router = useRouter();
  const [v, setV] = useState<Values>(initial ?? { name: "", taxNo: "", responsibleName: "", phone: "", email: "", contractEnd: "" });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<Values>) => setV((x) => ({ ...x, ...patch }));
  const field = (key: keyof Values, label: string, props: React.ComponentProps<typeof Input> = {}, optional = true) => (
    <Field id={`company-${key}`} label={label} optional={optional ? tf("optional") : undefined}>
      <Input id={`company-${key}`} value={v[key]} onChange={(e) => set({ [key]: e.target.value })} {...props} />
    </Field>
  );
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      {field("name", t("name"), { maxLength: 200 }, false)}
      <div className="grid gap-5 sm:grid-cols-2">
        {field("taxNo", t("taxNo"), { inputMode: "numeric", maxLength: 11 })}
        {field("contractEnd", t("contractEnd"), { type: "date" })}
        {field("responsibleName", t("responsible"), { maxLength: 200 })}
        {field("phone", tf("phone"), { type: "tel", inputMode: "tel", maxLength: 30 })}
        {field("email", tf("email"), { type: "email", maxLength: 200 })}
      </div>
      <FormError error={error} />
      {saved && (
        <p role="status" className="text-emerald-700 dark:text-emerald-400">
          {tf("saved")}
        </p>
      )}
      <Button
        size="lg"
        className="self-start"
        disabled={pending || v.name.trim().length < 2}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            setSaved(false);
            const payload = {
              name: v.name,
              taxNo: v.taxNo || null,
              responsibleName: v.responsibleName || null,
              phone: v.phone || null,
              email: v.email || null,
              contractEnd: v.contractEnd || null,
            };
            const r = await saveCompanyAction(id ?? null, payload);
            if (!r.ok) return setError(r.error);
            if (id) setSaved(true);
            else router.push(`/security/contractors/${r.data.id}`);
          })
        }
      >
        <Save aria-hidden="true" />
        {id ? tf("save") : t("create")}
      </Button>
    </div>
  );
}
