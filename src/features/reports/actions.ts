"use server";

import { z } from "zod";
import { actionUser, runAction, type ActionResult } from "@/features/shared/action-result";
import { exportPersonalData } from "@/server/services/personal-export";

/** KVKK kişi verisi dışa aktarma (karar #99): dosya sunucuda saklanmaz, base64 olarak döner. */
export async function exportPersonalDataAction(userId: string): Promise<ActionResult<{ base64: string; fileName: string }>> {
  if (!z.uuid().safeParse(userId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(() => exportPersonalData(actor, userId));
}
