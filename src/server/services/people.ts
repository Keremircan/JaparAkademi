import { and, asc, count, eq, ilike, inArray, ne, or, type SQL } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertUser, hasRole, isOwner } from "@/server/authz/policy";
import type { Role } from "@/server/authz/roles";
import { inOrgScope, orgScopeFor } from "@/server/authz/scope";
import { decryptNationalId, protectNationalId } from "@/server/crypto/national-id";
import { db } from "@/server/db/client";
import {
  dataAccessLog,
  orgUnits,
  personnel,
  positions,
  roleScopes,
  sessions,
  userRoles,
  users,
} from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { syncAssignmentForPerson } from "@/server/services/assignments/engine";
import { ForbiddenError, NotFoundError, uniqueViolation, ValidationError } from "@/server/errors";
import { insertAccount, prepareInvitedAccount } from "@/server/services/accounts";
import { issueInvitation, type IssuedInvite } from "@/server/services/invitations";
import { type InviteChannel, normalizePhone } from "@/server/state/invitations";
import { activeRoleCount, assertLoginEmailUsable, EMAIL_LOGIN_ROLES } from "@/server/services/roles";

/**
 * Personel yönetimi (SPEC 4.1, ekran 15). İK ve sistem yöneticisi.
 * Sicil no değiştirilemez (giriş kimliğidir). Silme yoktur; pasife alma / işten çıkış vardır.
 */

export type PersonStatus = "active" | "passive" | "terminated";

export type PersonListItem = {
  userId: string;
  sicilNo: string;
  fullName: string;
  status: PersonStatus;
  positionName: string | null;
  orgUnitName: string | null;
  departmentName: string | null;
  nationalIdMasked: string | null;
  mustChangePassword: boolean;
  lockedUntil: Date | null;
};

const PAGE_SIZE = 50;

/** Personel listesi: arama (sicil/ad), durum ve org düğümü filtresi, sayfalama. */
export async function listPeople(
  actor: Actor,
  opts: { q?: string; status?: PersonStatus | "all"; orgUnitId?: string; page?: number } = {},
): Promise<{ items: PersonListItem[]; total: number; page: number; pageSize: number }> {
  assertCan(actor, "people.view");
  const scope = await orgScopeFor(actor);
  const page = Math.max(1, opts.page ?? 1);
  const parent = orgUnits;

  const filters: SQL[] = [];
  if (opts.status && opts.status !== "all") filters.push(eq(personnel.status, opts.status));
  else if (!opts.status) filters.push(ne(personnel.status, "terminated"));
  const q = opts.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    filters.push(or(ilike(personnel.sicilNo, like), ilike(personnel.fullName, like))!);
  }
  if (opts.orgUnitId) {
    const children = await db().select({ id: orgUnits.id }).from(orgUnits).where(eq(orgUnits.parentId, opts.orgUnitId));
    filters.push(inArray(positions.orgUnitId, [opts.orgUnitId, ...children.map((c) => c.id)]));
  }
  if (!scope.all) {
    if (scope.orgUnitIds.size === 0) throw new ForbiddenError("people.view");
    filters.push(inArray(positions.orgUnitId, [...scope.orgUnitIds]));
  }
  const where = filters.length ? and(...filters) : undefined;

  const base = db()
    .select({
      userId: personnel.userId,
      sicilNo: personnel.sicilNo,
      fullName: personnel.fullName,
      status: personnel.status,
      positionName: positions.name,
      orgUnitId: positions.orgUnitId,
      nationalIdMasked: personnel.nationalIdMasked,
      mustChangePassword: personnel.mustChangePassword,
      lockedUntil: personnel.lockedUntil,
    })
    .from(personnel)
    .leftJoin(positions, eq(positions.id, personnel.positionId))
    .where(where);

  const [rows, totalRows, units] = await Promise.all([
    base.orderBy(asc(personnel.fullName)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db()
      .select({ n: count() })
      .from(personnel)
      .leftJoin(positions, eq(positions.id, personnel.positionId))
      .where(where),
    db().select({ id: parent.id, name: parent.name, parentId: parent.parentId }).from(parent),
  ]);
  const unitById = new Map(units.map((u) => [u.id, u]));

  return {
    items: rows.map((r) => {
      const unit = r.orgUnitId ? unitById.get(r.orgUnitId) : undefined;
      const dept = unit?.parentId ? unitById.get(unit.parentId) : unit;
      return {
        userId: r.userId,
        sicilNo: r.sicilNo,
        fullName: r.fullName,
        status: r.status,
        positionName: r.positionName,
        orgUnitName: unit?.name ?? null,
        departmentName: dept?.name ?? null,
        nationalIdMasked: r.nationalIdMasked,
        mustChangePassword: r.mustChangePassword,
        lockedUntil: r.lockedUntil,
      };
    }),
    total: totalRows[0]?.n ?? 0,
    page,
    pageSize: PAGE_SIZE,
  };
}

export type PersonDetail = {
  userId: string;
  sicilNo: string;
  fullName: string;
  status: PersonStatus;
  positionId: string | null;
  positionOrgUnitId: string | null;
  nationalIdMasked: string | null;
  phone: string | null;
  email: string | null;
  employmentType: "employee" | "intern";
  hireDate: string | null;
  endDate: string | null;
  source: "excel" | "manual" | "hr_sync";
  trainingRequired: boolean;
  mustChangePassword: boolean;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  roles: Role[];
  scopeOrgUnitIds: string[];
};

export async function getPerson(actor: Actor, userId: string): Promise<PersonDetail> {
  assertCan(actor, "people.view");
  const [row] = await db()
    .select({ p: personnel, orgUnitId: positions.orgUnitId })
    .from(personnel)
    .leftJoin(positions, eq(positions.id, personnel.positionId))
    .where(eq(personnel.userId, userId))
    .limit(1);
  if (!row) throw new NotFoundError("person");
  const scope = await orgScopeFor(actor);
  if (!scope.all && !inOrgScope(scope, row.orgUnitId)) throw new NotFoundError("person");

  const [roleRows, scopeRows] = await Promise.all([
    db().select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId)),
    db().select({ orgUnitId: roleScopes.orgUnitId }).from(roleScopes).where(eq(roleScopes.userId, userId)),
  ]);
  const p = row.p;
  return {
    userId: p.userId,
    sicilNo: p.sicilNo,
    fullName: p.fullName,
    status: p.status,
    positionId: p.positionId,
    positionOrgUnitId: row.orgUnitId,
    nationalIdMasked: p.nationalIdMasked,
    phone: p.phone,
    email: p.email,
    employmentType: p.employmentType,
    hireDate: p.hireDate,
    endDate: p.endDate,
    source: p.source,
    trainingRequired: p.trainingRequired,
    mustChangePassword: p.mustChangePassword,
    lockedUntil: p.lockedUntil,
    lastLoginAt: p.lastLoginAt,
    roles: roleRows.map((r) => r.role),
    scopeOrgUnitIds: scopeRows.map((s) => s.orgUnitId),
  };
}

export type PersonInput = {
  fullName: string;
  positionId?: string | null;
  nationalId?: string | null;
  phone?: string | null;
  email?: string | null;
  employmentType: "employee" | "intern";
  hireDate?: string | null;
  trainingRequired: boolean;
};

async function assertActivePosition(positionId: string | null | undefined) {
  if (!positionId) return;
  const [pos] = await db().select({ status: positions.status }).from(positions).where(eq(positions.id, positionId)).limit(1);
  if (!pos) throw new NotFoundError("position");
  if (pos.status !== "active") throw new ValidationError("position_inactive");
}

function protectOrThrow(raw: string | null | undefined) {
  if (!raw?.trim()) return null;
  const protectedId = protectNationalId(raw);
  if (!protectedId) throw new ValidationError("national_id_invalid");
  return protectedId;
}

function cleanOptional(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/** Telefon `+90…` biçiminde saklanır (karar #188); çözülemeyen numara hata verir. */
function cleanPhone(value: string | null | undefined): string | null {
  const raw = cleanOptional(value);
  if (!raw) return null;
  const phone = normalizePhone(raw);
  if (!phone) throw new ValidationError("phone_invalid");
  return phone;
}

/**
 * Yeni personel (elle). Hesap şifresiz açılır ve seçilen kanaldan davet verilir (kararlar #185–188);
 * kişi şifresini etkinleştirirken kendisi belirler. Davet bilgisi (bağlantı/kod) yalnızca bu çağrının sonucunda döner.
 */
export async function createPerson(
  actor: Actor,
  input: PersonInput & { sicilNo: string; channel: InviteChannel },
): Promise<IssuedInvite> {
  assertCan(actor, "people.manage");
  await assertActivePosition(input.positionId);
  const nationalId = protectOrThrow(input.nationalId);
  const phone = cleanPhone(input.phone);
  const prepared = await prepareInvitedAccount({
    sicilNo: input.sicilNo,
    fullName: input.fullName,
    positionId: input.positionId ?? null,
    nationalId,
    phone,
    email: cleanOptional(input.email)?.toLowerCase() ?? null,
    employmentType: input.employmentType,
    hireDate: input.hireDate || null,
    source: "manual",
    trainingRequired: input.trainingRequired,
  });
  const [existing] = await db().select({ id: users.id }).from(users).where(eq(users.username, prepared.sicilNo)).limit(1);
  if (existing) throw new ValidationError("sicil_taken");
  const createdBy = actor.kind === "user" ? actor.userId : null;
  try {
    return await withActor(actor, async (tx) => {
      const userId = await insertAccount(tx, prepared, createdBy);
      return issueInvitation(tx, { userId, channel: input.channel, createdBy });
    });
  } catch (err) {
    if (/national_?id/i.test(uniqueViolation(err) ?? "")) throw new ValidationError("national_id_taken");
    throw err;
  }
}

/** Personel bilgilerini günceller. TC alanı boş bırakılırsa mevcut değer korunur. */
export async function updatePerson(actor: Actor, userId: string, input: PersonInput): Promise<void> {
  assertCan(actor, "people.manage");
  await assertActivePosition(input.positionId);
  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  if (fullName.length < 2) throw new ValidationError("invalid_full_name");
  const nationalId = protectOrThrow(input.nationalId);
  const phone = cleanPhone(input.phone);

  try {
    await withActor(actor, async (tx) => {
      const updated = await tx
        .update(personnel)
        .set({
          fullName,
          positionId: input.positionId ?? null,
          phone,
          email: cleanOptional(input.email)?.toLowerCase() ?? null,
          employmentType: input.employmentType,
          hireDate: input.hireDate || null,
          trainingRequired: input.trainingRequired,
          ...(nationalId
            ? { nationalIdEnc: nationalId.enc, nationalIdHmac: nationalId.hmac, nationalIdMasked: nationalId.masked }
            : {}),
        })
        .where(eq(personnel.userId, userId))
        .returning({ userId: personnel.userId });
      if (updated.length === 0) throw new NotFoundError("person");
      await tx.update(users).set({ name: fullName }).where(eq(users.id, userId));
      // E-postayla giriş yapan rollerde e-posta kayıtlı ve tekil kalmalı (karar #189)
      const roles = await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
      if (roles.some((r) => (EMAIL_LOGIN_ROLES as readonly string[]).includes(r.role))) await assertLoginEmailUsable(userId, tx);
      // Pozisyon değiştiyse atama yenilenir (FG-3.3); eğitimi gerekene plan atanır (FG-3.2)
      await syncAssignmentForPerson(tx, userId, actor.kind === "user" ? actor.userId : null);
    });
  } catch (err) {
    if (/national_?id/i.test(uniqueViolation(err) ?? "")) throw new ValidationError("national_id_taken");
    throw err;
  }
}

/** Durum değişikliği. Pasif/çıkış yapan personelin tüm oturumları kapanır. Kişi kendini pasife alamaz. */
export async function setPersonStatus(
  actor: Actor,
  userId: string,
  input: { status: PersonStatus; endDate?: string | null },
): Promise<void> {
  assertCan(actor, "people.manage");
  if (actor.kind === "user" && actor.userId === userId && input.status !== "active") {
    throw new ValidationError("cannot_deactivate_self");
  }
  if (input.status === "terminated" && !input.endDate) throw new ValidationError("end_date_required");
  if (input.status !== "active") {
    const own = await db().select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
    // Son aktif üst yönetici pasife alınamaz (karar #193); üst yöneticiyi yalnızca üst yönetici pasife alır
    if (own.some((r) => r.role === "owner")) {
      if (!isOwner(actor) && actor.kind !== "system") throw new ValidationError("owner_only");
      if ((await activeRoleCount("owner")) <= 1) throw new ValidationError("last_owner");
    }
  }

  await withActor(actor, async (tx) => {
    const updated = await tx
      .update(personnel)
      .set({
        status: input.status,
        endDate: input.status === "terminated" ? input.endDate! : input.status === "active" ? null : undefined,
      })
      .where(eq(personnel.userId, userId))
      .returning({ userId: personnel.userId });
    if (updated.length === 0) throw new NotFoundError("person");
    if (input.status !== "active") await tx.delete(sessions).where(eq(sessions.userId, userId));
  });
}

/** Tam TC kimlik numarasını gösterir. Yalnızca İK; her görüntüleme data_access_log'a yazılır (KVKK). */
export async function revealNationalId(actor: Actor, userId: string): Promise<string | null> {
  assertCan(actor, "people.view_national_id");
  assertUser(actor);
  const [row] = await db()
    .select({ enc: personnel.nationalIdEnc })
    .from(personnel)
    .where(eq(personnel.userId, userId))
    .limit(1);
  if (!row) throw new NotFoundError("person");
  if (!row.enc) return null;
  const plain = decryptNationalId(row.enc);
  await withActor(actor, (tx) =>
    tx.insert(dataAccessLog).values({ actorId: actor.userId, subjectUserId: userId, field: "national_id" }),
  );
  return plain;
}

/** Kişinin kendi pozisyonu ve birimi (profil sayfası). Yalnızca kendi kaydı için çağrılır. */
export async function getOwnPlacement(
  actor: Actor,
): Promise<{ positionName: string; unitPath: string } | null> {
  assertUser(actor);
  const [row] = await db()
    .select({ positionName: positions.name, unitId: positions.orgUnitId })
    .from(personnel)
    .innerJoin(positions, eq(positions.id, personnel.positionId))
    .where(eq(personnel.userId, actor.userId))
    .limit(1);
  if (!row) return null;
  const [unit] = await db().select().from(orgUnits).where(eq(orgUnits.id, row.unitId)).limit(1);
  const [parent] = unit?.parentId
    ? await db().select({ name: orgUnits.name }).from(orgUnits).where(eq(orgUnits.id, unit.parentId)).limit(1)
    : [];
  return { positionName: row.positionName, unitPath: [parent?.name, unit?.name].filter(Boolean).join(" / ") };
}

/** İK veya sistem yöneticisi mi (yönetim ekranı kısayolları için). */
export function canManagePeople(actor: Actor): boolean {
  return hasRole(actor, "hr") || hasRole(actor, "sysadmin");
}
