"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, runAction, type ActionResult } from "@/features/shared/action-result";
import { cancelAssignment, startAssignment, updateAssignment } from "@/server/services/assignments";

const uuid = z.uuid();
const details = z.object({
  trainerUserId: uuid.nullable(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

export async function startAssignmentAction(userId: string, input: unknown): Promise<ActionResult> {
  const parsed = details.safeParse(input);
  if (!uuid.safeParse(userId).success || !parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => startAssignment(actor, userId, parsed.data));
  if (result.ok) refresh();
  return result.ok ? { ok: true, data: undefined } : result;
}

export async function updateAssignmentAction(assignmentId: string, input: unknown): Promise<ActionResult> {
  const parsed = details.safeParse(input);
  if (!uuid.safeParse(assignmentId).success || !parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => updateAssignment(actor, assignmentId, parsed.data));
  if (result.ok) refresh();
  return result;
}

export async function cancelAssignmentAction(assignmentId: string, reason: string): Promise<ActionResult> {
  if (!uuid.safeParse(assignmentId).success || !z.string().max(1000).safeParse(reason).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => cancelAssignment(actor, assignmentId, reason));
  if (result.ok) refresh();
  return result;
}
