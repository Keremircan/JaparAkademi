import "server-only";
import type { UserActor } from "@/server/authz/actor";
import { can, type Permission } from "@/server/authz/policy";
import { getSectionUser } from "@/server/auth/current-user";
import { toActor, type SessionUser } from "@/server/services/auth";

/**
 * Güvenlik bölümü sayfaları (iş paketi 2.2): bölümü görebilen (güvenlik, İSG) ve verilen yetkiye sahip kullanıcı.
 * Yetkisizse null; sayfa <NotFoundView /> gösterir. Asıl kontrol serviste.
 */
export async function securityAccess(permission: Permission): Promise<{ user: SessionUser; actor: UserActor } | null> {
  const user = await getSectionUser("security");
  if (!user) return null;
  const actor = toActor(user);
  return can(actor, permission) ? { user, actor } : null;
}
