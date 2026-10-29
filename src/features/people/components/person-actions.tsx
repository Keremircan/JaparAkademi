"use client";

import { Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ActionButton } from "@/components/forms/action-button";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { revealNationalIdAction, setPersonStatusAction } from "../actions";

/** TC'nin tamamını gösterme (yalnızca İK; her görüntüleme kaydedilir). */
export function RevealNationalId({ userId, masked }: { userId: string; masked: string }) {
  const t = useTranslations("admin.people.detail");
  const [value, setValue] = useState<string | null>(null);
  if (value) return <span className="font-mono text-lg">{value}</span>;
  return (
    <span className="flex flex-col gap-1">
      <span className="font-mono text-lg">{masked}</span>
      <ActionButton<string | null>
        variant="ghost"
        action={revealNationalIdAction.bind(null, userId)}
        onSuccess={(v) => setValue(v)}
      >
        <Eye aria-hidden="true" />
        {t("reveal")}
      </ActionButton>
      <span className="text-sm text-muted-foreground">{t("revealNotice")}</span>
    </span>
  );
}

export function StatusControls({
  userId,
  status,
}: {
  userId: string;
  status: "active" | "passive" | "terminated";
}) {
  const t = useTranslations("admin.people.detail");
  const [endDate, setEndDate] = useState("");
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("statusNotice")}</p>
      <div className="flex flex-wrap gap-2">
        {status === "active" ? (
          <ActionButton action={setPersonStatusAction.bind(null, userId, "passive", null)}>{t("setPassive")}</ActionButton>
        ) : (
          <ActionButton action={setPersonStatusAction.bind(null, userId, "active", null)}>{t("setActive")}</ActionButton>
        )}
      </div>
      {status !== "terminated" && (
        <div className="flex flex-wrap items-end gap-3">
          <Field id="endDate" label={t("endDate")}>
            <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-48" />
          </Field>
          <ActionButton variant="destructive" action={setPersonStatusAction.bind(null, userId, "terminated", endDate || null)}>
            {t("terminate")}
          </ActionButton>
        </div>
      )}
    </div>
  );
}
