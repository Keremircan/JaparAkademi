"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { APP_LOCALES } from "@/lib/locale";
import { actionUser, runAction, type ActionResult } from "@/features/shared/action-result";
import { getRequestMeta, setLocaleCookie } from "@/server/auth/request";
import { setPreferredLocale } from "@/server/services/auth";
import { decideExplicitConsent, removeProfilePhoto, setProfilePhoto, updateOwnPhone } from "@/server/services/profile";

const localeSchema = z.enum(APP_LOCALES);

/** Profilde dil tercihi (karar #207): hesaba ve çereze yazılır, profil yeni dilde açılır. */
export async function setLocaleAction(formData: FormData): Promise<void> {
  const parsed = localeSchema.safeParse(formData.get("locale"));
  const { user } = await actionUser();
  if (!parsed.success) return redirect({ href: "/profile", locale: user.locale });
  await setPreferredLocale(user, parsed.data);
  await setLocaleCookie(parsed.data);
  redirect({ href: "/profile", locale: parsed.data });
}

// ---- Detaylı profil ve açık rıza (iş paketi 3.4) ----

const uuid = z.uuid();
const phoneSchema = z.string().max(40);

/** Kişi kendi telefonunu değiştirir. */
export async function updatePhoneAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = phoneSchema.safeParse(formData.get("phone") ?? "");
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => updateOwnPhone(actor, parsed.data));
  if (result.ok) refresh();
  return result;
}

/** Fotoğraf bağlama: kişi kendi fotoğrafını ya da İK bir personelin fotoğrafını (`userId`). */
export async function setPhotoAction(userId: string | null, assetId: string): Promise<ActionResult> {
  if ((userId !== null && !uuid.safeParse(userId).success) || !uuid.safeParse(assetId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => setProfilePhoto(actor, userId ?? actor.userId, assetId));
  if (result.ok) refresh();
  return result;
}

export async function removePhotoAction(userId: string | null): Promise<ActionResult> {
  if (userId !== null && !uuid.safeParse(userId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => removeProfilePhoto(actor, userId ?? actor.userId));
  if (result.ok) refresh();
  return result;
}

/** Profilde açık rıza verme / geri alma. */
export async function decideConsentAction(legalTextId: string, granted: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(legalTextId).success || typeof granted !== "boolean") return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const meta = await getRequestMeta();
  const result = await runAction(() => decideExplicitConsent(actor, { legalTextId, granted, source: "profile" }, meta));
  if (result.ok) refresh();
  return result;
}
