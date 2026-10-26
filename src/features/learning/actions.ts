"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, runAction, type ActionResult } from "@/features/shared/action-result";
import { redirect } from "@/i18n/navigation";
import { acknowledgeItem, acknowledgeReread, answerQuiz, reportReachedEnd, reportVideoProgress } from "@/server/services/assignments/learner";

const uuid = z.uuid();
const ranges = z.array(z.tuple([z.number().finite().min(0), z.number().finite().min(0)])).max(500);

export async function reportVideoAction(itemId: string, input: unknown): Promise<ActionResult<{ ratio: number; reachedEnd: boolean }>> {
  const parsed = ranges.safeParse(input);
  if (!uuid.safeParse(itemId).success || !parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(() => reportVideoProgress(actor, itemId, parsed.data));
}

export async function reportEndAction(itemId: string, ratio?: number): Promise<ActionResult> {
  if (!uuid.safeParse(itemId).success || (ratio !== undefined && !z.number().min(0).max(1).safeParse(ratio).success)) {
    return { ok: false, error: "invalid_input" };
  }
  const { actor } = await actionUser();
  return runAction(() => reportReachedEnd(actor, itemId, ratio));
}

export async function acknowledgeAction(itemId: string): Promise<ActionResult<{ moduleCompleted: boolean }>> {
  if (!uuid.safeParse(itemId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => acknowledgeItem(actor, itemId));
  if (result.ok) refresh();
  return result;
}

export async function answerQuizAction(
  assignmentModuleId: string,
  questionId: string,
  answerIndex: number,
): Promise<ActionResult<{ isCorrect: boolean; correctIndex: number; explanation: string | null; moduleCompleted: boolean }>> {
  if (!uuid.safeParse(assignmentModuleId).success || !uuid.safeParse(questionId).success || !z.number().int().min(0).max(10).safeParse(answerIndex).success) {
    return { ok: false, error: "invalid_input" };
  }
  const { actor } = await actionUser();
  const result = await runAction(() => answerQuiz(actor, assignmentModuleId, questionId, answerIndex));
  if (result.ok && result.data.moduleCompleted) refresh();
  return result;
}

export async function acknowledgeRereadAction(taskId: string): Promise<ActionResult> {
  if (!uuid.safeParse(taskId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => acknowledgeReread(actor, taskId));
  if (!result.ok) return result;
  return redirect({ href: "/learn", locale: await getLocale() });
}
