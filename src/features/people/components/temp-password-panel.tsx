"use client";

import { Download, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { downloadBase64 } from "@/lib/download";

/** Bir kez gösterilen geçici şifre ve fiş PDF'i. */
export function TempPasswordPanel({
  title,
  description,
  sicilNo,
  tempPassword,
  slipPdf,
  children,
}: {
  title: string;
  description: string;
  sicilNo: string;
  tempPassword: string;
  slipPdf: string;
  children?: ReactNode;
}) {
  const t = useTranslations("admin.people.created");
  return (
    <div role="status" className="flex max-w-xl flex-col gap-4 rounded-2xl border border-primary/30 bg-muted p-6">
      <div className="flex items-center gap-3">
        <KeyRound aria-hidden="true" className="size-6" />
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      <p className="text-muted-foreground">{description}</p>
      <div>
        <p className="text-sm text-muted-foreground">{t("tempPassword")}</p>
        <p className="font-mono text-3xl tracking-widest" data-testid="temp-password">
          {tempPassword}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => downloadBase64(`gecici-sifre-${sicilNo}.pdf`, slipPdf, "application/pdf")}>
          <Download aria-hidden="true" />
          {t("printSlip")}
        </Button>
        {children}
      </div>
    </div>
  );
}
