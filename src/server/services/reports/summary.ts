import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertUser, can, hasAnyRole } from "@/server/authz/policy";
import { orgScopeFor } from "@/server/authz/scope";
import { db } from "@/server/db/client";
import { notifications } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { addDays, hourIn, todayIn } from "@/lib/dates";
import {
  addMonths,
  daysBetween,
  EXPIRING_WINDOWS,
  monthlySummaryDue,
  monthRange,
  monthsEnding,
  passRate,
  summarize,
  trendEndMonth,
} from "@/server/state/reports";
import { notify, usersWithRole } from "../notifications";
import { getSettings } from "../settings";
import { parseFilters, rawUnitCondition, unitOptions, validitySource, type ReportFilters } from "./index";

/**
 * Yönetim özeti (iş paketi 3.5, kararlar #237–242): seçilen dönem ve birim için temel göstergeler ve son 12 ayın eğilimi.
 * Yalnızca sayılar; kişi adı yoktur. İK ve üst yönetici bütün tesisi, bölüm sorumlusu kapsamındaki birimleri görür;
 * yalnızca İSG uzmanı olan İSG göstergelerini (bütün tesis) görür. Aylık özet e-postası aynı hesabı kullanır.
 */

export type SummaryMode = "full" | "ohs";

/** Eğilim grafiğindeki ay sayısı. */
export const TREND_MONTHS = 12;

export type TrendPoint = { month: string; completed: number; attempts: number; passed: number; rate: number | null; partial: boolean };

export type ManagementSummary = {
  mode: SummaryMode;
  filters: ReportFilters;
  today: string;
  /** Bugün itibarıyla (yalnızca tam görünüm). */
  current: { activeTrainees: number; awaitingReadiness: number; overdue: number } | null;
  /** Seçilen dönemde (yalnızca tam görünüm). */
  period: { readinessApproved: number; onboarding: { count: number; avg: number | null; median: number | null }; modulesCompleted: number } | null;
  /** Teorik sınavda ilk deneme (İSG görünümünde yalnızca İSG modülleri). */
  exams: { attempts: number; passed: number; rate: number | null };
  /** İSG eğitimi geçerliliği bugün itibarıyla (kişi sayısı) ve dönemde tamamlanan İSG eğitimi. */
  ohs: { expired: number; oldestExpired: string | null; expiring: { days: number; count: number }[]; completed: number };
  trend: TrendPoint[];
};

export function canViewSummary(actor: Actor): boolean {
  return actor.kind === "user" && can(actor, "reports.summary");
}

/** İK, üst yönetici ve bölüm sorumlusu tam görünüm; yalnızca İSG uzmanı olan İSG görünümü (karar #238). */
export function summaryMode(actor: Actor): SummaryMode {
  return hasAnyRole(actor, ["hr", "section_manager"]) ? "full" : "ohs";
}

/** Dönem ve birim süzgeci; varsayılan son 90 gün (diğer raporlarla aynı). Pozisyon süzgeci yoktur. */
export async function parseSummaryFilters(input: { from?: string | null; to?: string | null; orgUnitId?: string | null }): Promise<ReportFilters> {
  const f = await parseFilters("training", { from: input.from, to: input.to, orgUnitId: input.orgUnitId });
  return { ...f, positionId: null };
}

/** Birim seçenekleri: tam görünümde kapsam, İSG görünümünde bütün birimler. */
export async function summaryUnitOptions(actor: Actor) {
  assertUser(actor);
  assertCan(actor, "reports.summary");
  return unitOptions(summaryMode(actor) === "ohs" ? { all: true } : await orgScopeFor(actor));
}

export async function managementSummary(actor: Actor, filters: ReportFilters, now: Date = new Date()): Promise<ManagementSummary> {
  assertUser(actor);
  assertCan(actor, "reports.summary");
  return computeSummary(actor, summaryMode(actor), filters, now);
}

/**
 * Göstergeler. Eğitim, sınav ve tamamlanma kayıttaki pozisyonun birimine göre (Faz 1 raporlarıyla aynı); İSG geçerliliği
 * kişinin bugünkü pozisyonuna göre (süresi dolacaklar raporuyla aynı). İSG göstergeleri İSG uzmanı için bütün tesis.
 */
async function computeSummary(actor: Actor, mode: SummaryMode, filters: ReportFilters, now: Date): Promise<ManagementSummary> {
  const { "org.timezone": tz } = await getSettings(["org.timezone"]);
  const f = { ...filters, positionId: null };
  const today = todayIn(tz, now);
  const full = mode === "full";
  const general = await rawUnitCondition(actor, f);
  const ohsScope = await rawUnitCondition(actor, f, { ohsAll: true });
  // İSG görünümünde sınav ve eğilim yalnızca İSG modüllerinden
  const scope = full ? general : ohsScope;
  const onlyOhs = full ? sql`` : sql`and am.is_ohs`;
  const day = (date: string) => sql`(${date}::date)::timestamp at time zone ${tz}`;
  const inPeriod = (col: SQL) => sql`${col} >= ${day(f.from)} and ${col} < ${day(addDays(f.to, 1))}`;
  const completedModule = sql`am.status = 'completed' and am.completed_via is distinct from 'carried_over'`;
  const fromAssignment = sql`from assignment_modules am join assignments a on a.id = am.assignment_id join positions pos on pos.id = a.position_id`;

  let current: ManagementSummary["current"] = null;
  let period: ManagementSummary["period"] = null;
  if (full) {
    const [c] = await db().execute<{ active: number; awaiting: number; overdue: number }>(sql`
      select
        count(*) filter (where a.status in ('active', 'awaiting_decision'))::int as active,
        count(*) filter (where a.status = 'awaiting_readiness')::int as awaiting,
        count(*) filter (where a.status in ('active', 'awaiting_decision') and a.target_date < ${today}::date)::int as overdue
      from assignments a join positions pos on pos.id = a.position_id
      where a.status in ('active', 'awaiting_readiness', 'awaiting_decision') and ${general}`);
    current = { activeTrainees: c!.active, awaitingReadiness: c!.awaiting, overdue: c!.overdue };

    const [p] = await db().execute<{ approved: number; completed: number }>(sql`
      select
        (select count(*)::int from readiness_decisions rd
           join assignments a on a.id = rd.assignment_id join positions pos on pos.id = a.position_id
           where rd.decision = 'approved' and ${inPeriod(sql`rd.decided_at`)} and ${general}) as approved,
        (select count(*)::int ${fromAssignment} where ${completedModule} and ${inPeriod(sql`am.completed_at`)} and ${general}) as completed`);
    // İşe başlama süresi: yeni personelde işe girişten onaya (işe başlama süresi raporuyla aynı)
    const days = await db().execute<{ start: string; approved: string }>(sql`
      select coalesce(p.hire_date, a.start_date)::text as start, to_char(rd.decided_at at time zone ${tz}, 'YYYY-MM-DD') as approved
      from readiness_decisions rd
      join assignments a on a.id = rd.assignment_id
      join personnel p on p.user_id = a.user_id
      join positions pos on pos.id = a.position_id
      where rd.decision = 'approved' and a.reason = 'new_hire' and ${inPeriod(sql`rd.decided_at`)} and ${general}`);
    const s = summarize(days.map((r) => daysBetween(r.start, r.approved)));
    period = { readinessApproved: p!.approved, onboarding: { count: s.count, avg: s.avg, median: s.median }, modulesCompleted: p!.completed };
  }

  const [e] = await db().execute<{ attempts: number; passed: number }>(sql`
    select count(*)::int as attempts, count(*) filter (where ea.passed)::int as passed
    from exam_attempts ea
    join assignment_modules am on am.id = ea.assignment_module_id
    join assignments a on a.id = am.assignment_id
    join positions pos on pos.id = a.position_id
    where ea.attempt_no = 1 and ea.submitted_at is not null and ${inPeriod(sql`ea.submitted_at`)} and ${scope} ${onlyOhs}`);

  // Süresi dolmuş: bitiş günü dünden önce ya da dün; N gün içinde: bugün ile bugün + N arası (rapor bağlantılarıyla aynı)
  const startToday = day(today);
  const windows = sql.join(
    EXPIRING_WINDOWS.map(
      (d) => sql`count(distinct v.user_id) filter (where v.expires_at >= ${startToday} and v.expires_at < ${day(addDays(today, d + 1))})::int as ${sql.identifier(`d${d}`)}`,
    ),
    sql`, `,
  );
  const [o] = await db().execute<Record<string, number | string | null>>(sql`
    select
      count(distinct v.user_id) filter (where v.expires_at < ${startToday})::int as expired,
      to_char(min(v.expires_at) filter (where v.expires_at < ${startToday}) at time zone ${tz}, 'YYYY-MM-DD') as oldest,
      ${windows}
    from (${validitySource(tz)}) v
    join personnel p on p.user_id = v.user_id and p.status = 'active'
    join positions pos on pos.id = p.position_id
    where v.is_ohs and ${ohsScope}`);
  const [oc] = await db().execute<{ n: number }>(sql`
    select count(*)::int as n ${fromAssignment}
    where am.is_ohs and ${completedModule} and ${inPeriod(sql`am.completed_at`)} and ${ohsScope}`);

  // Eğilim: dönemin bitiş ayıyla biten 12 ay (bu ay henüz bitmediyse işaretlenir)
  const end = trendEndMonth(f.to, today);
  const months = monthsEnding(end, TREND_MONTHS);
  const trendFrom = day(`${months[0]}-01`);
  const trendTo = day(`${addMonths(end, 1)}-01`);
  const monthOf = (col: SQL) => sql`to_char(${col} at time zone ${tz}, 'YYYY-MM')`;
  const completedByMonth = await db().execute<{ month: string; n: number }>(sql`
    select ${monthOf(sql`am.completed_at`)} as month, count(*)::int as n ${fromAssignment}
    where ${completedModule} and am.completed_at >= ${trendFrom} and am.completed_at < ${trendTo} and ${scope} ${onlyOhs}
    group by 1`);
  const examsByMonth = await db().execute<{ month: string; attempts: number; passed: number }>(sql`
    select ${monthOf(sql`ea.submitted_at`)} as month, count(*)::int as attempts, count(*) filter (where ea.passed)::int as passed
    from exam_attempts ea
    join assignment_modules am on am.id = ea.assignment_module_id
    join assignments a on a.id = am.assignment_id
    join positions pos on pos.id = a.position_id
    where ea.attempt_no = 1 and ea.submitted_at >= ${trendFrom} and ea.submitted_at < ${trendTo} and ${scope} ${onlyOhs}
    group by 1`);
  const completed = new Map(completedByMonth.map((r) => [r.month, r.n]));
  const exams = new Map(examsByMonth.map((r) => [r.month, r]));

  return {
    mode,
    filters: f,
    today,
    current,
    period,
    exams: { attempts: e!.attempts, passed: e!.passed, rate: passRate(e!.passed, e!.attempts) },
    ohs: {
      expired: Number(o!.expired),
      oldestExpired: (o!.oldest as string | null) ?? null,
      expiring: EXPIRING_WINDOWS.map((d) => ({ days: d, count: Number(o![`d${d}`]) })),
      completed: oc!.n,
    },
    trend: months.map((month) => {
      const x = exams.get(month);
      return {
        month,
        completed: completed.get(month) ?? 0,
        attempts: x?.attempts ?? 0,
        passed: x?.passed ?? 0,
        rate: passRate(x?.passed ?? 0, x?.attempts ?? 0),
        partial: month === today.slice(0, 7),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Aylık özet e-postası (karar #241–242)
// ---------------------------------------------------------------------------

/** Bildirim parametreleri: yalnızca sayılar. Ay adı alıcının dilinde mesajda seçilir (`monthNo`). */
export function monthlySummaryParams(s: ManagementSummary, month: string): Record<string, string | number> {
  return {
    year: month.slice(0, 4),
    monthNo: +month.slice(5, 7),
    completed: s.period?.modulesCompleted ?? 0,
    approved: s.period?.readinessApproved ?? 0,
    avgDays: s.period?.onboarding.avg ?? "none",
    passRate: s.exams.rate ?? "none",
    active: s.current?.activeTrainees ?? 0,
    overdue: s.current?.overdue ?? 0,
    ohsExpired: s.ohs.expired,
    ohsDays: s.ohs.expiring[0]!.days,
    ohsExpiring: s.ohs.expiring[0]!.count,
  };
}

/**
 * İK ve üst yöneticilere önceki ayın özeti (bütün tesis). İş her saat çalışır; ayarlanan gün ve saatte gönderir, aynı ay
 * için ikinci kez göndermez. E-postası olmayan alıcı yalnızca uygulama içi bildirim alır.
 */
export async function sendMonthlySummary(actor: Actor, now: Date = new Date()): Promise<number> {
  const s = await getSettings(["org.timezone", "reports.monthly_summary_enabled", "reports.monthly_summary_day", "reports.monthly_summary_hour"]);
  if (!s["reports.monthly_summary_enabled"]) return 0;
  const tz = s["org.timezone"];
  const today = todayIn(tz, now);
  if (!monthlySummaryDue(today, hourIn(tz, now), { day: s["reports.monthly_summary_day"], hour: s["reports.monthly_summary_hour"] })) return 0;
  const month = addMonths(today.slice(0, 7), -1);
  const subjectKey = `monthly_summary:${month}`;
  const recipients = [...new Set([...(await usersWithRole(db(), "hr")), ...(await usersWithRole(db(), "owner"))])];
  if (recipients.length === 0) return 0;
  // Aynı gün sonraki saatlerde hesap tekrarlanmasın: herkes almışsa çık
  const sent = await db()
    .select({ userId: notifications.userId })
    .from(notifications)
    .where(and(eq(notifications.kind, "monthly_summary"), eq(notifications.subjectKey, subjectKey), inArray(notifications.userId, recipients)));
  const pending = recipients.filter((id) => !sent.some((r) => r.userId === id));
  if (pending.length === 0) return 0;
  const { from, to } = monthRange(month);
  const summary = await computeSummary(actor, "full", { from, to, orgUnitId: null, positionId: null }, now);
  await withActor(actor, (tx) =>
    notify(tx, {
      kind: "monthly_summary",
      userIds: pending,
      subjectKey,
      link: `/reports/summary?from=${from}&to=${to}`,
      params: monthlySummaryParams(summary, month),
      once: true,
    }),
  );
  return pending.length;
}
