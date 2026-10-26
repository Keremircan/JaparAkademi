import { and, asc, count, eq, ne } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertCan, can } from "@/server/authz/policy";
import { inOrgScope, orgScopeFor } from "@/server/authz/scope";
import { db, type DbOrTx } from "@/server/db/client";
import { orgUnits, personnel, positions } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, NotFoundError, uniqueViolation, ValidationError } from "@/server/errors";

/**
 * Organizasyon ağacı ve pozisyonlar (SPEC 4.1, FG-1.1).
 * Ağaç iki seviyelidir: departman → bölüm. Silme yoktur; pasife alma (arşiv) vardır.
 */

export const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,23}$/;

const TR_ASCII: Record<string, string> = { İ: "I", I: "I", Ğ: "G", Ü: "U", Ş: "S", Ö: "O", Ç: "C" };

/** Kodlar büyük harf ASCII'dir: "üretim hattı" → "URETIM-HATTI". */
export function normalizeCode(code: string): string {
  return code
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/[İIĞÜŞÖÇ]/g, (ch) => TR_ASCII[ch] ?? ch)
    .replace(/\s+/g, "-");
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function mapUnique(err: unknown): never {
  const constraint = uniqueViolation(err);
  if (constraint?.includes("code")) throw new ValidationError("code_taken");
  if (constraint?.includes("name")) throw new ValidationError("name_taken");
  throw err;
}

export type PositionSummary = {
  id: string;
  name: string;
  code: string;
  collarType: "blue" | "white";
  status: "active" | "passive";
  activePersonnel: number;
};

export type OrgNode = {
  id: string;
  kind: "department" | "section";
  parentId: string | null;
  name: string;
  code: string;
  isActive: boolean;
  responsibleUserId: string | null;
  positions: PositionSummary[];
  children: OrgNode[];
};

/** Organizasyon ağacı. İK/sistem yöneticisi tümünü, bölüm sorumlusu kendi kapsamını görür. */
export async function getOrgTree(actor: Actor, conn: DbOrTx = db()): Promise<OrgNode[]> {
  const scope = await orgScopeFor(actor, conn);
  if (!scope.all && scope.orgUnitIds.size === 0) throw new ForbiddenError("org.view");

  const [units, posRows, counts] = await Promise.all([
    conn.select().from(orgUnits).orderBy(asc(orgUnits.name)),
    conn.select().from(positions).orderBy(asc(positions.name)),
    conn
      .select({ positionId: personnel.positionId, n: count() })
      .from(personnel)
      .where(eq(personnel.status, "active"))
      .groupBy(personnel.positionId),
  ]);
  const countByPosition = new Map(counts.map((c) => [c.positionId, c.n]));

  const nodes = new Map<string, OrgNode>();
  for (const u of units) {
    // Bölüm sorumlusu: kapsamdaki düğümler ve (bağlam için) onların üst departmanı
    nodes.set(u.id, {
      id: u.id,
      kind: u.kind,
      parentId: u.parentId,
      name: u.name,
      code: u.code,
      isActive: u.isActive,
      responsibleUserId: u.responsibleUserId,
      positions: [],
      children: [],
    });
  }
  for (const p of posRows) {
    nodes.get(p.orgUnitId)?.positions.push({
      id: p.id,
      name: p.name,
      code: p.code,
      collarType: p.collarType,
      status: p.status,
      activePersonnel: countByPosition.get(p.id) ?? 0,
    });
  }

  const roots: OrgNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  if (scope.all) return roots;

  // Kapsam dışı departmanların yalnızca kapsamdaki bölümleri gösterilir
  return roots
    .map((dept) => {
      if (inOrgScope(scope, dept.id)) return dept;
      const children = dept.children.filter((c) => inOrgScope(scope, c.id));
      return children.length > 0 ? { ...dept, positions: [], children } : null;
    })
    .filter((n): n is OrgNode => n !== null);
}

/** Seçim listeleri için düz pozisyon listesi ("Departman / Bölüm / Pozisyon"). */
export async function listPositionOptions(
  actor: Actor,
  opts: { includePassive?: boolean } = {},
): Promise<{ id: string; label: string; code: string; collarType: "blue" | "white"; status: "active" | "passive" }[]> {
  const tree = await getOrgTree(actor);
  const out: { id: string; label: string; code: string; collarType: "blue" | "white"; status: "active" | "passive" }[] = [];
  const walk = (node: OrgNode, path: string[]) => {
    const here = [...path, node.name];
    for (const p of node.positions) {
      if (opts.includePassive || p.status === "active") {
        out.push({ id: p.id, label: [...here, p.name].join(" / "), code: p.code, collarType: p.collarType, status: p.status });
      }
    }
    node.children.forEach((c) => walk(c, here));
  };
  tree.forEach((n) => walk(n, []));
  return out.sort((a, b) => a.label.localeCompare(b.label, "tr"));
}

/** Aktif birimler seçim listesi ("Departman" / "Departman / Bölüm"). */
export async function listUnitOptions(actor: Actor): Promise<{ id: string; label: string }[]> {
  const tree = await getOrgTree(actor);
  const out: { id: string; label: string }[] = [];
  for (const dept of tree) {
    if (dept.isActive) out.push({ id: dept.id, label: dept.name });
    for (const s of dept.children) if (s.isActive && dept.isActive) out.push({ id: s.id, label: `${dept.name} / ${s.name}` });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, "tr"));
}

export type OrgUnitInput ={ kind: "department" | "section"; parentId?: string | null; name: string; code: string };

export async function createOrgUnit(actor: Actor, input: OrgUnitInput): Promise<{ id: string }> {
  assertCan(actor, "org.manage");
  const name = normalizeName(input.name);
  const code = normalizeCode(input.code);
  if (name.length < 2) throw new ValidationError("invalid_name");
  if (!CODE_PATTERN.test(code)) throw new ValidationError("invalid_code");

  let parentId: string | null = null;
  if (input.kind === "section") {
    if (!input.parentId) throw new ValidationError("parent_required");
    const [parent] = await db().select().from(orgUnits).where(eq(orgUnits.id, input.parentId)).limit(1);
    if (!parent) throw new NotFoundError("org_unit");
    if (parent.kind !== "department") throw new ValidationError("parent_must_be_department");
    if (!parent.isActive) throw new ValidationError("parent_inactive");
    parentId = parent.id;
  }

  try {
    const [row] = await withActor(actor, (tx) =>
      tx.insert(orgUnits).values({ kind: input.kind, parentId, name, code }).returning({ id: orgUnits.id }),
    );
    return { id: row!.id };
  } catch (err) {
    mapUnique(err);
  }
}

export async function updateOrgUnit(
  actor: Actor,
  id: string,
  input: { name: string; code: string; responsibleUserId?: string | null },
): Promise<void> {
  assertCan(actor, "org.manage");
  const name = normalizeName(input.name);
  const code = normalizeCode(input.code);
  if (name.length < 2) throw new ValidationError("invalid_name");
  if (!CODE_PATTERN.test(code)) throw new ValidationError("invalid_code");
  try {
    const updated = await withActor(actor, (tx) =>
      tx
        .update(orgUnits)
        .set({ name, code, responsibleUserId: input.responsibleUserId ?? null })
        .where(eq(orgUnits.id, id))
        .returning({ id: orgUnits.id }),
    );
    if (updated.length === 0) throw new NotFoundError("org_unit");
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    mapUnique(err);
  }
}

/** Pasife alma: altında aktif bölüm veya aktif pozisyon varsa yapılamaz. Aktifleştirme: bölümün departmanı aktif olmalı. */
export async function setOrgUnitActive(actor: Actor, id: string, active: boolean): Promise<void> {
  assertCan(actor, "org.manage");
  const [unit] = await db().select().from(orgUnits).where(eq(orgUnits.id, id)).limit(1);
  if (!unit) throw new NotFoundError("org_unit");

  if (!active) {
    const [children] = await db()
      .select({ n: count() })
      .from(orgUnits)
      .where(and(eq(orgUnits.parentId, id), eq(orgUnits.isActive, true)));
    if ((children?.n ?? 0) > 0) throw new ValidationError("has_active_children");
    const [pos] = await db()
      .select({ n: count() })
      .from(positions)
      .where(and(eq(positions.orgUnitId, id), eq(positions.status, "active")));
    if ((pos?.n ?? 0) > 0) throw new ValidationError("has_active_positions");
  } else if (unit.parentId) {
    const [parent] = await db().select().from(orgUnits).where(eq(orgUnits.id, unit.parentId)).limit(1);
    if (!parent?.isActive) throw new ValidationError("parent_inactive");
  }

  await withActor(actor, (tx) => tx.update(orgUnits).set({ isActive: active }).where(eq(orgUnits.id, id)));
}

export type PositionInput = {
  orgUnitId: string;
  name: string;
  code: string;
  collarType: "blue" | "white";
  shiftPattern?: string | null;
  supervisorPositionId?: string | null;
  deputyPositionId?: string | null;
};

async function validatePositionInput(input: PositionInput, selfId?: string) {
  const name = normalizeName(input.name);
  const code = normalizeCode(input.code);
  if (name.length < 2) throw new ValidationError("invalid_name");
  if (!CODE_PATTERN.test(code)) throw new ValidationError("invalid_code");
  const [unit] = await db().select().from(orgUnits).where(eq(orgUnits.id, input.orgUnitId)).limit(1);
  if (!unit) throw new NotFoundError("org_unit");
  if (!unit.isActive) throw new ValidationError("org_unit_inactive");
  for (const ref of [input.supervisorPositionId, input.deputyPositionId]) {
    if (!ref) continue;
    if (ref === selfId) throw new ValidationError("self_reference");
    const [p] = await db().select({ id: positions.id }).from(positions).where(eq(positions.id, ref)).limit(1);
    if (!p) throw new NotFoundError("position");
  }
  return {
    orgUnitId: input.orgUnitId,
    name,
    code,
    collarType: input.collarType,
    shiftPattern: input.shiftPattern?.trim() || null,
    supervisorPositionId: input.supervisorPositionId || null,
    deputyPositionId: input.deputyPositionId || null,
  };
}

export async function createPosition(actor: Actor, input: PositionInput): Promise<{ id: string }> {
  assertCan(actor, "org.manage");
  const values = await validatePositionInput(input);
  try {
    const [row] = await withActor(actor, (tx) =>
      tx.insert(positions).values(values).returning({ id: positions.id }),
    );
    return { id: row!.id };
  } catch (err) {
    mapUnique(err);
  }
}

export async function updatePosition(actor: Actor, id: string, input: PositionInput): Promise<void> {
  assertCan(actor, "org.manage");
  const values = await validatePositionInput(input, id);
  try {
    const updated = await withActor(actor, (tx) =>
      tx.update(positions).set(values).where(eq(positions.id, id)).returning({ id: positions.id }),
    );
    if (updated.length === 0) throw new NotFoundError("position");
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    mapUnique(err);
  }
}

/** Pozisyonu pasife alma: aktif personeli varsa yapılamaz. */
export async function setPositionStatus(actor: Actor, id: string, status: "active" | "passive"): Promise<void> {
  assertCan(actor, "org.manage");
  const [pos] = await db().select().from(positions).where(eq(positions.id, id)).limit(1);
  if (!pos) throw new NotFoundError("position");
  if (status === "passive") {
    const [row] = await db()
      .select({ n: count() })
      .from(personnel)
      .where(and(eq(personnel.positionId, id), ne(personnel.status, "terminated")));
    if ((row?.n ?? 0) > 0) throw new ValidationError("has_active_personnel");
  } else {
    const [unit] = await db().select().from(orgUnits).where(eq(orgUnits.id, pos.orgUnitId)).limit(1);
    if (!unit?.isActive) throw new ValidationError("org_unit_inactive");
  }
  await withActor(actor, (tx) => tx.update(positions).set({ status }).where(eq(positions.id, id)));
}

export async function getOrgUnit(actor: Actor, id: string) {
  if (!can(actor, "org.manage")) throw new ForbiddenError("org.manage");
  const [unit] = await db().select().from(orgUnits).where(eq(orgUnits.id, id)).limit(1);
  if (!unit) throw new NotFoundError("org_unit");
  return unit;
}

export async function getPosition(actor: Actor, id: string) {
  if (!can(actor, "org.manage")) throw new ForbiddenError("org.manage");
  const [pos] = await db().select().from(positions).where(eq(positions.id, id)).limit(1);
  if (!pos) throw new NotFoundError("position");
  return pos;
}

/** Departmanlar (aktarım ve formlar için). */
export async function listDepartments(conn: DbOrTx = db()) {
  return conn
    .select({ id: orgUnits.id, name: orgUnits.name, code: orgUnits.code, isActive: orgUnits.isActive })
    .from(orgUnits)
    .where(eq(orgUnits.kind, "department"))
    .orderBy(asc(orgUnits.name));
}
