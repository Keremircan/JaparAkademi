"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, runAction, type ActionResult } from "@/features/shared/action-result";
import { redirect } from "@/i18n/navigation";
import { markAllRead, openNotification } from "@/server/services/notifications";

/** Bildirimi okundu işaretler ve ilgili ekrana gider (yetki o ekranda yeniden kontrol edilir). */
export async function openNotificationAction(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => openNotification(actor, id));
  if (!result.ok) return result;
  // Yalnızca uygulama içi yol (açık yönlendirme yok)
  const link = result.data.link.startsWith("/") && !result.data.link.startsWith("//") ? result.data.link : "/";
  return redirect({ href: link, locale: await getLocale() });
}

export async function markAllReadAction(): Promise<ActionResult> {
  const { actor } = await actionUser();
  const result = await runAction(() => markAllRead(actor));
  if (result.ok) refresh();
  return result;
}
