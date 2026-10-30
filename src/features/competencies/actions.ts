"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, runAction, type ActionResult } from "@/features/shared/action-result";
import { archiveCompetency, createCompetency, grantCompetency, revokeCompetencyGrant, updateCompetency } from "@/server/services/competencies";

/** Yetkinlik tanımları, elle verme ve geri alma (iş paketi 3.1, kararlar #218–219). */

const uuid = z.uuid();
const definition = z.object({
  name: z.string().max(200),
  kind: z.enum(["machine", "task"]),
  description: z.string().max(2000).nullable(),
  validityMonths: z.number().int().min(1).max(240).nullable(),
});

export async function createCompetencyAction(input: unknown): Promise<ActionResult> {
  const parsed = definition.extend({ orgUnitId: uuid.nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => createCompetency(actor, parsed.data));
  if (result.ok) refresh();
  return result.ok ? { ok: true, data: undefined } : result;
}

export async function updateCompetencyAction(id: string, input: unknown): Promise<ActionResult> {
  const parsed = definition.safeParse(input);
  if (!uuid.safeParse(id).success || !parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => updateCompetency(actor, id, parsed.data));
  if (result.ok) refresh();
  return result;
}

export async function archiveCompetencyAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => archiveCompetency(actor, id));
  if (result.ok) refresh();
  return result;
}

const reason = z.string().max(2000);

export async function grantCompetencyAction(userId: string, competencyId: string, text: string): Promise<ActionResult> {
  if (!uuid.safeParse(userId).success || !uuid.safeParse(competencyId).success || !reason.safeParse(text).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => grantCompetency(actor, { userId, competencyId, reason: text }));
  if (result.ok) refresh();
  return result.ok ? { ok: true, data: undefined } : result;
}

export async function revokeGrantAction(grantId: string, text: string): Promise<ActionResult> {
  if (!uuid.safeParse(grantId).success || !reason.safeParse(text).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => revokeCompetencyGrant(actor, grantId, text));
  if (result.ok) refresh();
  return result;
}
