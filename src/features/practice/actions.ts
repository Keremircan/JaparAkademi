"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, runAction, type ActionResult } from "@/features/shared/action-result";
import { redirect } from "@/i18n/navigation";
import { getRequestMeta } from "@/server/auth/request";
import {
  discardPracticalDraft,
  markTask,
  returnPracticalExam,
  savePracticalDraft,
  secondSignPracticalExam,
  signPracticalExam,
  startPracticalExam,
} from "@/server/services/practice";

const uuid = z.uuid();
const level = z.enum(["demonstrated", "supervised", "independent"]);
const note = z.string().max(1000).nullable();
const photos = z.array(z.uuid()).max(6);
// Çizim imzası: PNG data URL (sunucuda ayrıca doğrulanır)
const signature = z.string().max(450_000);

const markSchema = z.object({ assignmentModuleId: uuid, taskId: uuid, level, note, photoAssetIds: photos });

export async function markTaskAction(input: z.input<typeof markSchema>): Promise<ActionResult<{ moduleCompleted: boolean }>> {
  const parsed = markSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const { assignmentModuleId, taskId, ...rest } = parsed.data;
  const result = await runAction(() => markTask(actor, assignmentModuleId, taskId, rest));
  if (result.ok) refresh();
  return result;
}

export async function startPracticalExamAction(assignmentModuleId: string): Promise<ActionResult> {
  if (!uuid.safeParse(assignmentModuleId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => startPracticalExam(actor, assignmentModuleId));
  if (!result.ok) return result;
  return redirect({ href: `/trainer/evaluations/${result.data.id}`, locale: await getLocale() });
}

const draftSchema = z.object({
  criteria: z.array(z.object({ taskId: uuid, result: z.enum(["pass", "fail"]).nullable(), note })).max(200),
  note,
  photoAssetIds: photos,
});

export async function savePracticalDraftAction(id: string, input: z.input<typeof draftSchema>): Promise<ActionResult> {
  const parsed = draftSchema.safeParse(input);
  if (!uuid.safeParse(id).success || !parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(() => savePracticalDraft(actor, id, parsed.data));
}

export async function discardPracticalDraftAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => discardPracticalDraft(actor, id));
  if (!result.ok) return result;
  return redirect({ href: "/trainer", locale: await getLocale() });
}

const signSchema = draftSchema.extend({ traineeSignature: signature, trainerSignature: signature });

export async function signPracticalExamAction(id: string, input: z.input<typeof signSchema>): Promise<ActionResult> {
  const parsed = signSchema.safeParse(input);
  if (!uuid.safeParse(id).success || !parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const meta = await getRequestMeta();
  const result = await runAction(() => signPracticalExam(actor, id, { ...parsed.data, ip: meta.ip, userAgent: meta.userAgent }));
  if (result.ok) refresh();
  return result;
}

export async function secondSignPracticalExamAction(id: string, sig: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !signature.safeParse(sig).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const meta = await getRequestMeta();
  const result = await runAction(() => secondSignPracticalExam(actor, id, { signature: sig, ip: meta.ip, userAgent: meta.userAgent }));
  if (result.ok) refresh();
  return result;
}

export async function returnPracticalExamAction(id: string, reason: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !z.string().max(1000).safeParse(reason).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => returnPracticalExam(actor, id, reason));
  if (result.ok) refresh();
  return result;
}
