"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { runAction, type ActionResult } from "@/features/shared/action-result";
import { getRequestMeta } from "@/server/auth/request";
import { DEVICE_COOKIE, recognizeKiosk } from "@/server/services/devices";
import { completeBriefing, drawQuiz, enterVisitCode, selfRegister, startBriefing, submitQuiz } from "@/server/services/visitors";

/**
 * Ziyaretçi ekranlarının eylemleri (iş paketi 2.3a). Oturum yoktur: yetki ziyaret belirteciyle (ya da kiosk
 * cihaz çereziyle) serviste doğrulanır. Girdiler Zod ile ayrıştırılır.
 */
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const locale = z.enum(["tr", "en"]);

export async function startBriefingAction(t: string, l: string): Promise<ActionResult> {
  const p = z.tuple([token, locale]).safeParse([t, l]);
  if (!p.success) return { ok: false, error: "invalid_input" };
  return runAction(() => startBriefing(p.data[0], p.data[1]));
}

export async function drawQuizAction(t: string, l: string): Promise<ActionResult<Awaited<ReturnType<typeof drawQuiz>>>> {
  const p = z.tuple([token, locale]).safeParse([t, l]);
  if (!p.success) return { ok: false, error: "invalid_input" };
  return runAction(() => drawQuiz(p.data[0], p.data[1]));
}

export async function submitQuizAction(t: string, attemptId: string, answers: number[]): Promise<ActionResult<{ passed: boolean; score: number }>> {
  const p = z.tuple([token, z.uuid(), z.array(z.number().int().min(0).max(10)).max(50)]).safeParse([t, attemptId, answers]);
  if (!p.success) return { ok: false, error: "quiz_incomplete" };
  return runAction(() => submitQuiz(...p.data));
}

const completeSchema = z.object({
  locale,
  rulesId: z.uuid(),
  kvkkId: z.uuid(),
  signature: z.string().max(600_000),
});

export async function completeBriefingAction(t: string, input: z.infer<typeof completeSchema>): Promise<ActionResult> {
  const p = completeSchema.safeParse(input);
  if (!p.success || !token.safeParse(t).success) return { ok: false, error: "invalid_input" };
  const meta = await getRequestMeta();
  return runAction(() => completeBriefing(t, p.data, meta));
}

/** Kapı tableti: yalnızca kiosk olarak kayıtlı cihazda çalışır. */
export async function enterCodeAction(code: string): Promise<ActionResult<{ token: string }>> {
  const device = await recognizeKiosk((await cookies()).get(DEVICE_COOKIE)?.value);
  if (!device) return { ok: false, error: "not_kiosk" };
  if (!z.string().max(10).safeParse(code).success) return { ok: false, error: "code_invalid" };
  const r = await enterVisitCode(device.id, code.trim());
  if (r === "rate_limited") return { ok: false, error: "rate_limited" };
  if (!r) return { ok: false, error: "code_invalid" };
  return { ok: true, data: r };
}

const optText = (max: number) => z.string().max(max).nullable().optional();
const registerSchema = z.object({
  visitorType: z.enum(["office", "site", "contractor"]),
  fullName: z.string().min(1).max(200),
  companyName: optText(200),
  contractorCompanyId: z.uuid().nullable().optional(),
  phone: optText(30),
  email: optText(200),
  hostName: z.string().max(200),
});

/** Ön kaydı olmayan ziyaretçi: QR (kendi telefonu, IP sınırı) ya da kiosk (cihaz sınırı). */
export async function selfRegisterAction(input: z.infer<typeof registerSchema>, viaKiosk: boolean): Promise<ActionResult<{ token: string }>> {
  const p = registerSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid_input" };
  let key: string;
  if (viaKiosk) {
    const device = await recognizeKiosk((await cookies()).get(DEVICE_COOKIE)?.value);
    if (!device) return { ok: false, error: "not_kiosk" };
    key = `kiosk:${device.id}`;
  } else {
    key = `ip:${(await getRequestMeta()).ip ?? "unknown"}`;
  }
  const result = await runAction(() => selfRegister(p.data, key, viaKiosk ? "kiosk" : "self"));
  if (result.ok && result.data === "rate_limited") return { ok: false, error: "rate_limited" };
  return result as ActionResult<{ token: string }>;
}
