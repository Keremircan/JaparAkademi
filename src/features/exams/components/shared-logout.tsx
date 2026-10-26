"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/actions";

/** Ortak cihazda sınav bitince otomatik çıkış (FG-4.1): sonuç kısa süre gösterilir, sonra oturum kapanır. */
export function SharedDeviceLogout({ seconds }: { seconds: number }) {
  const t = useTranslations("exams.result");
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const timer = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (left <= 0) void signOutAction();
  }, [left]);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4" role="status">
      <span className="flex-1">{t("sharedLogout", { seconds: Math.max(0, left) })}</span>
      <Button variant="outline" onClick={() => void signOutAction()}>
        <LogOut aria-hidden="true" />
        {t("logoutNow")}
      </Button>
    </div>
  );
}
