"use server";

import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { APP_LOCALES } from "@/lib/locale";
import { actionUser } from "@/features/shared/action-result";
import { setLocaleCookie } from "@/server/auth/request";
import { setPreferredLocale } from "@/server/services/auth";

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
