"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, runAction, type ActionResult } from "@/features/shared/action-result";
import { redirect } from "@/i18n/navigation";
import {
  approveQuestionVersion,
  archiveQuestion,
  createQuestion,
  rejectQuestionVersion,
  updateQuestion,
} from "@/server/services/questions";
import { commitQuestionImport, previewQuestionImport } from "@/server/services/questions/import";
import type { ParsedQuestionRow } from "@/server/services/questions/parse";

const uuid = z.uuid();

const questionSchema = z.object({
  type: z.enum(["single_choice", "true_false"]),
  stem: z.string().max(2000),
  options: z.array(z.string().max(500)).min(2).max(5),
  correctIndex: z.number().int().min(0).max(4),
  explanation: z.string().max(2000).nullable(),
  topic: z.string().max(100),
  difficulty: z.number().int().min(1).max(3),
  isOhsCritical: z.boolean(),
  mediaAssetId: uuid.nullable(),
  moduleIds: z.array(uuid).max(20),
});

const createSchema = questionSchema.extend({ ownerOrgUnitId: uuid.nullable(), isOhs: z.boolean() });

export async function createQuestionAction(input: unknown): Promise<ActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => createQuestion(actor, parsed.data));
  if (!result.ok) return result;
  return redirect({ href: `/manage/questions/${result.data.id}`, locale: await getLocale() });
}

export async function updateQuestionAction(questionId: string, input: unknown): Promise<ActionResult<{ status: "active" | "ohs_review" }>> {
  const parsed = questionSchema.safeParse(input);
  if (!uuid.safeParse(questionId).success || !parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => updateQuestion(actor, questionId, parsed.data));
  if (result.ok) refresh();
  return result;
}

export async function approveQuestionAction(versionId: string): Promise<ActionResult> {
  if (!uuid.safeParse(versionId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => approveQuestionVersion(actor, versionId));
  if (result.ok) refresh();
  return result;
}

export async function rejectQuestionAction(versionId: string, comment: string): Promise<ActionResult> {
  if (!uuid.safeParse(versionId).success || !z.string().max(2000).safeParse(comment).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => rejectQuestionVersion(actor, versionId, comment));
  if (result.ok) refresh();
  return result;
}

export async function archiveQuestionAction(questionId: string): Promise<ActionResult> {
  if (!uuid.safeParse(questionId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => archiveQuestion(actor, questionId));
  if (result.ok) refresh();
  return result;
}

const targetSchema = z.object({ owner: z.union([z.literal("common"), uuid]), isOhs: z.boolean() });

function readImport(formData: FormData) {
  const target = targetSchema.safeParse({ owner: formData.get("owner"), isOhs: formData.get("isOhs") === "on" });
  const file = formData.get("file");
  if (!target.success || !(file instanceof File) || file.size === 0) return null;
  return { target: { ownerOrgUnitId: target.data.owner === "common" ? null : target.data.owner, isOhs: target.data.owner === "common" || target.data.isOhs }, file };
}

export async function previewQuestionImportAction(_prev: unknown, formData: FormData): Promise<ActionResult<{ rows: ParsedQuestionRow[] }>> {
  const input = readImport(formData);
  if (!input) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const buffer = Buffer.from(await input.file.arrayBuffer());
  return runAction(async () => ({ rows: await previewQuestionImport(actor, buffer, input.target) }));
}

export async function commitQuestionImportAction(formData: FormData): Promise<ActionResult<{ created: number; pending: number; skipped: number }>> {
  const input = readImport(formData);
  if (!input) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const result = await runAction(() => commitQuestionImport(actor, buffer, input.target));
  if (result.ok) refresh();
  return result;
}
