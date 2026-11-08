import { and, eq, gt, inArray, isNotNull, or, sql } from "drizzle-orm";
import { assertCan } from "@/server/authz/policy";
import { assignmentItems, assignmentModules, assignments, personnel } from "@/server/db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { countRows, type Deletable } from "./deletion/core";
import { resetBlockFor } from "./invitations";
import { deleteScheduleDataOf } from "./schedules";

type PersonRow = { userId: string };

/**
 * Geçmişi olmayan personeli silme (iş paketi 3.14, karar #285). İK (`people.manage`) yanlış açılmış ya da yanlış
 * aktarılmış hesabı siler: kişinin hiç eğitim ilerlemesi, sınavı, onayı, KVKK onayı, imzası ya da başka bir geçmiş
 * kaydı yoksa. Dokunulmamış atamalar (hesap açılınca kendiliğinden oluşur) kişiyle birlikte silinir; geri kalanını
 * `app_delete_people` yapar (`drizzle/0060`). Geçmişi olan kişi işten ayrıldı yapılır ve üst yönetici kalıcı siler
 * (anonimleştirme, kararlar #264–267); anonimleştirilen kişi hiçbir listede görünmez (karar #285).
 */
export const personDeletion: Deletable<PersonRow> = {
  async load(tx, actor, id) {
    assertCan(actor, "people.manage");
    if (actor.userId === id) throw new ValidationError("self_delete");
    const [p] = await tx
      .select({ userId: personnel.userId, anonymizedAt: personnel.anonymizedAt })
      .from(personnel)
      .where(eq(personnel.userId, id))
      .limit(1)
      .for("update");
    if (!p || p.anonymizedAt) throw new NotFoundError("person");
    // Üst yöneticiyi yalnızca üst yönetici, sistem yöneticisini İK silemez (şifre sıfırlamadaki kural)
    const block = await resetBlockFor(actor, id, tx);
    if (block) throw new ForbiddenError(block);
    return { userId: p.userId };
  },
  async inHistory(tx, p) {
    // Eğitime başlanmışsa (adım açıldı, okundu, modül başladı ya da tamamlandı) geçmiştir
    const mine = tx.select({ id: assignments.id }).from(assignments).where(eq(assignments.userId, p.userId));
    const startedModules = await countRows(
      tx,
      assignmentModules,
      and(
        inArray(assignmentModules.assignmentId, mine),
        or(isNotNull(assignmentModules.startedAt), isNotNull(assignmentModules.completedAt), isNotNull(assignmentModules.completedVia)),
      ),
    );
    if (startedModules > 0) return true;
    const myModules = tx.select({ id: assignmentModules.id }).from(assignmentModules).where(inArray(assignmentModules.assignmentId, mine));
    const startedItems = await countRows(
      tx,
      assignmentItems,
      and(
        inArray(assignmentItems.assignmentModuleId, myModules),
        or(
          isNotNull(assignmentItems.startedAt),
          isNotNull(assignmentItems.reachedEndAt),
          isNotNull(assignmentItems.acknowledgedAt),
          gt(assignmentItems.progressRatio, 0),
        ),
      ),
    );
    return startedItems > 0;
  },
  async remove(tx, p) {
    const mine = tx.select({ id: assignments.id }).from(assignments).where(eq(assignments.userId, p.userId));
    const myModules = tx.select({ id: assignmentModules.id }).from(assignmentModules).where(inArray(assignmentModules.assignmentId, mine));
    await tx.delete(assignmentItems).where(inArray(assignmentItems.assignmentModuleId, myModules));
    await tx.delete(assignmentModules).where(inArray(assignmentModules.assignmentId, mine));
    await tx.delete(assignments).where(eq(assignments.userId, p.userId));
    await deleteScheduleDataOf(tx, [p.userId]);
    const rows = await tx.execute<{ id: string }>(sql`select app_delete_people(array[${p.userId}]::uuid[]) as id`);
    if (rows.length === 0) throw new NotFoundError("person");
  },
};
