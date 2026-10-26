import "server-only";
import type { UserActor } from "@/server/authz/actor";
import { can } from "@/server/authz/policy";
import { getSectionUser } from "@/server/auth/current-user";
import { toActor, type SessionUser } from "@/server/services/auth";

/** Soru bankası sayfaları: bölüm sorumlusu, İSG uzmanı ve İK (okuma). Eğitmen göremez. */
export async function questionsAccess(): Promise<{ user: SessionUser; actor: UserActor } | null> {
  const user = await getSectionUser("manage");
  if (!user) return null;
  const actor = toActor(user);
  return can(actor, "questions.view") ? { user, actor } : null;
}
