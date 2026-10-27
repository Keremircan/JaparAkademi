"use client";

import { FileDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { downloadBase64 } from "@/lib/download";
import { exportPersonalDataAction } from "../actions";

/** KVKK kişi verisi dışa aktarma düğmesi (İK, kişi sayfası). */
export function PersonalExportButton({ userId }: { userId: string }) {
  const t = useTranslations("personalExport");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        className="self-start"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await exportPersonalDataAction(userId);
            if (!r.ok) return setError(r.error);
            downloadBase64(r.data.fileName, r.data.base64, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
          })
        }
      >
        <FileDown aria-hidden="true" />
        {t("button")}
      </Button>
      <p className="text-sm text-muted-foreground">{t("note")}</p>
      <FormError error={error} />
    </div>
  );
}
