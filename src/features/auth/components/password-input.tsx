"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Göster/gizle düğmeli şifre alanı. */
export function PasswordInput(props: Omit<ComponentProps<typeof Input>, "type">) {
  const t = useTranslations("auth.login");
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className="pr-14" />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-0 right-0"
        aria-label={visible ? t("hidePassword") : t("showPassword")}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
  );
}
