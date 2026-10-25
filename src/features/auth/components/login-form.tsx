"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction } from "../actions";
import type { SignInState } from "../schemas";
import { PasswordInput } from "./password-input";

export function LoginForm() {
  const t = useTranslations("auth");
  const format = useFormatter();
  const [state, formAction, pending] = useActionState<SignInState, FormData>(signInAction, {});

  const errorMessage = state.error
    ? state.error === "locked" && state.lockedUntil
      ? t("errors.locked", { time: format.dateTime(new Date(state.lockedUntil), { hour: "2-digit", minute: "2-digit" }) })
      : t(`errors.${state.error}`)
    : null;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {errorMessage && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive">
          {errorMessage}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="sicilNo" className="text-base">
          {t("login.sicilLabel")}
        </Label>
        <Input
          id="sicilNo"
          name="sicilNo"
          inputMode="numeric"
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          defaultValue={state.sicilNo}
          aria-invalid={state.error === "invalid_credentials" || state.error === "invalid_input"}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password" className="text-base">
          {t("login.passwordLabel")}
        </Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error === "invalid_credentials" || state.error === "invalid_input"}
        />
      </div>

      <Label htmlFor="sharedDevice" className="flex min-h-12 cursor-pointer items-start gap-3 py-2 text-base font-normal">
        <Checkbox
          id="sharedDevice"
          name="sharedDevice"
          className="mt-0.5 size-6"
          aria-labelledby="sharedDevice-label"
          aria-describedby="sharedDevice-hint"
        />
        <span className="flex flex-col gap-1">
          <span id="sharedDevice-label">{t("login.sharedDevice")}</span>
          <span id="sharedDevice-hint" className="text-sm text-muted-foreground">
            {t("login.sharedDeviceHint")}
          </span>
        </span>
      </Label>

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? t("login.submitting") : t("login.submit")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">{t("login.help")}</p>
    </form>
  );
}
