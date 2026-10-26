"use client";

import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { issueProctorCodeAction } from "../actions";

/** Gözetmen kodu üretme: kod yalnızca bu ekranda bir kez gösterilir (sunucuda saklanmaz). */
export function ProctorPanel() {
  const t = useTranslations("exams.proctor");
  const [location, setLocation] = useState("");
  const [issued, setIssued] = useState<{ code: string; expiresAt: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!issued) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [issued]);

  const left = issued ? Math.max(0, new Date(issued.expiresAt).getTime() - now) : 0;
  const mins = Math.floor(left / 60_000);

  return (
    <div className="flex max-w-xl flex-col gap-4 rounded-2xl border p-5">
      {issued && left > 0 ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <p className="text-muted-foreground">{t("codeLabel")}</p>
          <p className="font-mono text-6xl font-bold tracking-[0.3em]" aria-live="polite">
            {issued.code.slice(0, 3)} {issued.code.slice(3)}
          </p>
          <p className="text-sm text-muted-foreground">{t("expiresIn", { minutes: mins })}</p>
          <p className="text-sm">{t("shareHint")}</p>
        </div>
      ) : (
        <p className="text-muted-foreground">{t("intro")}</p>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("location")}</span>
        <Input value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} placeholder={t("locationPlaceholder")} />
      </label>
      <FormError error={error} />
      <Button
        size="lg"
        className="self-start"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await issueProctorCodeAction(location.trim() || null);
            if (!r.ok) return setError(r.error);
            setIssued(r.data);
            setNow(Date.now());
          })
        }
      >
        <KeyRound aria-hidden="true" />
        {issued ? t("newCode") : t("issue")}
      </Button>
    </div>
  );
}
