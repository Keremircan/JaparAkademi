"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, runAction, type ActionResult } from "@/features/shared/action-result";
import { updateSettingFromScreen } from "@/server/services/settings";

const schema = z.object({
  key: z.string().min(1).max(100),
  // Değer parametrenin kendi Zod şemasıyla serviste doğrulanır
  value: z.unknown().optional(),
  reset: z.boolean().optional(),
  note: z.string().max(500).nullable().optional(),
});

export async function updateSettingAction(input: z.infer<typeof schema>): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => updateSettingFromScreen(actor, parsed.data));
  if (result.ok) refresh();
  return result;
}
