import { sql } from "drizzle-orm";
import type { Actor, UserActor } from "@/server/authz/actor";
import { orgScopeFor } from "@/server/authz/scope";
import { db } from "@/server/db/client";
import { withActor } from "@/server/db/with-actor";
import { addDays, todayIn } from "@/lib/dates";
import { logger } from "@/server/logger";
import { notify, sectionManagersForPerson, usersWithRole } from "../notifications";
import { getSettings } from "../settings";
import { runRecert } from "./recert";
import { notifyCompetencyExpiring } from "../competencies";

/**
 * Faz 2 zamanlanmış eğitim bildirimleri (SPEC 10.2, iş paketi 2.5, kararlar #172–173).
 *  - `training.daily` (her gün 06:00): tekrar eğitimi, hedefi geçen eğitim, işaretlenmeyen pratik görev, süresi dolan İSG eğitimi
 *  - `training.weekly` (Pazartesi 08:00): bölüm sorumlularına haftalık özet
 * Bildirimler yalnızca haber verir; hiçbir atama otomatik kapatılmaz (karar insanda).
 */

/** Her kişinin her modüldeki son (devredilmemiş) tamamlanışı. */
const LATEST = sql`
  select distinct on (a.user_id, am.module_id) am.id, a.user_id, am.module_id, am.expires_at, am.is_ohs
  from assignment_modules am
  join assignments a on a.id = am.assignment_id
  where am.status = 'completed' and am.completed_via is distinct from 'carried_over'
  order by a.user_id, am.module_id, am.completed_at desc`;

/** Hedef tarihi geçen eğitim: kapsamdaki bölüm sorumlularına atama başına bir kez. */
export async function notifyOverdue(actor: Actor, today: string): Promise<number> {
  const rows = await db().execute<{ id: string; user_id: string; name: string }>(sql`
    select a.id, a.user_id, u.name from assignments a join users u on u.id = a.user_id
    where a.status = 'active' and a.target_date is not null and a.target_date < ${today}::date`);
  if (rows.length === 0) return 0;
  await withActor(actor, async (tx) => {
    for (const r of rows) {
      await notify(tx, {
        kind: "training_overdue",
        userIds: await sectionManagersForPerson(tx, r.user_id),
        subjectKey: `overdue:${r.id}`,
        link: "/manage/team",
        params: { name: r.name },
        exclude: [r.user_id],
        once: true,
      });
    }
  });
  return rows.length;
}

/**
 * İşaretlenmeyen pratik görev: son işaretlemenin (yoksa modülün açılışının) üzerinden `trainer.unmarked_alert_days`
 * geçtiyse eğitmene. Aynı bekleme dönemi için bir kez; eğitmen işaretleyince kapanır.
 */
export async function notifyUnmarked(actor: Actor, now: Date): Promise<number> {
  const { "trainer.unmarked_alert_days": days } = await getSettings(["trainer.unmarked_alert_days"]);
  const before = new Date(now.getTime() - days * 86_400_000);
  const rows = await db().execute<{ id: string; trainer: string; user_id: string; name: string; last: string }>(sql`
    select x.* from (
      select am.id, a.trainer_user_id as trainer, a.user_id, u.name,
        coalesce((select max(pm.marked_at) from practice_marks pm where pm.assignment_module_id = am.id), am.unlocked_at) as last
      from assignment_modules am
      join assignments a on a.id = am.assignment_id
      join users u on u.id = a.user_id
      where am.kind = 'practice' and am.status in ('available', 'in_progress') and a.status = 'active' and a.trainer_user_id is not null
    ) x where x.last is not null and x.last < ${before.toISOString()}::timestamptz`);
  if (rows.length === 0) return 0;
  await withActor(actor, async (tx) => {
    for (const r of rows) {
      const last = new Date(r.last);
      await notify(tx, {
        kind: "tasks_unmarked",
        userIds: [r.trainer],
        subjectKey: `unmarked:${r.id}:${last.toISOString()}`,
        link: "/trainer",
        params: { name: r.name, days: Math.floor((now.getTime() - last.getTime()) / 86_400_000) },
        exclude: [r.user_id],
        once: true,
      });
    }
  });
  return rows.length;
}

/** Son 24 saatte süresi dolan İSG eğitimleri: İSG uzmanlarına günlük tek özet (isim yok, rapora bağlantı). */
export async function notifyOhsExpired(actor: Actor, now: Date, today: string): Promise<number> {
  const since = new Date(now.getTime() - 86_400_000);
  const [row] = await db().execute<{ n: number }>(sql`
    select count(distinct l.user_id)::int as n from (${LATEST}) l
    join personnel p on p.user_id = l.user_id and p.status = 'active'
    where l.is_ohs and l.expires_at > ${since.toISOString()}::timestamptz and l.expires_at <= ${now.toISOString()}::timestamptz`);
  const count = row?.n ?? 0;
  if (count === 0) return 0;
  await withActor(actor, async (tx) => {
    await notify(tx, {
      kind: "ohs_expired",
      userIds: await usersWithRole(tx, "ohs_specialist"),
      subjectKey: `ohs_expired:${today}`,
      link: `/reports/expiring?from=${addDays(today, -30)}&to=${today}`,
      params: { count },
      once: true,
    });
  });
  return count;
}

/** Adım hata verirse loglanır, diğer adımlar yine çalışır. */
async function step<T>(name: string, fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    logger.error({ err, step: name }, "Günlük eğitim işi adımı başarısız");
    return fallback;
  }
}

export async function runTrainingDaily(actor: Actor, now: Date = new Date()) {
  const { "org.timezone": tz } = await getSettings(["org.timezone"]);
  const today = todayIn(tz, now);
  return {
    recert: await step("recert", { created: 0, deferred: 0 }, () => runRecert(actor, now)),
    overdue: await step("overdue", 0, () => notifyOverdue(actor, today)),
    unmarked: await step("unmarked", 0, () => notifyUnmarked(actor, now)),
    ohsExpired: await step("ohsExpired", 0, () => notifyOhsExpired(actor, now, today)),
    // Süresi yaklaşan yetkinlikler (karar #220)
    competencies: await step("competencies", 0, () => notifyCompetencyExpiring(actor, now)),
  };
}

// ---------------------------------------------------------------------------
// Haftalık özet (Pazartesi 08:00)
// ---------------------------------------------------------------------------

export type TeamCounts = { people: number; active: number; overdue: number; readiness: number; expiring: number; rereads: number };

/** Bölüm sorumlusunun kapsamındaki aktif personelin eğitim durumu (yalnızca sayılar). */
export async function teamCounts(manager: UserActor, now: Date, today: string, expiringDays: number): Promise<TeamCounts> {
  const scope = await orgScopeFor(manager);
  if (!scope.all && scope.orgUnitIds.size === 0) return { people: 0, active: 0, overdue: 0, readiness: 0, expiring: 0, rereads: 0 };
  const unitFilter = scope.all
    ? sql`true`
    : sql`pos.org_unit_id in (${sql.join([...scope.orgUnitIds].map((id) => sql`${id}::uuid`), sql`, `)})`;
  const until = new Date(now.getTime() + expiringDays * 86_400_000);
  const [r] = await db().execute<TeamCounts>(sql`
    with team as (
      select p.user_id from personnel p join positions pos on pos.id = p.position_id
      where p.status = 'active' and ${unitFilter}
    )
    select
      (select count(*)::int from team) as people,
      (select count(*)::int from assignments a where a.user_id in (select user_id from team) and a.status = 'active') as active,
      (select count(*)::int from assignments a where a.user_id in (select user_id from team) and a.status = 'active' and a.target_date < ${today}::date) as overdue,
      (select count(*)::int from assignments a where a.user_id in (select user_id from team) and a.status = 'awaiting_readiness') as readiness,
      (select count(distinct l.user_id)::int from (${LATEST}) l where l.user_id in (select user_id from team)
         and l.expires_at > ${now.toISOString()}::timestamptz and l.expires_at <= ${until.toISOString()}::timestamptz) as expiring,
      (select count(*)::int from reread_tasks rt where rt.user_id in (select user_id from team) and rt.acknowledged_at is null) as rereads`);
  return r!;
}

export async function sendWeeklySummaries(actor: Actor, now: Date = new Date()): Promise<number> {
  const { "org.timezone": tz, "recert.lead_days": days } = await getSettings(["org.timezone", "recert.lead_days"]);
  const today = todayIn(tz, now);
  const managers = await usersWithRole(db(), "section_manager");
  let sent = 0;
  for (const userId of managers) {
    const c = await teamCounts({ kind: "user", userId, roles: ["section_manager"] }, now, today, days);
    if (c.people === 0) continue;
    await withActor(actor, (tx) =>
      notify(tx, {
        kind: "weekly_summary",
        userIds: [userId],
        subjectKey: `weekly:${today}`,
        link: "/manage/team",
        params: { active: c.active, overdue: c.overdue, readiness: c.readiness, expiring: c.expiring, rereads: c.rereads, days },
        once: true,
      }),
    );
    sent++;
  }
  return sent;
}
