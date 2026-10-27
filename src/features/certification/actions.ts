"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, runAction, type ActionResult } from "@/features/shared/action-result";
import { redirect } from "@/i18n/navigation";
import { issueAttendanceFor, revokeCertificate } from "@/server/services/certificates";
import { approveReadiness, decideProcess, rejectReadiness } from "@/server/services/readiness";
import { setSetting } from "@/server/services/settings";

const uuid = z.uuid();
const text = z.string().max(2000);

export async function approveReadinessAction(assignmentId: string, comment: string | null): Promise<ActionResult> {
  if (!uuid.safeParse(assignmentId).success || !text.nullable().safeParse(comment).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => approveReadiness(actor, assignmentId, comment));
  if (!result.ok) return result;
  return redirect({ href: "/manage/approvals", locale: await getLocale() });
}

const rejectSchema = z.object({ comment: text, reopenModuleIds: z.array(uuid).max(100) });

export async function rejectReadinessAction(assignmentId: string, input: z.input<typeof rejectSchema>): Promise<ActionResult> {
  const parsed = rejectSchema.safeParse(input);
  if (!uuid.safeParse(assignmentId).success || !parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => rejectReadiness(actor, assignmentId, parsed.data));
  if (!result.ok) return result;
  return redirect({ href: "/manage/approvals", locale: await getLocale() });
}

const decisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("extra_attempt"), reason: text, examModuleId: uuid, extraAttempts: z.number().int().min(1).max(10).nullable() }),
  z.object({ decision: z.literal("extra_training"), reason: text, reopenModuleIds: z.array(uuid).max(100) }),
  z.object({ decision: z.literal("end_process"), reason: text }),
]);

export async function decideProcessAction(assignmentId: string, input: z.input<typeof decisionSchema>): Promise<ActionResult> {
  const parsed = decisionSchema.safeParse(input);
  if (!uuid.safeParse(assignmentId).success || !parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => decideProcess(actor, assignmentId, parsed.data));
  if (!result.ok) return result;
  return redirect({ href: "/manage/approvals", locale: await getLocale() });
}

export async function revokeCertificateAction(id: string, reason: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !text.safeParse(reason).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => revokeCertificate(actor, id, reason));
  if (result.ok) refresh();
  return result;
}

export async function issueAttendanceAction(assignmentModuleId: string): Promise<ActionResult> {
  if (!uuid.safeParse(assignmentModuleId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => issueAttendanceFor(actor, assignmentModuleId));
  if (result.ok) refresh();
  return result.ok ? { ok: true, data: undefined } : result;
}

const signatoriesSchema = z
  .array(z.object({ name: z.string().trim().min(2).max(100), title: z.string().trim().min(2).max(100), signatureAssetId: uuid.nullable() }))
  .max(3);

export async function saveSignatoriesAction(input: z.input<typeof signatoriesSchema>): Promise<ActionResult> {
  const parsed = signatoriesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "signatories_invalid" };
  const { actor } = await actionUser();
  const result = await runAction(() => setSetting(actor, "certificate.signatories", parsed.data));
  if (result.ok) refresh();
  return result;
}
