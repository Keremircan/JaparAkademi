import { ShieldAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { Actor } from "@/server/authz/actor";
import { actsAsOwner, type Permission } from "@/server/authz/policy";
import type { Role } from "@/server/authz/roles";

/**
 * Üst yönetici bu ekrandaki mesleki işlemi kendi rolü olmadan yapacaksa uyarı (karar #196).
 * İşlem yapılınca `owner_actions` kaydı servis tarafında yazılır.
 */
export async function OwnerActingNotice({ actor, permission, role }: { actor: Actor; permission: Permission; role: Role }) {
  if (!actsAsOwner(actor, permission)) return null;
  const t = await getTranslations();
  return (
    <p role="note" className="flex items-start gap-3 rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
      <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      {t("owner.actingNotice", { role: t(`roles.${role}`) })}
    </p>
  );
}
