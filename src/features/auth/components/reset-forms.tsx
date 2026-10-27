"use client";

import { MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { requestResetAction, resetPasswordAction, type ForgotState, type ResetState } from "../reset-actions";
import { PasswordInput } from "./password-input";

/** Şifremi unuttum: sicil no girilir; e-postası kayıtlıysa bağlantı gider. */
export function ForgotPasswordForm() {
  const t = useTranslations("auth.reset");
  const [state, formAction, pending] = useActionState<ForgotState, FormData>(requestResetAction, {});
  if (state.sent) {
    return (
      <div className="flex flex-col gap-4" role="status">
        <p className="flex items-start gap-3">
          <MailCheck aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-emerald-600" />
          {t("sent")}
        </p>
        <p className="text-sm text-muted-foreground">{t("noEmail")}</p>
        <Link href="/login" className="inline-flex min-h-12 items-center underline underline-offset-4">
          {t("backToLogin")}
        </Link>
      </div>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sicilNo" className="text-base">
          {t("sicil")}
        </Label>
        <Input id="sicilNo" name="sicilNo" inputMode="numeric" autoComplete="username" required className="h-12 text-lg" />
      </div>
      <p className="text-sm text-muted-foreground">{t("noEmail")}</p>
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? t("sending") : t("send")}
      </Button>
      <Link href="/login" className="inline-flex min-h-12 items-center justify-center underline underline-offset-4">
        {t("backToLogin")}
      </Link>
    </form>
  );
}

/** Yeni şifre belirleme (tek kullanımlık bağlantıyla). */
export function ResetPasswordForm({ token, minLength }: { token: string; minLength: number }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<ResetState, FormData>(resetPasswordAction, {});
  if (state.done) {
    return (
      <div className="flex flex-col gap-4" role="status">
        <p>{t("auth.reset.done")}</p>
        <Button size="lg" nativeButton={false} render={<Link href="/login" />}>
          {t("auth.reset.toLogin")}
        </Button>
      </div>
    );
  }
  const issues = state.issues ?? [];
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="token" value={token} />
      {(issues.length > 0 || state.unexpected) && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive">
          <ul className="list-disc pl-5">
            {issues.map((issue) => (
              <li key={issue}>{issue === "reset_link_invalid" ? t("auth.reset.invalid") : t(`auth.passwordIssues.${issue}`, { min: minLength })}</li>
            ))}
            {state.unexpected && <li>{t("errors.unexpected")}</li>}
          </ul>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="newPassword" className="text-base">
          {t("auth.changePassword.new")}
        </Label>
        <PasswordInput id="newPassword" name="newPassword" autoComplete="new-password" required minLength={minLength} aria-describedby="password-rules" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword" className="text-base">
          {t("auth.changePassword.confirm")}
        </Label>
        <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" required aria-invalid={issues.includes("mismatch")} />
      </div>
      <div id="password-rules" className="rounded-lg bg-muted px-4 py-3 text-sm">
        <p className="font-medium">{t("auth.changePassword.rulesTitle")}</p>
        <ul className="mt-1 list-disc pl-5 text-muted-foreground">
          <li>{t("auth.changePassword.ruleMinLength", { min: minLength })}</li>
          <li>{t("auth.changePassword.ruleNoSicil")}</li>
          <li>{t("auth.changePassword.ruleNotCommon")}</li>
        </ul>
      </div>
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? t("auth.changePassword.submitting") : t("auth.reset.submit")}
      </Button>
    </form>
  );
}
