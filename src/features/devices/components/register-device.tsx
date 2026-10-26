"use client";

import { MonitorSmartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerThisDeviceAction } from "../actions";

/** Bu tarayıcıyı ortak cihaz olarak kaydetme (eğitim odası bilgisayarında yapılır). */
export function RegisterDevice() {
  const t = useTranslations("devices");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex max-w-xl flex-col gap-3 rounded-2xl border p-5">
      <h2 className="text-lg font-semibold">{t("registerTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("registerHint")}</p>
      <Field id="device-name" label={t("name")}>
        <Input id="device-name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
      </Field>
      <FormError error={error} />
      {done && (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          {t("registered")}
        </p>
      )}
      <Button
        className="self-start"
        disabled={pending || name.trim().length < 2}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await registerThisDeviceAction(name);
            if (!r.ok) return setError(r.error);
            setDone(true);
            setName("");
          })
        }
      >
        <MonitorSmartphone aria-hidden="true" />
        {t("register")}
      </Button>
    </div>
  );
}
