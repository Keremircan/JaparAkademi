"use client";

import { ShieldBan } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { addToBlacklistAction } from "../actions";

/** Kara listeye ekleme (FG-8.4): kimlik no zorunlu (eşleşme HMAC ile), gerekçe zorunlu, bitiş isteğe bağlı. */
export function BlacklistForm({ minDate }: { minDate: string }) {
  const t = useTranslations("visitors.blacklist");
  const tf = useTranslations("visitors.form");
  const empty = { fullName: "", idKind: "tc" as "tc" | "passport", idNumber: "", idCountry: "", reason: "", endsAt: "" };
  const [v, setV] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<typeof v>) => setV((x) => ({ ...x, ...patch }));
  return (
    <div className="flex max-w-2xl flex-col gap-5 rounded-2xl border p-5">
      <Field id="bl-name" label={tf("fullName")}>
        <Input id="bl-name" maxLength={200} autoComplete="off" value={v.fullName} onChange={(e) => set({ fullName: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[12rem_8rem_1fr]">
        <Field id="bl-kind" label={tf("idKind")}>
          <NativeSelect id="bl-kind" value={v.idKind} onChange={(e) => set({ idKind: e.target.value as "tc" | "passport" })}>
            <option value="tc">{tf("idTc")}</option>
            <option value="passport">{tf("idPassport")}</option>
          </NativeSelect>
        </Field>
        {v.idKind === "passport" && (
          <Field id="bl-country" label={tf("idCountry")}>
            <Input id="bl-country" maxLength={2} value={v.idCountry} onChange={(e) => set({ idCountry: e.target.value.toUpperCase() })} />
          </Field>
        )}
        <Field id="bl-number" label={tf("idNumber")}>
          <Input id="bl-number" autoComplete="off" maxLength={30} value={v.idNumber} onChange={(e) => set({ idNumber: e.target.value })} />
        </Field>
      </div>
      <Field id="bl-reason" label={t("reason")} hint={t("reasonHint")}>
        <Textarea id="bl-reason" rows={3} maxLength={1000} value={v.reason} onChange={(e) => set({ reason: e.target.value })} aria-describedby="bl-reason-hint" />
      </Field>
      <Field id="bl-ends" label={t("endsAt")} optional={tf("optional")} hint={t("endsAtHint")}>
        <Input id="bl-ends" type="date" min={minDate} className="max-w-56" value={v.endsAt} onChange={(e) => set({ endsAt: e.target.value })} aria-describedby="bl-ends-hint" />
      </Field>
      <FormError error={error} />
      {done && (
        <p role="status" className="text-emerald-700 dark:text-emerald-400">
          {t("added")}
        </p>
      )}
      <Button
        variant="destructive"
        className="self-start"
        disabled={pending || v.fullName.trim().length < 2 || !v.idNumber.trim() || v.reason.trim().length < 10}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            setDone(false);
            const r = await addToBlacklistAction({
              fullName: v.fullName,
              idKind: v.idKind,
              idNumber: v.idNumber,
              idCountry: v.idKind === "passport" ? v.idCountry : null,
              reason: v.reason,
              endsAt: v.endsAt || null,
            });
            if (!r.ok) return setError(r.error);
            setV(empty);
            setDone(true);
          })
        }
      >
        <ShieldBan aria-hidden="true" />
        {t("add")}
      </Button>
    </div>
  );
}
