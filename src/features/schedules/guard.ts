import "server-only";
import type { UserActor } from "@/server/authz/actor";
import { can } from "@/server/authz/policy";
import { getSectionUser } from "@/server/auth/current-user";
import { toActor, type SessionUser } from "@/server/services/auth";

/** Çalışma programı yönetimi (İK; üst yönetici de): yetkisizse null, sayfa <NotFoundView /> gösterir. Asıl kontrol serviste. */
export async function schedulesAccess(): Promise<{ user: SessionUser; actor: UserActor } | null> {
  const user = await getSectionUser("manage");
  if (!user) return null;
  const actor = toActor(user);
  return can(actor, "schedules.manage") ? { user, actor } : null;
}
