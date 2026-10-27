"use server";

import { z } from "zod";
import { getRequestMeta } from "@/server/auth/request";
import { ValidationError } from "@/server/errors";
import { logger } from "@/server/logger";
import { requestPasswordReset, resetPasswordWithToken } from "@/server/services/password-reset";
import type { PasswordIssueCode } from "./schemas";

export type ForgotState = { sent?: boolean };

/** Şifremi unuttum: sonuç her durumda aynıdır (sicilin varlığı sızdırılmaz; karar #88). */
export async function requestResetAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const sicilNo = z.string().trim().min(1).max(50).safeParse(formData.get("sicilNo"));
  if (sicilNo.success) {
    try {
      await requestPasswordReset({ sicilNo: sicilNo.data, ip: (await getRequestMeta()).ip });
    } catch (err) {
      logger.error({ err }, "Şifre sıfırlama isteği hatası");
    }
  }
  return { sent: true };
}

export type ResetState = { issues?: (PasswordIssueCode | "reset_link_invalid")[]; done?: boolean; unexpected?: boolean };

const resetSchema = z.object({ token: z.string().max(100), newPassword: z.string().min(1).max(200), confirmPassword: z.string().max(200) });

export async function resetPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = resetSchema.safeParse({ token: formData.get("token"), newPassword: formData.get("newPassword"), confirmPassword: formData.get("confirmPassword") });
  if (!parsed.success) return { issues: ["too_short"] };
  if (parsed.data.newPassword !== parsed.data.confirmPassword) return { issues: ["mismatch"] };
  try {
    await resetPasswordWithToken({ token: parsed.data.token, newPassword: parsed.data.newPassword });
    return { done: true };
  } catch (err) {
    if (err instanceof ValidationError) {
      return { issues: err.code === "weak_password" ? (err.details as PasswordIssueCode[]) : ["reset_link_invalid"] };
    }
    logger.error({ err }, "Şifre sıfırlama hatası");
    return { unexpected: true };
  }
}
