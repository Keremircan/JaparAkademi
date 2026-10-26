import "server-only";
import type { UserActor } from "@/server/authz/actor";
import { getSectionUser } from "@/server/auth/current-user";
import { toActor, type SessionUser } from "@/server/services/auth";
import { canUseLibrary } from "@/server/services/content/access";

/**
 * İçerik kütüphanesi sayfalarına erişim: "Yönetim" bölümünü gören ve kütüphaneyi kullanabilen kişi
 * (eğitmen, bölüm sorumlusu, İSG uzmanı, İK). Asıl yetki ve kapsam kontrolü serviste yapılır.
 */
export async function libraryAccess(): Promise<{ user: SessionUser; actor: UserActor } | null> {
  const user = await getSectionUser("manage");
  if (!user) return null;
  const actor = toActor(user);
  return canUseLibrary(actor) ? { user, actor } : null;
}
