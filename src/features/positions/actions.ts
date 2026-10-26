"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, runAction, type ActionResult } from "@/features/shared/action-result";
import { redirect } from "@/i18n/navigation";
import {
  approveCard,
  createCard,
  discardCardDraft,
  rejectCard,
  reviewCard,
  saveCardSections,
  savePlan,
  startNewCardVersion,
  submitCard,
} from "@/server/services/positions";

const uuid = z.uuid();
const comment = z.string().max(2000);

export async function createCardAction(positionId: string): Promise<ActionResult> {
  if (!uuid.safeParse(positionId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => createCard(actor, positionId));
  if (!result.ok) return result;
  return redirect({ href: `/manage/positions/${positionId}/card`, locale: await getLocale() });
}

/** Bölümler serviste kart şemasıyla doğrulanır. */
export async function saveCardSectionsAction(positionId: string, sections: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(positionId).success || typeof sections !== "object" || sections === null) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(() => saveCardSections(actor, positionId, sections));
}

const planSchema = z.object({
  overrides: z.record(z.string(), z.unknown()),
  items: z
    .array(
      z.object({
        moduleId: uuid,
        isRequired: z.boolean(),
        prerequisiteModuleIds: z.array(uuid).max(100),
        settings: z.record(z.string(), z.unknown()),
      }),
    )
    .max(100),
});

export async function savePlanAction(positionId: string, input: unknown): Promise<ActionResult> {
  const parsed = planSchema.safeParse(input);
  if (!uuid.safeParse(positionId).success || !parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => savePlan(actor, positionId, parsed.data));
  if (result.ok) refresh();
  return result;
}

export async function submitCardAction(positionId: string, changeNote: string | null): Promise<ActionResult> {
  if (!uuid.safeParse(positionId).success || !comment.nullable().safeParse(changeNote).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => submitCard(actor, positionId, { changeNote }));
  if (!result.ok) return result;
  return redirect({ href: `/manage/positions/${positionId}`, locale: await getLocale() });
}

export async function approveCardAction(versionId: string, text: string): Promise<ActionResult> {
  if (!uuid.safeParse(versionId).success || !comment.safeParse(text).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => approveCard(actor, versionId, text));
  if (result.ok) refresh();
  return result.ok ? { ok: true, data: undefined } : result;
}

export async function rejectCardAction(versionId: string, text: string): Promise<ActionResult> {
  if (!uuid.safeParse(versionId).success || !comment.safeParse(text).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => rejectCard(actor, versionId, text));
  if (result.ok) refresh();
  return result;
}

export async function newCardVersionAction(positionId: string): Promise<ActionResult> {
  if (!uuid.safeParse(positionId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => startNewCardVersion(actor, positionId));
  if (!result.ok) return result;
  return redirect({ href: `/manage/positions/${positionId}/card`, locale: await getLocale() });
}

export async function discardCardDraftAction(positionId: string): Promise<ActionResult> {
  if (!uuid.safeParse(positionId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => discardCardDraft(actor, positionId));
  if (result.ok) refresh();
  return result;
}

export async function reviewCardAction(positionId: string): Promise<ActionResult> {
  if (!uuid.safeParse(positionId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => reviewCard(actor, positionId, null));
  if (result.ok) refresh();
  return result;
}
