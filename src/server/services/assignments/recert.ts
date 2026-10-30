import { and, eq, inArray, sql } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { assignments, users } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { logger } from "@/server/logger";
import { recertCutoff } from "@/server/state/recert";
import { notify, usersWithRole } from "../notifications";
import { getSettings } from "../settings";
import { createAssignment, currentPlanModuleIds, OPEN_STATUSES } from "./engine";

/**
 * Otomatik tekrar eğitimi (SPEC 3.3, FG-7.3, iş paketi 2.5, kararlar #164–168). `training.daily` işi çağırır.
 *  - Her kişinin her modüldeki son (devredilmemiş) tamamlanışı, bitişine `recert.lead_days` kalınca adaydır.
 *  - Yalnızca kişinin şu anki planında ya da ortak modüllerinde olan modüller; aynı tamamlanış bir kez yenilenir.
 *  - Açık ataması olan kişide ertelenir; İK'ya kişi başına bir kez bildirim gider.
 *  - Eski personel (iş paketi 3.2, kararlar #222–224): sistem dışı son eğitim tarihi (`prior_trainings`, kişi × modülde en son
 *    girilen) süreli teorik modülde tamamlanış gibi sayılır. Periyodik eğitimden ya da bu tarihten doğan yenileme yine
 *    "periyodik" atamadır (işe başlama onayı istemez).
 */

export type DueRenewal = {
  instanceId: string | null;
  priorId: string | null;
  userId: string;
  moduleId: string;
  expiresAt: Date;
  /** Kaynak periyodik eğitim ya da sistem dışı tarih mi (yenileme de periyodik olur) */
  periodic: boolean;
};

/** Tekrar eğitimine girmesi gereken tamamlanışlar ve son eğitim tarihleri (henüz yenilenmemiş). */
export async function dueRenewals(cutoff: Date): Promise<DueRenewal[]> {
  const { "org.timezone": tz } = await getSettings(["org.timezone"]);
  const rows = await db().execute<{
    instance_id: string | null;
    prior_id: string | null;
    user_id: string;
    module_id: string;
    expires_at: string;
    periodic: boolean;
  }>(sql`
    with latest as (
      select distinct on (a.user_id, am.module_id) am.id, a.user_id, am.module_id, am.expires_at, a.reason
      from assignment_modules am
      join assignments a on a.id = am.assignment_id
      where am.status = 'completed' and am.completed_via is distinct from 'carried_over'
      order by a.user_id, am.module_id, am.completed_at desc
    ),
    prior as (
      select distinct on (pt.user_id, pt.module_id) pt.id, pt.user_id, pt.module_id,
        ((pt.completed_on + make_interval(months => m.validity_months))::timestamp at time zone ${tz}) as expires_at
      from prior_trainings pt
      join modules m on m.id = pt.module_id and m.kind = 'theory' and m.validity_months is not null and m.archived_at is null
      order by pt.user_id, pt.module_id, pt.created_at desc
    )
    select l.id as instance_id, null::uuid as prior_id, l.user_id, l.module_id, l.expires_at, (l.reason = 'periodic') as periodic
    from latest l
    join personnel p on p.user_id = l.user_id and p.status = 'active' and p.position_id is not null
    where l.expires_at is not null
      and l.expires_at <= ${cutoff.toISOString()}::timestamptz
      and not exists (select 1 from assignment_modules r where r.renews_id = l.id)
    union all
    select null::uuid, pr.id, pr.user_id, pr.module_id, pr.expires_at, true
    from prior pr
    join personnel p on p.user_id = pr.user_id and p.status = 'active' and p.position_id is not null
    where pr.expires_at <= ${cutoff.toISOString()}::timestamptz
      and not exists (select 1 from assignment_modules r where r.renews_prior_id = pr.id)
      -- Sistemde bu modülü (başka yoldan) almış ya da şu an alıyorsa sistem kaydı geçerlidir
      and not exists (
        select 1 from assignment_modules am join assignments a on a.id = am.assignment_id
        where a.user_id = pr.user_id and am.module_id = pr.module_id and a.status <> 'cancelled'
      )
    order by 3`);
  return rows.map((r) => ({
    instanceId: r.instance_id,
    priorId: r.prior_id,
    userId: r.user_id,
    moduleId: r.module_id,
    expiresAt: new Date(r.expires_at),
    periodic: r.periodic,
  }));
}

export async function runRecert(actor: Actor, now: Date = new Date()): Promise<{ created: number; deferred: number }> {
  const { "recert.lead_days": lead } = await getSettings(["recert.lead_days"]);
  const due = await dueRenewals(recertCutoff(now, lead));
  const byUser = new Map<string, DueRenewal[]>();
  for (const d of due) byUser.set(d.userId, [...(byUser.get(d.userId) ?? []), d]);
  let created = 0;
  let deferred = 0;
  for (const [userId, items] of byUser) {
    try {
      const r = await withActor(actor, async (tx) => {
        const inPlan = await currentPlanModuleIds(tx, userId);
        const relevant = items.filter((i) => inPlan.has(i.moduleId));
        if (relevant.length === 0) return "skip" as const;
        const [open] = await tx
          .select({ id: assignments.id })
          .from(assignments)
          .where(and(eq(assignments.userId, userId), inArray(assignments.status, [...OPEN_STATUSES])))
          .limit(1);
        if (open) {
          // Karar #167: açık atama kapanınca açılır; İK'ya kişi başına bir kez
          const [u] = await tx.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
          await notify(tx, {
            kind: "recert_deferred",
            userIds: await usersWithRole(tx, "hr"),
            subjectKey: `recert_deferred:${open.id}`,
            link: "/manage/team",
            params: { name: u?.name ?? "" },
            exclude: [userId],
            once: true,
          });
          return "deferred" as const;
        }
        const renew = new Map(relevant.map((i) => [i.moduleId, { instanceId: i.instanceId, priorId: i.priorId, expiresAt: i.expiresAt }]));
        // Eski personelin süreli teorik eğitimleri periyodik kalır (karar #224)
        const reason = relevant.every((i) => i.periodic) ? ("periodic" as const) : ("recertification" as const);
        const id = await createAssignment(tx, { userId, reason, createdBy: null, renew });
        return id ? ("created" as const) : ("skip" as const);
      });
      if (r === "created") created++;
      if (r === "deferred") deferred++;
    } catch (err) {
      logger.error({ err, userId }, "Tekrar eğitimi açılamadı");
    }
  }
  return { created, deferred };
}

