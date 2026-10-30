"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { applySetCookies, getRequestMeta, setLocaleCookie } from "@/server/auth/request";
import { ValidationError } from "@/server/errors";
import { logger } from "@/server/logger";
import { changePassword, signIn, signOut } from "@/server/services/auth";
import { DEVICE_COOKIE, recognizeDevice } from "@/server/services/devices";
import { cookies } from "next/headers";
import {
  changePasswordSchema,
  signInSchema,
  type ChangePasswordState,
  type PasswordIssueCode,
  type SignInState,
} from "./schemas";

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const rawSicil = String(formData.get("sicilNo") ?? "");
  const parsed = signInSchema.safeParse({
    sicilNo: rawSicil,
    password: formData.get("password"),
    sharedDevice: formData.get("sharedDevice") === "on",
  });
  if (!parsed.success) return { error: "invalid_input", sicilNo: rawSicil };

  // Kayıtlı ortak cihazda giriş her zaman ortak modda (FG-4.1)
  const device = await recognizeDevice((await cookies()).get(DEVICE_COOKIE)?.value);
  const result = await signIn({ ...parsed.data, sharedDevice: parsed.data.sharedDevice || !!device }, await getRequestMeta());
  if (!result.ok) {
    return { error: result.reason, lockedUntil: result.lockedUntil?.toISOString(), sicilNo: parsed.data.sicilNo };
  }

  await applySetCookies(result.setCookieHeaders);
  // Hesap dil tercihiyle açılır (karar #207)
  await setLocaleCookie(result.locale);
  return redirect({ href: result.mustChangePassword ? "/change-password" : "/", locale: result.locale });
}

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await getCurrentUser();
  const locale = await getLocale();
  if (!user) return redirect({ href: "/login", locale });

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { issues: ["too_short"] };
  if (parsed.data.newPassword !== parsed.data.confirmPassword) return { issues: ["mismatch"] };

  try {
    const { setCookieHeaders } = await changePassword(user, parsed.data, await getRequestMeta());
    await applySetCookies(setCookieHeaders);
  } catch (err) {
    if (err instanceof ValidationError) {
      const issues =
        err.code === "weak_password" ? (err.details as PasswordIssueCode[]) : [err.code as PasswordIssueCode];
      return { issues };
    }
    logger.error({ err, userId: user.userId }, "Şifre değiştirme hatası");
    return { unexpected: true };
  }

  return redirect({ href: "/", locale });
}

export async function signOutAction(): Promise<void> {
  const { setCookieHeaders } = await signOut(await getRequestMeta());
  await applySetCookies(setCookieHeaders);
  redirect({ href: "/login", locale: await getLocale() });
}
