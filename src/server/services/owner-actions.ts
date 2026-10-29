import { and, eq, gte, inArray } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { actsAsOwner, type Permission } from "@/server/authz/policy";
import type { Tx } from "@/server/db/client";
import { approvals, ownerActions } from "@/server/db/schema";
import { ValidationError } from "@/server/errors";

/**
 * Üst yöneticinin kendi rolü olmadan yaptığı mesleki işlemi kaydeder (karar #196): İSG onayı, pratik sınav imzası,
 * işe başlama ve süreç kararı. Kişinin bu işlemi yapan kendi rolü varsa kayıt yazılmaz.
 */
export async function recordOwnerAction(
  tx: Tx,
  actor: Actor,
  permission: Permission,
  subject: { type: string; id: string },
): Promise<void> {
  if (actor.kind !== "user" || !actsAsOwner(actor, permission)) return;
  await tx.insert(ownerActions).values({ actorId: actor.userId, permission, subjectType: subject.type, subjectId: subject.id });
}

/**
 * İki adımlı onayda dört göz (karar #195): birinci adımı (bölüm onayı, kendi onayı dahil) veren kişi aynı gönderimin
 * ikinci adımını (İSG onayı) veremez. `since` = son gönderim zamanı (önceki turların onayları sayılmaz).
 */
export async function assertDifferentApprover(
  tx: Tx,
  actor: Actor,
  subject: { type: "content_version" | "position_card_version"; id: string; since: Date | null },
): Promise<void> {
  if (actor.kind !== "user") return;
  const rows = await tx
    .select({ id: approvals.id })
    .from(approvals)
    .where(
      and(
        eq(approvals.subjectType, subject.type),
        eq(approvals.subjectId, subject.id),
        eq(approvals.step, "section"),
        inArray(approvals.decision, ["approved", "auto_self"]),
        eq(approvals.decidedBy, actor.userId),
        ...(subject.since ? [gte(approvals.decidedAt, subject.since)] : []),
      ),
    )
    .limit(1);
  if (rows.length > 0) throw new ValidationError("same_approver");
}
