import { and, asc, desc, eq, gte, inArray, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertUser, can, hasRole } from "@/server/authz/policy";
import { orgScopeFor } from "@/server/authz/scope";
import { db } from "@/server/db/client";
import {
  assignmentModules,
  assignments,
  examAttemptItems,
  examAttempts,
  orgUnits,
  personnel,
  positions,
  practicalExamResults,
  questions,
  questionVersions,
  readinessDecisions,
  users,
  contractorClearances,
  contractorCompanies,
  visitors,
  visits,
} from "@/server/db/schema";
import { ValidationError } from "@/server/errors";
import { addDays, todayIn } from "@/lib/dates";
import { daysBetween, effectiveHazardClass, minutesToHours, summarize, wrongRate } from "@/server/state/reports";
import { questionViewFilter } from "../questions";
import { getSettings } from "../settings";

/**
 * Faz 1 raporları (SPEC 10.1, karar #91–96). Her rapor yetki ve kapsamla süzülür; bölüm sorumlusu yalnızca kapsamındaki
 * birimlerin pozisyonlarını görür. Sonuç sütun anahtarı + ham değer olarak döner; metinler arayüzde/dışa aktarmada çevrilir.
 */

export const REPORT_KINDS = ["training", "exams", "ohs", "onboarding", "visitors", "contractors"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

const PERMISSION = {
  training: "reports.training",
  exams: "reports.exams",
  ohs: "reports.ohs",
  onboarding: "reports.onboarding",
  visitors: "reports.visitors",
  contractors: "reports.contractors",
} as const;

/** Birim/pozisyon filtresi olan raporlar (ziyaretçi raporlarında yok, karar #162). */
export function hasOrgFilters(kind: ReportKind): boolean {
  return kind !== "visitors" && kind !== "contractors";
}

export type Cell = string | number | boolean | Date | null;
export type ReportTable = { key: string; columns: string[]; rows: Cell[][] };
export type ReportFilters = { from: string; to: string; orgUnitId: string | null; positionId: string | null };
export type ReportResult = { kind: ReportKind; filters: ReportFilters; tables: ReportTable[]; truncated: boolean; warnings: string[] };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/;

export function canViewReport(actor: Actor, kind: ReportKind): boolean {
  return can(actor, PERMISSION[kind]) && actor.kind === "user";
}

/** Filtreler (karar #92): varsayılan son 90 gün; İSG defterinde içinde bulunulan takvim yılı. */
export async function parseFilters(kind: ReportKind, input: Partial<Record<keyof ReportFilters, string | null | undefined>>): Promise<ReportFilters> {
  const { "org.timezone": tz } = await getSettings(["org.timezone"]);
  const today = todayIn(tz);
  const year = today.slice(0, 4);
  const defFrom = kind === "ohs" ? `${year}-01-01` : addDays(today, -90);
  const defTo = kind === "ohs" ? `${year}-12-31` : today;
  const from = input.from && DATE.test(input.from) ? input.from : defFrom;
  const to = input.to && DATE.test(input.to) ? input.to : defTo;
  if (from > to) throw new ValidationError("report_range_invalid");
  return {
    from,
    to,
    orgUnitId: input.orgUnitId && UUID.test(input.orgUnitId) ? input.orgUnitId : null,
    positionId: input.positionId && UUID.test(input.positionId) ? input.positionId : null,
  };
}

/** Tarih sınırları Europe/Istanbul gününe göre (timestamptz). */
function range(column: SQL | Parameters<typeof gte>[0], f: ReportFilters, tz: string): SQL {
  return sql`${column} >= (${f.from}::date)::timestamp at time zone ${tz} and ${column} < ((${f.to}::date + 1)::timestamp at time zone ${tz})`;
}

/** Kapsam + birim/pozisyon filtresi (pozisyonun birimine göre; ağaç iki seviyeli). */
async function unitCondition(actor: Actor, f: ReportFilters, positionColumn: typeof positions.id, opts: { ohsAll?: boolean } = {}): Promise<SQL | undefined> {
  const conds: SQL[] = [];
  // İSG uzmanı tüm personelin İSG kayıtlarını görür (SPEC 2.2, karar #91)
  const scope = opts.ohsAll && hasRole(actor, "ohs_specialist") ? ({ all: true } as const) : await orgScopeFor(actor);
  if (!scope.all) {
    const ids = [...scope.orgUnitIds];
    if (ids.length === 0) return sql`false`;
    conds.push(inArray(positions.orgUnitId, ids));
  }
  if (f.orgUnitId) {
    const children = await db().select({ id: orgUnits.id }).from(orgUnits).where(eq(orgUnits.parentId, f.orgUnitId));
    conds.push(inArray(positions.orgUnitId, [f.orgUnitId, ...children.map((c) => c.id)]));
  }
  if (f.positionId) conds.push(eq(positionColumn, f.positionId));
  return conds.length ? and(...conds) : undefined;
}

async function limits() {
  return getSettings(["reports.max_rows", "org.timezone"]);
}

function guard(actor: Actor, kind: ReportKind) {
  assertUser(actor);
  assertCan(actor, PERMISSION[kind]);
}

// ---------------------------------------------------------------------------
// Eğitim ilerleme
// ---------------------------------------------------------------------------

async function trainingReport(actor: Actor, f: ReportFilters): Promise<ReportResult> {
  const { "reports.max_rows": max, "org.timezone": tz } = await limits();
  const unit = await unitCondition(actor, f, positions.id);
  const trainer = alias(users, "trainer");
  const today = todayIn(tz);
  const rows = await db()
    .select({
      a: assignments,
      sicil: users.username,
      name: users.name,
      unitName: orgUnits.name,
      positionName: positions.name,
      trainerName: trainer.name,
      total: sql<number>`(select count(*)::int from ${assignmentModules} m where m.assignment_id = ${assignments.id} and m.is_required)`,
      done: sql<number>`(select count(*)::int from ${assignmentModules} m where m.assignment_id = ${assignments.id} and m.is_required and m.status in ('completed', 'waived'))`,
    })
    .from(assignments)
    .innerJoin(users, eq(users.id, assignments.userId))
    .innerJoin(positions, eq(positions.id, assignments.positionId))
    .innerJoin(orgUnits, eq(orgUnits.id, positions.orgUnitId))
    .leftJoin(trainer, eq(trainer.id, assignments.trainerUserId))
    .where(
      and(
        unit,
        // Dönemde açık olan ya da dönemde başlayan atamalar
        or(inArray(assignments.status, ["active", "awaiting_readiness", "awaiting_decision"]), and(gte(assignments.startDate, f.from), sql`${assignments.startDate} <= ${f.to}`)),
      ),
    )
    .orderBy(asc(orgUnits.name), asc(users.name))
    .limit(max + 1);
  const out = rows.slice(0, max).map((r) => {
    const overdue = !!r.a.targetDate && r.a.targetDate < today && ["active", "awaiting_decision"].includes(r.a.status);
    return [r.sicil, r.name, r.unitName, r.positionName, r.a.status, r.a.startDate, r.a.targetDate, r.total, r.done, r.total ? Math.round((r.done / r.total) * 100) : 0, overdue, r.trainerName] as Cell[];
  });
  return {
    kind: "training",
    filters: f,
    tables: [{ key: "people", columns: ["sicil", "name", "unit", "position", "status", "startDate", "targetDate", "modulesTotal", "modulesDone", "progress", "overdue", "trainer"], rows: out }],
    truncated: rows.length > max,
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Sınav sonuçları
// ---------------------------------------------------------------------------

async function examsReport(actor: Actor, f: ReportFilters): Promise<ReportResult> {
  const { "reports.max_rows": max, "org.timezone": tz } = await limits();
  const unit = await unitCondition(actor, f, positions.id);
  const theory = await db()
    .select({
      sicil: users.username,
      name: users.name,
      positionName: positions.name,
      title: assignmentModules.title,
      attemptNo: examAttempts.attemptNo,
      at: examAttempts.submittedAt,
      score: examAttempts.score,
      passed: examAttempts.passed,
      failReason: examAttempts.failReason,
    })
    .from(examAttempts)
    .innerJoin(assignmentModules, eq(assignmentModules.id, examAttempts.assignmentModuleId))
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .innerJoin(users, eq(users.id, assignments.userId))
    .innerJoin(positions, eq(positions.id, assignments.positionId))
    .where(and(unit, isNotNull(examAttempts.submittedAt), range(examAttempts.submittedAt, f, tz)))
    .orderBy(desc(examAttempts.submittedAt))
    .limit(max + 1);
  const practical = await db()
    .select({
      sicil: users.username,
      name: users.name,
      positionName: positions.name,
      title: assignmentModules.title,
      attemptNo: practicalExamResults.attemptNo,
      at: practicalExamResults.finalizedAt,
      score: practicalExamResults.score,
      passed: practicalExamResults.passed,
      failReason: practicalExamResults.failReason,
    })
    .from(practicalExamResults)
    .innerJoin(assignmentModules, eq(assignmentModules.id, practicalExamResults.assignmentModuleId))
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .innerJoin(users, eq(users.id, assignments.userId))
    .innerJoin(positions, eq(positions.id, assignments.positionId))
    .where(and(unit, eq(practicalExamResults.status, "final"), range(practicalExamResults.finalizedAt, f, tz)))
    .orderBy(desc(practicalExamResults.finalizedAt))
    .limit(max + 1);
  const attempts = [
    ...theory.map((r) => ({ ...r, type: "theory" })),
    ...practical.map((r) => ({ ...r, type: "practical" })),
  ].sort((x, y) => (y.at?.getTime() ?? 0) - (x.at?.getTime() ?? 0));

  // En çok yanlış yapılan sorular (karar #93): yalnızca soru bankasını gören, yalnızca görebildiği sorular; kişi adı yok
  const canSee = await questionViewFilter(actor);
  const qs = await db()
    .select({
      versionId: questionVersions.id,
      stem: questionVersions.stem,
      topic: questionVersions.topic,
      ownerOrgUnitId: questions.ownerOrgUnitId,
      isOhs: questions.isOhs,
      asked: sql<number>`count(*)::int`,
      wrong: sql<number>`count(*) filter (where ${examAttemptItems.isCorrect} is not true)::int`,
    })
    .from(examAttemptItems)
    .innerJoin(examAttempts, eq(examAttempts.id, examAttemptItems.attemptId))
    .innerJoin(questionVersions, eq(questionVersions.id, examAttemptItems.questionVersionId))
    .innerJoin(questions, eq(questions.id, questionVersions.questionId))
    .innerJoin(assignmentModules, eq(assignmentModules.id, examAttempts.assignmentModuleId))
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .innerJoin(positions, eq(positions.id, assignments.positionId))
    .where(and(unit, isNotNull(examAttempts.submittedAt), range(examAttempts.submittedAt, f, tz)))
    .groupBy(questionVersions.id, questions.id)
    .orderBy(desc(sql`count(*) filter (where ${examAttemptItems.isCorrect} is not true)`), desc(sql`count(*)`))
    .limit(200);
  const wrongQuestions = qs
    .filter((q) => q.wrong > 0 && canSee(q))
    .slice(0, 20)
    .map((q) => [q.stem, q.topic, q.asked, q.wrong, wrongRate(q.wrong, q.asked)] as Cell[]);

  return {
    kind: "exams",
    filters: f,
    tables: [
      {
        key: "attempts",
        columns: ["sicil", "name", "position", "exam", "examType", "attemptNo", "date", "score", "result", "failReason"],
        rows: attempts.slice(0, max).map((r) => [r.sicil, r.name, r.positionName, r.title, r.type, r.attemptNo, r.at, r.score, r.passed, r.failReason]),
      },
      ...(canSee({ ownerOrgUnitId: null, isOhs: true }) || wrongQuestions.length ? [{ key: "wrongQuestions", columns: ["question", "topic", "asked", "wrong", "wrongRate"], rows: wrongQuestions }] : []),
    ],
    truncated: attempts.length > max,
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// İSG eğitim kayıt defteri
// ---------------------------------------------------------------------------

async function ohsReport(actor: Actor, f: ReportFilters): Promise<ReportResult> {
  const { "reports.max_rows": max, "org.timezone": tz } = await limits();
  const s = await getSettings(["ohs.hazard_class", "ohs.hours_by_class"]);
  const hazard = effectiveHazardClass(s["ohs.hazard_class"]);
  const required = s["ohs.hours_by_class"][hazard.hazardClass];
  const unit = await unitCondition(actor, f, positions.id, { ohsAll: true });
  const rows = await db()
    .select({
      userId: users.id,
      sicil: users.username,
      name: users.name,
      unitName: orgUnits.name,
      positionName: positions.name,
      title: assignmentModules.title,
      completedAt: assignmentModules.completedAt,
      durationMin: assignmentModules.durationMin,
      via: assignmentModules.completedVia,
      expiresAt: assignmentModules.expiresAt,
      // Yüz yüze eğitimde eğitmen: onaylı sınıf eğitimi kaydından
      trainerName: sql<string | null>`(
        select tu.name from classroom_attendees ca
        join classroom_sessions cs on cs.id = ca.session_id
        join users tu on tu.id = cs.trainer_user_id
        where ca.user_id = ${assignments.userId} and cs.module_id = ${assignmentModules.moduleId} and cs.status = 'approved'
        order by cs.session_date desc limit 1)`,
    })
    .from(assignmentModules)
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .innerJoin(users, eq(users.id, assignments.userId))
    .innerJoin(positions, eq(positions.id, assignments.positionId))
    .innerJoin(orgUnits, eq(orgUnits.id, positions.orgUnitId))
    .where(
      and(
        unit,
        eq(assignmentModules.isOhs, true),
        eq(assignmentModules.status, "completed"),
        // Devreden modül ilk tamamlandığı yılda sayılır (karar #94): aynı kaydı iki kez yazmamak için hariç
        sql`${assignmentModules.completedVia} <> 'carried_over'`,
        range(assignmentModules.completedAt, f, tz),
      ),
    )
    .orderBy(asc(users.name), asc(assignmentModules.completedAt))
    .limit(max + 1);
  const records = rows.slice(0, max);
  const perPerson = new Map<string, { sicil: string | null; name: string; minutes: number }>();
  for (const r of records) {
    const p = perPerson.get(r.userId) ?? { sicil: r.sicil, name: r.name, minutes: 0 };
    p.minutes += r.durationMin;
    perPerson.set(r.userId, p);
  }
  return {
    kind: "ohs",
    filters: f,
    tables: [
      {
        key: "records",
        columns: ["sicil", "name", "unit", "position", "topic", "date", "hours", "trainer", "validUntil", "method"],
        rows: records.map((r) => [r.sicil, r.name, r.unitName, r.positionName, r.title, r.completedAt, minutesToHours(r.durationMin), r.trainerName, r.expiresAt, r.via]),
      },
      {
        key: "hours",
        columns: ["sicil", "name", "totalHours", "requiredHours", "met"],
        rows: [...perPerson.values()].map((p) => [p.sicil, p.name, minutesToHours(p.minutes), required, minutesToHours(p.minutes) >= required]),
      },
    ],
    truncated: rows.length > max,
    warnings: hazard.assumed ? ["hazard_class_assumed"] : [],
  };
}

// ---------------------------------------------------------------------------
// İşe başlama süresi
// ---------------------------------------------------------------------------

async function onboardingReport(actor: Actor, f: ReportFilters): Promise<ReportResult> {
  const { "reports.max_rows": max, "org.timezone": tz } = await limits();
  const unit = await unitCondition(actor, f, positions.id);
  const rows = await db()
    .select({
      sicil: users.username,
      name: users.name,
      positionId: positions.id,
      positionName: positions.name,
      hireDate: personnel.hireDate,
      startDate: assignments.startDate,
      approvedAt: readinessDecisions.decidedAt,
      approvedDay: sql<string>`to_char(${readinessDecisions.decidedAt} at time zone ${tz}, 'YYYY-MM-DD')`,
    })
    .from(readinessDecisions)
    .innerJoin(assignments, eq(assignments.id, readinessDecisions.assignmentId))
    .innerJoin(users, eq(users.id, assignments.userId))
    .innerJoin(personnel, eq(personnel.userId, assignments.userId))
    .innerJoin(positions, eq(positions.id, assignments.positionId))
    .where(and(unit, eq(readinessDecisions.decision, "approved"), eq(assignments.reason, "new_hire"), range(readinessDecisions.decidedAt, f, tz)))
    .orderBy(asc(positions.name), asc(readinessDecisions.decidedAt))
    .limit(max + 1);
  const people = rows.slice(0, max).map((r) => ({ ...r, days: daysBetween(r.hireDate ?? r.startDate, r.approvedDay) }));
  const byPosition = new Map<string, { name: string; days: number[] }>();
  for (const p of people) {
    const g = byPosition.get(p.positionId) ?? { name: p.positionName, days: [] };
    g.days.push(p.days);
    byPosition.set(p.positionId, g);
  }
  return {
    kind: "onboarding",
    filters: f,
    tables: [
      {
        key: "positions",
        columns: ["position", "count", "avgDays", "medianDays", "minDays", "maxDays"],
        rows: [...byPosition.values()].map((g) => {
          const s = summarize(g.days);
          return [g.name, s.count, s.avg, s.median, s.min, s.max];
        }),
      },
      {
        key: "people",
        columns: ["sicil", "name", "position", "hireDate", "approvedAt", "days"],
        rows: people.map((p) => [p.sicil, p.name, p.positionName, p.hireDate ?? p.startDate, p.approvedAt, p.days]),
      },
    ],
    truncated: rows.length > max,
    warnings: [],
  };
}

export async function runReport(actor: Actor, kind: ReportKind, filters: ReportFilters): Promise<ReportResult> {
  guard(actor, kind);
  switch (kind) {
    case "training":
      return trainingReport(actor, filters);
    case "exams":
      return examsReport(actor, filters);
    case "ohs":
      return ohsReport(actor, filters);
    case "onboarding":
      return onboardingReport(actor, filters);
    case "visitors":
      return visitorsReport(filters);
    case "contractors":
      return contractorsReport(filters);
  }
}

// ---------------------------------------------------------------------------
// Ziyaretçi kayıt defteri ve taşeron uygunluk (SPEC 10.1, iş paketi 2.4, karar #162)
// ---------------------------------------------------------------------------

async function visitorsReport(f: ReportFilters): Promise<ReportResult> {
  const { "reports.max_rows": max } = await limits();
  const host = alias(users, "vr_host");
  const rows = await db()
    .select({
      plannedDate: visits.plannedDate,
      fullName: visitors.fullName,
      companyName: visitors.companyName,
      visitorType: visits.visitorType,
      hostName: sql<string>`coalesce(${host.name}, ${visits.hostNameText})`,
      status: visits.status,
      briefedAt: visits.briefingCompletedAt,
      locale: visits.briefingLocale,
      quizScore: visits.quizScore,
      checkedInAt: visits.checkedInAt,
      checkedOutAt: visits.checkedOutAt,
      badgeNo: visits.badgeNo,
      idMasked: visitors.nationalIdMasked,
    })
    .from(visits)
    .innerJoin(visitors, eq(visitors.id, visits.visitorId))
    .leftJoin(host, eq(host.id, visits.hostUserId))
    .where(and(gte(visits.plannedDate, f.from), lte(visits.plannedDate, f.to)))
    .orderBy(asc(visits.plannedDate), asc(visitors.fullName))
    .limit(max + 1);
  const out = rows
    .slice(0, max)
    .map((r) => [r.plannedDate, r.fullName, r.companyName, r.visitorType, r.hostName, r.status, r.briefedAt, r.locale, r.quizScore, r.checkedInAt, r.checkedOutAt, r.badgeNo, r.idMasked] as Cell[]);
  return {
    kind: "visitors",
    filters: f,
    tables: [
      {
        key: "visits",
        columns: ["visitDate", "name", "company", "visitorType", "host", "visitStatus", "briefedAt", "language", "quizScore", "checkedInAt", "checkedOutAt", "badge", "idMasked"],
        rows: out,
      },
    ],
    truncated: rows.length > max,
    warnings: [],
  };
}

/** Taşeron uygunluk: firma başına çalışan ve dönem sonu (bitiş tarihi) itibarıyla geçerli bilgilendirme sayısı. */
async function contractorsReport(f: ReportFilters): Promise<ReportResult> {
  const ref = f.to;
  const rows = await db()
    .select({
      name: sql<string>`cc.name`,
      taxNo: sql<string | null>`cc.tax_no`,
      contractEnd: sql<string | null>`cc.contract_end::text`,
      archived: sql<boolean>`cc.archived_at is not null`,
      workers: sql<number>`(select count(*)::int from ${visitors} v where v.contractor_company_id = cc.id and v.anonymized_at is null)`,
      valid: sql<number>`(select count(distinct v.id)::int from ${visitors} v join ${contractorClearances} c on c.visitor_id = v.id where v.contractor_company_id = cc.id and v.anonymized_at is null and c.valid_until >= ${ref}::date)`,
      nextExpiry: sql<string | null>`(select min(m.until)::text from (select max(c.valid_until) as until from ${visitors} v join ${contractorClearances} c on c.visitor_id = v.id where v.contractor_company_id = cc.id and v.anonymized_at is null group by v.id) m where m.until >= ${ref}::date)`,
    })
    .from(sql`${contractorCompanies} cc`)
    .orderBy(sql`cc.name`);
  const out = rows.map((r) => [r.name, r.taxNo, r.contractEnd, r.archived, r.workers, r.valid, r.workers - r.valid, r.nextExpiry] as Cell[]);
  return {
    kind: "contractors",
    filters: f,
    tables: [{ key: "companies", columns: ["company", "taxNo", "contractEnd", "archived", "workers", "validWorkers", "invalidWorkers", "nextExpiry"], rows: out }],
    truncated: false,
    warnings: [],
  };
}

/** Filtre seçenekleri: kapsamdaki birimler ve pozisyonlar. */
export async function reportFilterOptions(
  actor: Actor,
  kind: ReportKind,
): Promise<{ units: { id: string; name: string; parentName: string | null }[]; positions: { id: string; name: string; unitName: string }[] }> {
  guard(actor, kind);
  if (!hasOrgFilters(kind)) return { units: [], positions: [] };
  const scope = kind === "ohs" && hasRole(actor, "ohs_specialist") ? ({ all: true } as const) : await orgScopeFor(actor);
  const parent = alias(orgUnits, "parent");
  const all = await db()
    .select({ id: orgUnits.id, name: orgUnits.name, parentId: orgUnits.parentId, parentName: parent.name })
    .from(orgUnits)
    .leftJoin(parent, eq(parent.id, orgUnits.parentId))
    .orderBy(asc(orgUnits.name));
  // Her departmanın hemen altında kendi bölümleri
  const units = all
    .filter((u) => !u.parentId)
    .flatMap((d) => [d, ...all.filter((c) => c.parentId === d.id)])
    .map(({ id, name, parentName }) => ({ id, name, parentName }));
  const pos = await db()
    .select({ id: positions.id, name: positions.name, orgUnitId: positions.orgUnitId, unitName: orgUnits.name })
    .from(positions)
    .innerJoin(orgUnits, eq(orgUnits.id, positions.orgUnitId))
    .orderBy(asc(positions.name));
  const inScope = (id: string) => scope.all || scope.orgUnitIds.has(id);
  return {
    units: units.filter((u) => inScope(u.id)),
    positions: pos.filter((p) => inScope(p.orgUnitId)).map((p) => ({ id: p.id, name: p.name, unitName: p.unitName })),
  };
}

