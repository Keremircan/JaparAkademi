"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { activateAction, type ActivateState, type CodeState, verifyCodeAction } from "../activate-actions";
import { PasswordInput } from "./password-input";

/** Kağıttaki kodla etkinleştirme, 1. adım: sicil no + 8 haneli kod. */
export function ActivationCodeForm() {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<CodeState, FormData>(verifyCodeAction, {});
  const error =
    state.error === "invalid_input"
      ? t("auth.activate.missing")
      : state.error === "rate_limited"
        ? t("auth.errors.rate_limited")
        : state.error === "unexpected"
          ? t("errors.unexpected")
          : state.error
            ? t("auth.activate.invalid")
            : null;
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <p>{t("auth.activate.codeIntro")}</p>
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="sicilNo" className="text-base">
          {t("auth.activate.sicil")}
        </Label>
        <Input
          id="sicilNo"
          name="sicilNo"
          inputMode="numeric"
          autoComplete="username"
          required
          defaultValue={state.sicilNo}
          className="h-12 text-lg"
          aria-invalid={!!state.error}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="code" className="text-base">
          {t("auth.activate.code")}
        </Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={20}
          className="h-12 font-mono text-lg tracking-widest"
          aria-describedby="code-hint"
          aria-invalid={!!state.error}
        />
        <p id="code-hint" className="text-sm text-muted-foreground">
          {t("auth.activate.codeHint")}
        </p>
      </div>
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? t("auth.activate.checking") : t("auth.activate.continue")}
      </Button>
      <p className="text-sm text-muted-foreground">{t("auth.activate.qrHint")}</p>
      <Link href="/login" className="inline-flex min-h-12 items-center justify-center underline underline-offset-4">
        {t("auth.activate.toLogin")}
      </Link>
    </form>
  );
}

/** 2. adım: kişi adını görür ve kendi şifresini belirler (karar #187). */
export function ActivatePasswordForm({ token, minLength }: { token: string; minLength: number }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<ActivateState, FormData>(activateAction, {});
  const issues = state.issues ?? [];
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="token" value={token} />
      {(issues.length > 0 || state.unexpected) && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive">
          <ul className="list-disc pl-5">
            {issues.map((issue) => (
              <li key={issue}>{issue === "invite_invalid" ? t("auth.activate.invalid") : t(`auth.passwordIssues.${issue}`, { min: minLength })}</li>
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
      <Label htmlFor="sharedDevice" className="flex min-h-12 cursor-pointer items-start gap-3 py-2 text-base font-normal">
        <Checkbox id="sharedDevice" name="sharedDevice" className="mt-0.5 size-6" aria-labelledby="sharedDevice-label" aria-describedby="sharedDevice-hint" />
        <span className="flex flex-col gap-1">
          <span id="sharedDevice-label">{t("auth.activate.sharedDevice")}</span>
          <span id="sharedDevice-hint" className="text-sm text-muted-foreground">
            {t("auth.login.sharedDeviceHint")}
          </span>
        </span>
      </Label>
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? t("auth.activate.submitting") : t("auth.activate.submit")}
      </Button>
    </form>
  );
}
