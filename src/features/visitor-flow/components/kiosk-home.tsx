"use client";

import { ArrowRight, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useRouter } from "@/i18n/navigation";
import { enterCodeAction } from "../actions";

/** Kapı tableti ana ekranı (karar #138, #146): ziyaret kodu ya da kendi kaydı. İsim listesi gösterilmez. */
export function KioskHome() {
  const t = useTranslations("visitorFlow.kiosk");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-8">
      <p className="text-lg">{t("intro")}</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            setError(null);
            const r = await enterCodeAction(code);
            if (!r.ok) {
              setCode("");
              return setError(r.error);
            }
            router.push(`/v/${r.data.token}`);
          });
        }}
      >
        <Field id="kiosk-code" label={t("codeLabel")}>
          <Input
            id="kiosk-code"
            inputMode="numeric"
            autoComplete="off"
            pattern="\d{6}"
            maxLength={6}
            className="h-16 max-w-64 text-center font-mono text-3xl tracking-[0.4em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
        <FormError error={error} />
        <Button type="submit" size="lg" className="self-start" disabled={pending || code.length !== 6}>
          {t("continue")}
          <ArrowRight aria-hidden="true" />
        </Button>
      </form>
      <Button variant="outline" size="lg" className="self-start" nativeButton={false} render={<Link href="/kiosk?register=1" />}>
        <UserPlus aria-hidden="true" />
        {t("noCode")}
      </Button>
    </div>
  );
}
