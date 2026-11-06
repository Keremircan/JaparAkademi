"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, formText, runAction, type ActionResult } from "@/features/shared/action-result";
import { sendTestEmail, type TestMailResult } from "@/server/services/mail-status";

/** Deneme e-postası (iş paketi 3.7, karar #261): sonuç hemen döner; sayaç ve son hatalar yenilenir. */
export async function sendTestEmailAction(_prev: ActionResult<TestMailResult> | null, formData: FormData): Promise<ActionResult<TestMailResult>> {
  const to = z.email().max(254).safeParse(formText(formData, "to"));
  if (!to.success) return { ok: false, error: "invalid_email" };
  const { user, actor } = await actionUser();
  const result = await runAction(() => sendTestEmail(actor, { to: to.data, locale: user.locale }));
  if (result.ok) refresh();
  return result;
}
