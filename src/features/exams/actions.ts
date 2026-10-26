"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, runAction, type ActionResult } from "@/features/shared/action-result";
import { redirect } from "@/i18n/navigation";
import { getRequestMeta } from "@/server/auth/request";
import { answerExam, recordExamEvent, startExam, submitExam } from "@/server/services/exams";
import { issueProctorCode, revokeProctorSession } from "@/server/services/exams/proctor";

const uuid = z.uuid();

export async function startExamAction(assignmentModuleId: string, code: string | null): Promise<ActionResult> {
  if (!uuid.safeParse(assignmentModuleId).success || !z.string().max(20).nullable().safeParse(code).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const meta = await getRequestMeta();
  const result = await runAction(() => startExam(actor, assignmentModuleId, { code, ip: meta.ip, userAgent: meta.userAgent }));
  if (!result.ok) return result;
  return redirect({ href: `/exam/${result.data.attemptId}`, locale: await getLocale() });
}

export async function answerExamAction(attemptId: string, itemId: string, shownIndex: number | null): Promise<ActionResult> {
  if (!uuid.safeParse(attemptId).success || !uuid.safeParse(itemId).success || !z.number().int().min(0).max(10).nullable().safeParse(shownIndex).success) {
    return { ok: false, error: "invalid_input" };
  }
  const { actor } = await actionUser();
  return runAction(() => answerExam(actor, attemptId, itemId, shownIndex));
}

const eventKind = z.enum(["tab_hidden", "tab_visible", "blur", "reconnect", "tts"]);

export async function examEventAction(attemptId: string, kind: string): Promise<ActionResult> {
  const k = eventKind.safeParse(kind);
  if (!uuid.safeParse(attemptId).success || !k.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(() => recordExamEvent(actor, attemptId, k.data));
}

export async function submitExamAction(attemptId: string): Promise<ActionResult> {
  if (!uuid.safeParse(attemptId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => submitExam(actor, attemptId));
  if (result.ok) refresh();
  return result;
}

export async function issueProctorCodeAction(location: string | null): Promise<ActionResult<{ code: string; expiresAt: string }>> {
  if (!z.string().max(200).nullable().safeParse(location).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => issueProctorCode(actor, { location }));
  if (!result.ok) return result;
  refresh();
  return { ok: true, data: { code: result.data.code, expiresAt: result.data.expiresAt.toISOString() } };
}

export async function revokeProctorSessionAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => revokeProctorSession(actor, id));
  if (result.ok) refresh();
  return result;
}
