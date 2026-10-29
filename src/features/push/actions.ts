"use server";

import { headers } from "next/headers";
import { actionUser, runAction, type ActionResult } from "@/features/shared/action-result";
import { isSubscribed, subscribePush, unsubscribePush } from "@/server/services/push";
import { pushEndpointSchema, pushSubscriptionSchema } from "./schemas";

/** Bu tarayıcının aboneliği bu kişiye kayıtlı mı (profildeki düğmenin durumu). */
export async function pushStatusAction(endpoint: string): Promise<ActionResult<boolean>> {
  const parsed = pushEndpointSchema.safeParse(endpoint);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(() => isSubscribed(actor, parsed.data));
}

export async function subscribePushAction(input: unknown): Promise<ActionResult> {
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { user } = await actionUser();
  const ua = (await headers()).get("user-agent");
  return runAction(() => subscribePush(user, parsed.data, ua));
}

export async function unsubscribePushAction(endpoint: string): Promise<ActionResult> {
  const parsed = pushEndpointSchema.safeParse(endpoint);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(() => unsubscribePush(actor, parsed.data));
}
