import "server-only";
import type { UserActor } from "@/server/authz/actor";
import { can, type Permission } from "@/server/authz/policy";
import { getSectionUser } from "@/server/auth/current-user";
import { NotFoundError } from "@/server/errors";
import { toActor, type SessionUser } from "@/server/services/auth";

/**
 * Yönetim sayfası erişimi: "Sistem" bölümünü görebilen ve verilen yetkiye sahip kullanıcı.
 * Yetkisizse null döner; sayfa <NotFoundView /> gösterir. Asıl kontrol yine serviste yapılır.
 */
export async function adminAccess(permission: Permission): Promise<{ user: SessionUser; actor: UserActor } | null> {
  const user = await getSectionUser("admin");
  if (!user) return null;
  const actor = toActor(user);
  return can(actor, permission) ? { user, actor } : null;
}

/** Servis NotFoundError fırlatırsa null döner (sayfa 404 görünümü gösterir). */
export async function orNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}
