import "server-only";
import type { UserActor } from "@/server/authz/actor";
import { getSectionUser } from "@/server/auth/current-user";
import { toActor } from "@/server/services/auth";
import { isLegalKind, manageableKinds, type LegalKind } from "@/server/services/legal";

/**
 * Hukuki metin sayfalarına erişim: kişinin yönetebildiği türler (İK: KVKK metinleri, İSG: ziyaretçi kuralları).
 * İstenen tür yetkisi dışındaysa null (404 görünümü). Asıl kontrol serviste.
 */
export async function legalAccess(requested?: string): Promise<{ actor: UserActor; kind: LegalKind; kinds: LegalKind[] } | null> {
  const user = await getSectionUser("admin");
  if (!user) return null;
  const actor = toActor(user);
  const kinds = manageableKinds(actor);
  if (kinds.length === 0) return null;
  if (requested === undefined) return { actor, kind: kinds[0]!, kinds };
  if (!isLegalKind(requested) || !kinds.includes(requested)) return null;
  return { actor, kind: requested, kinds };
}
