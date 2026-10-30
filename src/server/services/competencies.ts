import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertNotSelf, assertUser, can, hasAnyRole } from "@/server/authz/policy";
import { orgScopeFor, type OrgScope } from "@/server/authz/scope";
import { db, type DbOrTx, type Tx } from "@/server/db/client";
import {
  assignmentModules,
  assignments,
  competencies,
  competencyGrants,
  orgUnits,
  personnel,
  positions,
  practiceMarks,
  practiceTasks,
  reportExports,
  users,
} from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { competencyState, grantValidUntil, type CompetencyState } from "@/server/state/competencies";
import { notify, sectionManagersForPerson } from "./notifications";
import { recordOwnerAction } from "./owner-actions";
import { getSettings } from "./settings";

/**
 * Yetkinlik matrisi (FG-7.4, iş paketi 3.1, kararlar #218–221).
 *  - Tanım: bölüm sorumlusu kapsamındaki birimler için, İSG uzmanı bütün birimler ve ortak (birimsiz) için.
 *  - Verme: işe başlama onayında "tek başına" tamamlanan pratik görevlerin yetkinlikleri kendiliğinden; mevcut personele
 *    bölüm sorumlusu gerekçeyle elle. Kimse kendine veremez (owner dahil). Kayıt değiştirilemez, bir kez geri alınabilir.
 *  - Kişinin bir yetkinlikteki durumu, geri alınmamış en son kaydıdır.
 */

export type CompetencyKind = "machine" | "task";
export type CompetencyInput = {
  name: string;
  kind: CompetencyKind;
  description: string | null;
  orgUnitId: string | null;
  validityMonths: number | null;
};

/** Yetkinlik ekranları ve matris için kapsam: İSG, İK, sistem yöneticisi (ve owner) bütün ağaç; bölüm sorumlusu kendi kapsamı. */
async function competencyScope(actor: Actor, conn: DbOrTx = db()): Promise<OrgScope> {
  if (actor.kind === "system" || hasAnyRole(actor, ["ohs_specialist", "hr", "sysadmin"])) return { all: true };
  return orgScopeFor(actor, conn);
}

const parentUnit = alias(orgUnits, "parent_unit");
const granter = alias(users, "granter");

const inScope = (scope: OrgScope, unitId: string | null) => scope.all || (!!unitId && scope.orgUnitIds.has(unitId));

/** Tanımı düzenleyebilir mi: İSG uzmanı her tanımı; bölüm sorumlusu yalnızca kapsamındaki birimin tanımını (ortak olanı değil). */
function canManageDefinition(actor: Actor, scope: OrgScope, orgUnitId: string | null): boolean {
  if (!can(actor, "competencies.manage")) return false;
  if (hasAnyRole(actor, ["ohs_specialist"])) return true;
  return orgUnitId !== null && !scope.all && scope.orgUnitIds.has(orgUnitId);
}

function clean(input: CompetencyInput): CompetencyInput {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 200) throw new ValidationError("competency_name_invalid");
  if (input.kind !== "machine" && input.kind !== "task") throw new ValidationError("invalid_input");
  const v = input.validityMonths;
  if (v !== null && (!Number.isInteger(v) || v < 1 || v > 240)) throw new ValidationError("validity_invalid");
  const description = input.description?.trim().slice(0, 2000) || null;
  return { name, kind: input.kind, description, orgUnitId: input.orgUnitId, validityMonths: v };
}

// ---------------------------------------------------------------------------
// Tanımlar
// ---------------------------------------------------------------------------

export type CompetencyRow = {
  id: string;
  name: string;
  kind: CompetencyKind;
  description: string | null;
  orgUnitId: string | null;
  unitName: string | null;
  validityMonths: number | null;
  archived: boolean;
  holders: number;
  canEdit: boolean;
};

export async function listCompetencies(actor: Actor, opts: { archived?: boolean } = {}): Promise<CompetencyRow[]> {
  assertUser(actor);
  if (!can(actor, "competencies.manage") && !can(actor, "competencies.view")) throw new ForbiddenError("competencies.view");
  const scope = await competencyScope(actor);
  const rows = await db()
    .select({ c: competencies, unitName: orgUnits.name })
    .from(competencies)
    .leftJoin(orgUnits, eq(orgUnits.id, competencies.orgUnitId))
    .where(opts.archived ? sql`${competencies.archivedAt} is not null` : isNull(competencies.archivedAt))
    .orderBy(asc(competencies.name));
  const visible = rows.filter((r) => r.c.orgUnitId === null || inScope(scope, r.c.orgUnitId));
  const holders = visible.length ? await holderCounts(visible.map((r) => r.c.id)) : new Map<string, number>();
  return visible.map(({ c, unitName }) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    description: c.description,
    orgUnitId: c.orgUnitId,
    unitName,
    validityMonths: c.validityMonths,
    archived: c.archivedAt !== null,
    holders: holders.get(c.id) ?? 0,
    canEdit: c.archivedAt === null && canManageDefinition(actor, scope, c.orgUnitId),
  }));
}

/** Geçerli (geri alınmamış, süresi dolmamış) en son kaydı olan kişi sayısı. */
async function holderCounts(ids: string[]): Promise<Map<string, number>> {
  const rows = await db().execute<{ competency_id: string; n: number }>(sql`
    select l.competency_id, count(*)::int as n from (${latestGrants(sql`g.competency_id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`)}) l
    where l.valid_until is null or l.valid_until > now()
    group by l.competency_id`);
  return new Map(rows.map((r) => [r.competency_id, r.n]));
}

/** Kişi × yetkinlik başına geri alınmamış en son kayıt. */
function latestGrants(where: ReturnType<typeof sql>) {
  return sql`select distinct on (g.user_id, g.competency_id) g.id, g.user_id, g.competency_id, g.valid_until, g.source, g.created_at
    from competency_grants g where g.revoked_at is null and ${where}
    order by g.user_id, g.competency_id, g.created_at desc`;
}

export async function createCompetency(actor: Actor, input: CompetencyInput): Promise<{ id: string }> {
  assertUser(actor);
  const v = clean(input);
  return withActor(actor, async (tx) => {
    const scope = await competencyScope(actor, tx);
    if (!canManageDefinition(actor, scope, v.orgUnitId)) throw new ForbiddenError("competencies.manage");
    if (v.orgUnitId) await assertActiveUnit(tx, v.orgUnitId);
    const [row] = await tx
      .insert(competencies)
      .values({ ...v, createdBy: actor.userId })
      .returning({ id: competencies.id });
    return { id: row!.id };
  });
}

/** Düzenleme: geçerlilik süresi değişirse yalnızca bundan sonra verilenlere yansır. Birim değiştirilemez. */
export async function updateCompetency(actor: Actor, id: string, input: Omit<CompetencyInput, "orgUnitId">): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    const c = await loadCompetency(tx, id);
    const v = clean({ ...input, orgUnitId: c.orgUnitId });
    const scope = await competencyScope(actor, tx);
    if (c.archivedAt || !canManageDefinition(actor, scope, c.orgUnitId)) throw new ForbiddenError("competencies.manage");
    await tx
      .update(competencies)
      .set({ name: v.name, kind: v.kind, description: v.description, validityMonths: v.validityMonths })
      .where(eq(competencies.id, id));
  });
}

/** Arşivleme (silme yok): yeni verme ve görev bağlama yapılamaz; mevcut kayıtlar matriste kalır. */
export async function archiveCompetency(actor: Actor, id: string): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    const c = await loadCompetency(tx, id);
    const scope = await competencyScope(actor, tx);
    if (c.archivedAt) throw new ValidationError("competency_archived");
    if (!canManageDefinition(actor, scope, c.orgUnitId)) throw new ForbiddenError("competencies.manage");
    await tx.update(competencies).set({ archivedAt: new Date() }).where(eq(competencies.id, id));
  });
}

async function loadCompetency(conn: DbOrTx, id: string) {
  const [c] = await conn.select().from(competencies).where(eq(competencies.id, id)).limit(1);
  if (!c) throw new NotFoundError("competency");
  return c;
}

async function assertActiveUnit(tx: Tx, orgUnitId: string) {
  const [u] = await tx.select({ isActive: orgUnits.isActive }).from(orgUnits).where(eq(orgUnits.id, orgUnitId)).limit(1);
  if (!u?.isActive) throw new ValidationError("org_unit_invalid");
}

/** Pratik görev editörü için: arşivlenmemiş, modülün birimine (birimin departmanı/bölümleri dahil) ya da ortak yetkinlikler. */
export async function competencyOptionsForUnit(conn: DbOrTx, orgUnitId: string | null): Promise<{ id: string; name: string; kind: CompetencyKind }[]> {
  const related = orgUnitId ? await relatedUnits(conn, orgUnitId) : [];
  return conn
    .select({ id: competencies.id, name: competencies.name, kind: competencies.kind })
    .from(competencies)
    .where(and(isNull(competencies.archivedAt), related.length ? or(isNull(competencies.orgUnitId), inArray(competencies.orgUnitId, related)) : isNull(competencies.orgUnitId)))
    .orderBy(asc(competencies.name));
}

/** Birim, üst departmanı ve alt bölümleri (ağaç iki seviyeli). */
async function relatedUnits(conn: DbOrTx, orgUnitId: string): Promise<string[]> {
  const [u] = await conn.select({ id: orgUnits.id, parentId: orgUnits.parentId }).from(orgUnits).where(eq(orgUnits.id, orgUnitId)).limit(1);
  if (!u) return [];
  const children = await conn.select({ id: orgUnits.id }).from(orgUnits).where(eq(orgUnits.parentId, u.id));
  return [u.id, ...(u.parentId ? [u.parentId] : []), ...children.map((c) => c.id)];
}

/** Görevlere bağlanan yetkinlik kimliklerinin geçerliliği (pratik görev kaydında). */
export async function assertCompetenciesLinkable(tx: Tx, moduleOrgUnitId: string | null, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const allowed = new Set((await competencyOptionsForUnit(tx, moduleOrgUnitId)).map((c) => c.id));
  if (unique.some((id) => !allowed.has(id))) throw new ValidationError("competency_invalid");
}

// ---------------------------------------------------------------------------
// Verme ve geri alma
// ---------------------------------------------------------------------------

/** Kişinin pozisyonu kapsamda mı (yetkinlik kapsamıyla). */
async function personUnit(conn: DbOrTx, userId: string): Promise<{ orgUnitId: string | null; status: string } | null> {
  const [p] = await conn
    .select({ orgUnitId: positions.orgUnitId, status: personnel.status })
    .from(personnel)
    .leftJoin(positions, eq(positions.id, personnel.positionId))
    .where(eq(personnel.userId, userId))
    .limit(1);
  return p ?? null;
}

/** Elle verme (karar #219): bölüm sorumlusu kapsamındaki aktif personele, gerekçeyle; kimse kendine veremez. */
export async function grantCompetency(actor: Actor, input: { userId: string; competencyId: string; reason: string }): Promise<{ id: string }> {
  assertUser(actor);
  assertCan(actor, "competencies.grant");
  assertNotSelf(actor, input.userId);
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 2000) throw new ValidationError("reason_required");
  return withActor(actor, async (tx) => {
    const c = await loadCompetency(tx, input.competencyId);
    if (c.archivedAt) throw new ValidationError("competency_archived");
    const scope = await competencyScope(actor, tx);
    const person = await personUnit(tx, input.userId);
    if (!person || person.status !== "active") throw new ValidationError("person_inactive");
    if (!inScope(scope, person.orgUnitId)) throw new ForbiddenError("competencies.grant");
    if (c.orgUnitId !== null && !inScope(scope, c.orgUnitId)) throw new ForbiddenError("competencies.grant");
    const [row] = await tx
      .insert(competencyGrants)
      .values({
        userId: input.userId,
        competencyId: c.id,
        validUntil: grantValidUntil(new Date(), c.validityMonths),
        source: "manual",
        reason,
        grantedBy: actor.userId,
      })
      .returning({ id: competencyGrants.id });
    await recordOwnerAction(tx, actor, "competencies.grant", { type: "competency_grant", id: row!.id });
    return { id: row!.id };
  });
}

/** Geri alma: bir kez, gerekçeyle; kayıt silinmez (karar #219). */
export async function revokeCompetencyGrant(actor: Actor, grantId: string, reason: string): Promise<void> {
  assertUser(actor);
  assertCan(actor, "competencies.grant");
  const text = reason.trim();
  if (text.length < 10 || text.length > 2000) throw new ValidationError("reason_required");
  await withActor(actor, async (tx) => {
    const [g] = await tx.select().from(competencyGrants).where(eq(competencyGrants.id, grantId)).limit(1).for("update");
    if (!g) throw new NotFoundError("competency_grant");
    assertNotSelf(actor, g.userId);
    if (g.revokedAt) throw new ValidationError("already_lifted");
    const scope = await competencyScope(actor, tx);
    const person = await personUnit(tx, g.userId);
    if (!person || !inScope(scope, person.orgUnitId)) throw new ForbiddenError("competencies.grant");
    await tx.update(competencyGrants).set({ revokedAt: new Date(), revokedBy: actor.userId, revokeReason: text }).where(eq(competencyGrants.id, g.id));
    await recordOwnerAction(tx, actor, "competencies.grant", { type: "competency_grant", id: g.id });
  });
}

/**
 * Eğitimle verme (karar #219): işe başlama onayında (pozisyon sertifikası düzenlenirken, aynı transaction'da) atamanın
 * pratik modüllerinde son seviyesi "tek başına" olan görevlerin bağlı olduğu arşivlenmemiş yetkinlikler verilir.
 */
export async function grantFromTraining(tx: Tx, input: { assignmentId: string; certificateId: string; grantedBy: string }): Promise<number> {
  const [a] = await tx.select({ userId: assignments.userId }).from(assignments).where(eq(assignments.id, input.assignmentId)).limit(1);
  if (!a) return 0;
  const rows = await tx.execute<{ competency_id: string; validity_months: number | null }>(sql`
    with latest as (
      select distinct on (pm.assignment_module_id, pm.practice_task_id) pm.practice_task_id, pm.level
      from ${practiceMarks} pm
      join ${assignmentModules} am on am.id = pm.assignment_module_id
      where am.assignment_id = ${input.assignmentId}
      order by pm.assignment_module_id, pm.practice_task_id, pm.marked_at desc, pm.id desc
    )
    select distinct c.id as competency_id, c.validity_months
    from latest l
    join ${practiceTasks} t on t.id = l.practice_task_id
    join ${competencies} c on c.id = t.competency_id and c.archived_at is null
    where l.level = 'independent'`);
  if (rows.length === 0) return 0;
  const now = new Date();
  await tx.insert(competencyGrants).values(
    rows.map((r) => ({
      userId: a.userId,
      competencyId: r.competency_id,
      certificateId: input.certificateId,
      validUntil: grantValidUntil(now, r.validity_months),
      source: "training" as const,
      grantedBy: input.grantedBy,
    })),
  );
  return rows.length;
}

// ---------------------------------------------------------------------------
// Matris ve kişi görünümü
// ---------------------------------------------------------------------------

export type MatrixCell = { grantId: string; validUntil: Date | null; source: "training" | "manual"; state: CompetencyState };
export type CompetencyMatrix = {
  units: { id: string; name: string; parentName: string | null }[];
  unitId: string | null;
  competencies: { id: string; name: string; kind: CompetencyKind; validityMonths: number | null }[];
  people: { userId: string; fullName: string; sicilNo: string; positionName: string | null; cells: Record<string, MatrixCell> }[];
  canGrant: boolean;
  alertDays: number;
};

/** Matris (FG-7.4): seçilen birimin (alt bölümleri dahil) aktif personeli × birimin ve ortak yetkinlikler. */
export async function competencyMatrix(actor: Actor, unitId: string | null): Promise<CompetencyMatrix> {
  assertUser(actor);
  assertCan(actor, "competencies.view");
  const scope = await competencyScope(actor);
  const { "competency.alert_days": alertDays } = await getSettings(["competency.alert_days"]);
  const allUnits = await db()
    .select({ id: orgUnits.id, name: orgUnits.name, parentId: orgUnits.parentId, parentName: parentUnit.name })
    .from(orgUnits)
    .leftJoin(parentUnit, eq(parentUnit.id, orgUnits.parentId))
    .where(eq(orgUnits.isActive, true))
    .orderBy(asc(orgUnits.name));
  const units = allUnits.filter((u) => inScope(scope, u.id)).map((u) => ({ id: u.id, name: u.name, parentName: u.parentName }));
  const selected = units.find((u) => u.id === unitId)?.id ?? null;
  const base = { units, unitId: selected, canGrant: can(actor, "competencies.grant"), alertDays };
  if (!selected) return { ...base, competencies: [], people: [] };

  const subtree = [selected, ...allUnits.filter((u) => u.parentId === selected).map((u) => u.id)].filter((id) => inScope(scope, id));
  const related = await relatedUnits(db(), selected);
  const comps = await db()
    .select({ id: competencies.id, name: competencies.name, kind: competencies.kind, validityMonths: competencies.validityMonths })
    .from(competencies)
    .where(and(isNull(competencies.archivedAt), or(isNull(competencies.orgUnitId), inArray(competencies.orgUnitId, related))))
    .orderBy(asc(competencies.kind), asc(competencies.name));
  const people = await db()
    .select({ userId: personnel.userId, fullName: personnel.fullName, sicilNo: personnel.sicilNo, positionName: positions.name })
    .from(personnel)
    .innerJoin(positions, eq(positions.id, personnel.positionId))
    .where(and(eq(personnel.status, "active"), inArray(positions.orgUnitId, subtree)))
    .orderBy(asc(personnel.fullName));
  const cells = new Map<string, Record<string, MatrixCell>>();
  if (people.length && comps.length) {
    const rows = await db().execute<{ id: string; user_id: string; competency_id: string; valid_until: string | null; source: "training" | "manual" }>(
      latestGrants(
        sql`g.user_id in (${sql.join(people.map((p) => sql`${p.userId}::uuid`), sql`, `)}) and g.competency_id in (${sql.join(comps.map((c) => sql`${c.id}::uuid`), sql`, `)})`,
      ),
    );
    const now = new Date();
    for (const r of rows) {
      const validUntil = r.valid_until ? new Date(r.valid_until) : null;
      const byComp = cells.get(r.user_id) ?? {};
      byComp[r.competency_id] = { grantId: r.id, validUntil, source: r.source, state: competencyState(validUntil, now, alertDays) };
      cells.set(r.user_id, byComp);
    }
  }
  return { ...base, competencies: comps, people: people.map((p) => ({ ...p, cells: cells.get(p.userId) ?? {} })) };
}

/** Tek kayıt ayrıntısı (matristeki hücre): kapsam kontrolüyle. */
export async function grantHistory(actor: Actor, userId: string, competencyId: string) {
  assertUser(actor);
  assertCan(actor, "competencies.view");
  const scope = await competencyScope(actor);
  const person = await personUnit(db(), userId);
  if (!person || !inScope(scope, person.orgUnitId)) throw new NotFoundError("person");
  return db()
    .select({
      id: competencyGrants.id,
      source: competencyGrants.source,
      reason: competencyGrants.reason,
      validUntil: competencyGrants.validUntil,
      createdAt: competencyGrants.createdAt,
      revokedAt: competencyGrants.revokedAt,
      revokeReason: competencyGrants.revokeReason,
      grantedByName: granter.name,
    })
    .from(competencyGrants)
    .leftJoin(granter, eq(granter.id, competencyGrants.grantedBy))
    .where(and(eq(competencyGrants.userId, userId), eq(competencyGrants.competencyId, competencyId)))
    .orderBy(desc(competencyGrants.createdAt));
}

/** Personel: kendi yetkinlikleri (profil, karar #221). */
export async function myCompetencies(actor: Actor): Promise<{ id: string; name: string; kind: CompetencyKind; validUntil: Date | null; state: CompetencyState }[]> {
  assertUser(actor);
  const { "competency.alert_days": alertDays } = await getSettings(["competency.alert_days"]);
  const rows = await db().execute<{ competency_id: string; valid_until: string | null }>(latestGrants(sql`g.user_id = ${actor.userId}::uuid`));
  if (rows.length === 0) return [];
  const comps = await db()
    .select({ id: competencies.id, name: competencies.name, kind: competencies.kind })
    .from(competencies)
    .where(inArray(competencies.id, rows.map((r) => r.competency_id)));
  const byId = new Map(comps.map((c) => [c.id, c]));
  const now = new Date();
  return rows
    .map((r) => {
      const c = byId.get(r.competency_id)!;
      const validUntil = r.valid_until ? new Date(r.valid_until) : null;
      return { id: c.id, name: c.name, kind: c.kind, validUntil, state: competencyState(validUntil, now, alertDays) };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

// ---------------------------------------------------------------------------
// Süre uyarısı (karar #220)
// ---------------------------------------------------------------------------

/** Bitişine `competency.alert_days` kalan en son kayıtlar: kişinin bölüm sorumlularına bir kez bildirim. */
export async function notifyCompetencyExpiring(actor: Actor, now: Date = new Date()): Promise<number> {
  const { "competency.alert_days": days } = await getSettings(["competency.alert_days"]);
  const until = new Date(now.getTime() + days * 86_400_000);
  const rows = await db().execute<{ id: string; user_id: string; name: string; competency: string; valid_until: string }>(sql`
    select l.id, l.user_id, u.name, c.name as competency, l.valid_until
    from (${latestGrants(sql`true`)}) l
    join ${users} u on u.id = l.user_id
    join ${personnel} p on p.user_id = l.user_id and p.status = 'active'
    join ${competencies} c on c.id = l.competency_id and c.archived_at is null
    where l.valid_until is not null and l.valid_until > ${now.toISOString()}::timestamptz and l.valid_until <= ${until.toISOString()}::timestamptz`);
  if (rows.length === 0) return 0;
  await withActor(actor, async (tx) => {
    for (const r of rows) {
      await notify(tx, {
        kind: "competency_expiring",
        userIds: await sectionManagersForPerson(tx, r.user_id),
        subjectKey: `competency:${r.id}`,
        link: "/reports/competency",
        params: { name: r.name, competency: r.competency },
        exclude: [r.user_id],
        once: true,
      });
    }
  });
  return rows.length;
}

/** Tanım formundaki birim seçenekleri: İSG uzmanı bütün birimler + ortak; bölüm sorumlusu kendi kapsamı. */
export async function competencyUnitOptions(actor: Actor): Promise<{ common: boolean; units: { id: string; name: string; parentName: string | null }[] }> {
  assertUser(actor);
  assertCan(actor, "competencies.manage");
  const scope = await competencyScope(actor);
  const rows = await db()
    .select({ id: orgUnits.id, name: orgUnits.name, parentName: parentUnit.name })
    .from(orgUnits)
    .leftJoin(parentUnit, eq(parentUnit.id, orgUnits.parentId))
    .where(eq(orgUnits.isActive, true))
    .orderBy(asc(orgUnits.name));
  const ohs = hasAnyRole(actor, ["ohs_specialist"]);
  return { common: ohs, units: rows.filter((u) => ohs || canManageDefinition(actor, scope, u.id)) };
}

/** Matrisin Excel çıktısı (indirenin dilinde etiketlerle); her indirme `report_exports`'a yazılır. */
export async function competencyMatrixWorkbook(
  actor: Actor,
  unitId: string,
  labels: { sheet: string; person: string; sicil: string; position: string; unlimited: string; states: Record<CompetencyState, string> },
): Promise<Buffer> {
  assertUser(actor);
  const m = await competencyMatrix(actor, unitId);
  if (!m.unitId) throw new NotFoundError("org_unit");
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "JAPAR Akademi";
  const ws = wb.addWorksheet(labels.sheet.slice(0, 31));
  ws.addRow([labels.person, labels.sicil, labels.position, ...m.competencies.map((c) => c.name)]);
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  const fill: Record<CompetencyState, string> = { valid: "FFC6EFCE", expiring: "FFFFEB9C", expired: "FFFFC7CE" };
  for (const p of m.people) {
    const row = ws.addRow([
      p.fullName,
      p.sicilNo,
      p.positionName ?? "",
      ...m.competencies.map((c) => {
        const cell = p.cells[c.id];
        if (!cell) return "";
        return cell.validUntil ? cell.validUntil : labels.unlimited;
      }),
    ]);
    m.competencies.forEach((c, i) => {
      const cell = p.cells[c.id];
      if (!cell) return;
      const x = row.getCell(4 + i);
      x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill[cell.state] } };
      if (cell.validUntil) x.numFmt = "dd.mm.yyyy";
      x.note = labels.states[cell.state];
    });
  }
  ws.columns.forEach((col, i) => (col.width = i < 3 ? 26 : 18));
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  await withActor(actor, (tx) =>
    tx.insert(reportExports).values({ actorId: actor.userId, report: "competency", format: "xlsx", filters: { unit: unitId }, rowCount: m.people.length }),
  );
  return buffer;
}
