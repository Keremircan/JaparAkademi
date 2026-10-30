"use server";

import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { applySetCookies, getRequestMeta, setLocaleCookie } from "@/server/auth/request";
import { toAppLocale } from "@/lib/locale";
import { ValidationError } from "@/server/errors";
import { logger } from "@/server/logger";
import { DEVICE_COOKIE, recognizeDevice } from "@/server/services/devices";
import { activateWithToken, verifyInviteCode } from "@/server/services/invitations";
import type { PasswordIssueCode } from "./schemas";

/**
 * Hesap etkinleştirme (iş paketi 2.6b, karar #187). Hesapsız ekranlar; yetki davet belirteci ya da sicil + kod ile.
 */

export type CodeState = { error?: "invite_invalid" | "rate_limited" | "invalid_input" | "unexpected"; sicilNo?: string };

const codeSchema = z.object({ sicilNo: z.string().trim().min(1).max(50), code: z.string().trim().min(1).max(20) });

/** 1. adım (kağıttaki kod): doğruysa etkinleştirme bağlantısına yönlendirir. */
export async function verifyCodeAction(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const sicilNo = String(formData.get("sicilNo") ?? "");
  const parsed = codeSchema.safeParse({ sicilNo, code: formData.get("code") });
  if (!parsed.success) return { error: "invalid_input", sicilNo };
  let token: string;
  try {
    ({ token } = await verifyInviteCode(parsed.data, await getRequestMeta()));
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.code === "rate_limited" ? "rate_limited" : "invite_invalid", sicilNo };
    logger.error({ err }, "Etkinleştirme kodu hatası");
    return { error: "unexpected", sicilNo };
  }
  return redirect({ href: `/activate/${token}`, locale: await getLocale() });
}

export type ActivateState = { issues?: (PasswordIssueCode | "invite_invalid")[]; unexpected?: boolean };

const activateSchema = z.object({
  token: z.string().max(100),
  newPassword: z.string().min(1).max(200),
  confirmPassword: z.string().max(200),
  sharedDevice: z.boolean(),
});

/** 2. adım: kişi şifresini belirler; hesap etkinleşir ve oturum açılır. */
export async function activateAction(_prev: ActivateState, formData: FormData): Promise<ActivateState> {
  const parsed = activateSchema.safeParse({
    token: formData.get("token"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
    sharedDevice: formData.get("sharedDevice") === "on",
  });
  if (!parsed.success) return { issues: ["too_short"] };
  if (parsed.data.newPassword !== parsed.data.confirmPassword) return { issues: ["mismatch"] };
  // Kayıtlı ortak cihazda oturum her zaman ortak modda (FG-4.1)
  const device = await recognizeDevice((await cookies()).get(DEVICE_COOKIE)?.value);
  // Etkinleştirmenin yapıldığı dil hesabın dil tercihi olur (karar #207)
  const pageLocale = toAppLocale(await getLocale());
  let result;
  try {
    result = await activateWithToken(
      {
        token: parsed.data.token,
        newPassword: parsed.data.newPassword,
        sharedDevice: parsed.data.sharedDevice || !!device,
        locale: pageLocale,
      },
      await getRequestMeta(),
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return { issues: err.code === "weak_password" ? (err.details as PasswordIssueCode[]) : ["invite_invalid"] };
    }
    logger.error({ err }, "Hesap etkinleştirme hatası");
    return { unexpected: true };
  }
  if (!result.ok) return redirect({ href: "/login", locale: pageLocale });
  await applySetCookies(result.setCookieHeaders);
  await setLocaleCookie(result.locale);
  return redirect({ href: "/", locale: result.locale });
}
