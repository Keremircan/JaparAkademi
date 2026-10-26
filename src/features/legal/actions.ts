"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, formText, runAction, type ActionResult } from "@/features/shared/action-result";
import { redirect } from "@/i18n/navigation";
import { getRequestMeta } from "@/server/auth/request";
import { acceptConsent, createDraft, publishText, updateDraft } from "@/server/services/legal";

const uuid = z.uuid();

export async function acceptConsentAction(legalTextId: string): Promise<ActionResult> {
  if (!uuid.safeParse(legalTextId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const meta = await getRequestMeta();
  const result = await runAction(() => acceptConsent(actor, legalTextId, meta));
  if (!result.ok) return result;
  return redirect({ href: "/", locale: await getLocale() });
}

const textSchema = z.object({ title: z.string().min(1).max(200), body: z.string().min(1).max(50_000) });

export async function saveLegalDraftAction(
  id: string | null,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = textSchema.safeParse({ title: formText(formData, "title") ?? "", body: formText(formData, "body") ?? "" });
  if (!parsed.success || (id && !uuid.safeParse(id).success)) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(async () => {
    if (id) await updateDraft(actor, id, parsed.data);
    else await createDraft(actor, parsed.data);
  });
  if (!result.ok) return result;
  return redirect({ href: "/admin/legal", locale: await getLocale() });
}

export async function publishLegalTextAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => publishText(actor, id));
  if (result.ok) refresh();
  return result;
}
