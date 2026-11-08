"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, runAction, type ActionResult } from "@/features/shared/action-result";
import { redirect } from "@/i18n/navigation";
import { DELETE_KINDS, isSafeReturnPath, type DeleteKind, type DeletionCheck } from "@/lib/deletion";
import { checkDeletion, deleteRecord } from "@/server/services/deletion";

/** Silme sonrası: aynı sayfada kal ve yenile, hiçbir şey yapma (istemci kendi listesini günceller) ya da bir sayfaya git. */
export type AfterDelete = "refresh" | "none" | `/${string}`;

const target = z.object({ kind: z.enum(DELETE_KINDS), id: z.uuid() });
const after = z.union([z.literal("refresh"), z.literal("none"), z.string().refine(isSafeReturnPath)]);

/** Silme penceresi açılırken: silinebilir mi, önce silinmesi gerekenler, geçmiş kaydı (iş paketi 3.14). */
export async function checkDeletionAction(kind: DeleteKind, id: string): Promise<ActionResult<DeletionCheck>> {
  const parsed = target.safeParse({ kind, id });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(() => checkDeletion(actor, parsed.data.kind, parsed.data.id));
}

export async function deleteRecordAction(kind: DeleteKind, id: string, afterDelete: AfterDelete): Promise<ActionResult> {
  const parsed = target.safeParse({ kind, id });
  const next = after.safeParse(afterDelete);
  if (!parsed.success || !next.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => deleteRecord(actor, parsed.data.kind, parsed.data.id));
  if (!result.ok) return result;
  if (next.data === "refresh") refresh();
  else if (next.data !== "none") return redirect({ href: next.data, locale: await getLocale() });
  return result;
}
