"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useRouter } from "@/i18n/navigation";
import { selfRegisterAction } from "../actions";

type VisitorType = "office" | "site" | "contractor";

/** Ön kaydı olmayan ziyaretçinin kendi kaydı (karar #139). Başarıda bilgilendirmeye geçilir. */
export function RegisterForm({ types, companies, viaKiosk }: { types: readonly VisitorType[]; companies: { id: string; name: string }[]; viaKiosk: boolean }) {
  const t = useTranslations("visitorFlow.register");
  const tTypes = useTranslations("visitorFlow.types");
  const router = useRouter();
  const [v, setV] = useState({ visitorType: types[0] ?? ("office" as VisitorType), fullName: "", companyName: "", contractorCompanyId: "", phone: "", email: "", hostName: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  return (
    <div className="flex flex-col gap-5">
      <Field id="reg-type" label={t("type")}>
        <NativeSelect id="reg-type" value={v.visitorType} onChange={(e) => set({ visitorType: e.target.value as VisitorType })}>
          {types.map((x) => (
            <option key={x} value={x}>
              {tTypes(x)}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="reg-name" label={t("fullName")}>
        <Input id="reg-name" autoComplete="name" maxLength={200} value={v.fullName} onChange={(e) => set({ fullName: e.target.value })} />
      </Field>
      {v.visitorType === "contractor" ? (
        <Field id="reg-company" label={t("contractor")}>
          <NativeSelect id="reg-company" value={v.contractorCompanyId} onChange={(e) => set({ contractorCompanyId: e.target.value })}>
            <option value="">{t("chooseCompany")}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : (
        <Field id="reg-company-name" label={t("company")} optional={t("optional")}>
          <Input id="reg-company-name" autoComplete="organization" maxLength={200} value={v.companyName} onChange={(e) => set({ companyName: e.target.value })} />
        </Field>
      )}
      <Field id="reg-phone" label={t("phone")} hint={t("contactHint")}>
        <Input id="reg-phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={v.phone} onChange={(e) => set({ phone: e.target.value })} aria-describedby="reg-phone-hint" />
      </Field>
      <Field id="reg-email" label={t("email")}>
        <Input id="reg-email" type="email" autoComplete="email" maxLength={200} value={v.email} onChange={(e) => set({ email: e.target.value })} />
      </Field>
      <Field id="reg-host" label={t("hostName")}>
        <Input id="reg-host" maxLength={200} value={v.hostName} onChange={(e) => set({ hostName: e.target.value })} />
      </Field>
      <p className="text-sm text-muted-foreground">{t("privacy")}</p>
      <FormError error={error} />
      <Button
        size="lg"
        className="self-start"
        disabled={pending || v.fullName.trim().length < 2 || v.hostName.trim().length < 2 || (!v.phone.trim() && !v.email.trim())}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await selfRegisterAction(
              {
                visitorType: v.visitorType,
                fullName: v.fullName,
                companyName: v.companyName || null,
                contractorCompanyId: v.visitorType === "contractor" ? v.contractorCompanyId || null : null,
                phone: v.phone || null,
                email: v.email || null,
                hostName: v.hostName,
              },
              viaKiosk,
            );
            if (!r.ok) return setError(r.error);
            router.push(`/v/${r.data.token}`);
          })
        }
      >
        {t("submit")}
        <ArrowRight aria-hidden="true" />
      </Button>
    </div>
  );
}
