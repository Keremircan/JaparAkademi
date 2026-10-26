"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { changePasswordAction } from "../actions";
import type { ChangePasswordState } from "../schemas";
import { PasswordInput } from "./password-input";

export function ChangePasswordForm({ minLength }: { minLength: number }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<ChangePasswordState, FormData>(changePasswordAction, {});
  const issues = state.issues ?? [];
  const currentInvalid = issues.includes("current_password_invalid");
  const newInvalid = issues.some((i) => i !== "current_password_invalid");

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {(issues.length > 0 || state.unexpected) && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive">
          <ul className="list-disc pl-5">
            {issues.map((issue) => (
              <li key={issue}>{t(`auth.passwordIssues.${issue}`, { min: minLength })}</li>
            ))}
            {state.unexpected && <li>{t("errors.unexpected")}</li>}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="currentPassword" className="text-base">
          {t("auth.changePassword.current")}
        </Label>
        <PasswordInput
          id="currentPassword"
          name="currentPassword"
          autoComplete="current-password"
          required
          aria-invalid={currentInvalid}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="newPassword" className="text-base">
          {t("auth.changePassword.new")}
        </Label>
        <PasswordInput
          id="newPassword"
          name="newPassword"
          autoComplete="new-password"
          required
          minLength={minLength}
          aria-invalid={newInvalid}
          aria-describedby="password-rules"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword" className="text-base">
          {t("auth.changePassword.confirm")}
        </Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          aria-invalid={issues.includes("mismatch")}
        />
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
        {pending ? t("auth.changePassword.submitting") : t("auth.changePassword.submit")}
      </Button>
    </form>
  );
}
