import { and, desc, eq, inArray, isNotNull, isNull, lt, type SQL } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertUser, isOwner } from "@/server/authz/policy";
import { orgScopeFor } from "@/server/authz/scope";
import { decryptInviteLink } from "@/server/crypto/invite-link";
import { db } from "@/server/db/client";
import {
  accountInvitations,
  accounts,
  importRows,
  invitationBatches,
  orgUnits,
  personnel,
  positions,
  sessions,
  userRoles,
  users,
} from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import {
  accountState,
  type AccountState,
  type InviteBatchMode,
  type InviteChannel,
  isInvitationOpen,
  pickChannel,
} from "@/server/state/invitations";
import { inviteMailEnabled, inviteWhatsappUrl, issueInvitation, type IssuedInvite, unusablePasswordHash } from "./invitations";
import { getSettings } from "./settings";

/**
 * Toplu davet (iş paketi 2.6c, kararlar #198–201): hesap açma ile davet ayrıdır. Davetler ekranında etkinleşmemiş
 * personel seçilir, kanal kipiyle (akıllı ya da tek kanal) tek işlemde davet edilir; WhatsApp davetleri bir gönderim
 * listesi olarak sonradan da açılabilir.
 */

export type InviteeFilter = {
  state?: "not_invited" | "invite_pending" | "invite_expired" | "not_activated";
  orgUnitId?: string;
  importBatchId?: string;
  q?: string;
};

export type InviteeRow = {
  userId: string;
  sicilNo: string;
  fullName: string;
  positionName: string | null;
  unitName: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
  state: AccountState;
  channel: InviteChannel | null;
  expiresAt: Date | null;
};

const LIST_LIMIT = 1000;

/** Davetler ekranı: etkinleşmemiş aktif personel ve son davet durumu (karar #199). */
export async function listInvitees(actor: Actor, filter: InviteeFilter = {}): Promise<InviteeRow[]> {
  assertCan(actor, "people.manage");
  const scope = await orgScopeFor(actor);
  const conds: SQL[] = [eq(personnel.status, "active"), isNull(personnel.activatedAt)];
  if (!scope.all) {
    if (scope.orgUnitIds.size === 0) return [];
    conds.push(inArray(positions.orgUnitId, [...scope.orgUnitIds]));
  }
  if (filter.orgUnitId) {
    const children = await db().select({ id: orgUnits.id }).from(orgUnits).where(eq(orgUnits.parentId, filter.orgUnitId));
    conds.push(inArray(positions.orgUnitId, [filter.orgUnitId, ...children.map((c) => c.id)]));
  }
  if (filter.importBatchId) {
    conds.push(
      inArray(
        personnel.userId,
        db()
          .select({ id: importRows.userId })
          .from(importRows)
          .where(and(eq(importRows.batchId, filter.importBatchId), eq(importRows.status, "created"), isNotNull(importRows.userId))),
      ),
    );
  }
  const people = await db()
    .select({
      userId: personnel.userId,
      sicilNo: personnel.sicilNo,
      fullName: personnel.fullName,
      email: personnel.email,
      phone: personnel.phone,
      mustChangePassword: personnel.mustChangePassword,
      positionName: positions.name,
      unitName: orgUnits.name,
    })
    .from(personnel)
    .leftJoin(positions, eq(positions.id, personnel.positionId))
    .leftJoin(orgUnits, eq(orgUnits.id, positions.orgUnitId))
    .where(and(...conds))
    .orderBy(personnel.fullName)
    .limit(LIST_LIMIT);
  if (people.length === 0) return [];

  const invites = await db()
    .select()
    .from(accountInvitations)
    .where(inArray(accountInvitations.userId, people.map((p) => p.userId)))
    .orderBy(desc(accountInvitations.createdAt));
  const latest = new Map<string, (typeof invites)[number]>();
  for (const i of invites) if (!latest.has(i.userId)) latest.set(i.userId, i);
  const { "auth.invite_code_attempts": maxAttempts } = await getSettings(["auth.invite_code_attempts"]);
  const now = new Date();
  const q = filter.q?.trim().toLocaleLowerCase("tr");

  return people
    .map((p) => {
      const inv = latest.get(p.userId) ?? null;
      const state = accountState({ activatedAt: null, mustChangePassword: p.mustChangePassword, latestInvite: inv, now, maxAttempts });
      return {
        userId: p.userId,
        sicilNo: p.sicilNo,
        fullName: p.fullName,
        positionName: p.positionName,
        unitName: p.unitName,
        hasEmail: !!p.email,
        hasPhone: !!p.phone,
        state,
        channel: state === "invite_pending" ? (inv?.channel ?? null) : null,
        expiresAt: state === "invite_pending" ? (inv?.expiresAt ?? null) : null,
      };
    })
    .filter((r) => !filter.state || r.state === filter.state)
    .filter((r) => !q || r.fullName.toLocaleLowerCase("tr").includes(q) || r.sicilNo.toLocaleLowerCase("tr").includes(q));
}

export type BatchResult = {
  batchId: string;
  counts: { email: number; whatsapp: number; print: number; skipped: number };
  /** Basılı davetler: kağıt PDF'i yalnızca bu çağrının sonucunda üretilir (saklanmaz). */
  printed: IssuedInvite[];
};

/**
 * Seçilen kişilere tek işlemde davet (karar #200). Etkinleşmiş, aktif olmayan, kendisi olan ya da (owner değilken)
 * üst yönetici olan kişiler atlanır. Açık daveti olanın eski daveti iptal edilir.
 */
export async function createInvitationBatch(
  actor: Actor,
  input: { userIds: readonly string[]; mode: InviteBatchMode },
): Promise<BatchResult> {
  assertCan(actor, "people.manage");
  assertUser(actor);
  const ids = [...new Set(input.userIds)];
  const { "auth.invite_batch_max": max } = await getSettings(["auth.invite_batch_max"]);
  if (ids.length === 0) throw new ValidationError("invite_batch_empty");
  if (ids.length > max) throw new ValidationError("invite_batch_too_large", { max });

  const scope = await orgScopeFor(actor);
  const rows = await db()
    .select({
      userId: personnel.userId,
      email: personnel.email,
      phone: personnel.phone,
      status: personnel.status,
      activatedAt: personnel.activatedAt,
      mustChangePassword: personnel.mustChangePassword,
      orgUnitId: positions.orgUnitId,
    })
    .from(personnel)
    .leftJoin(positions, eq(positions.id, personnel.positionId))
    .where(inArray(personnel.userId, ids));
  const owners = new Set(
    (await db().select({ userId: userRoles.userId }).from(userRoles).where(and(inArray(userRoles.userId, ids), eq(userRoles.role, "owner")))).map(
      (r) => r.userId,
    ),
  );
  const eligible = rows.filter(
    (r) =>
      r.status === "active" &&
      !r.activatedAt &&
      r.userId !== actor.userId &&
      (isOwner(actor) || !owners.has(r.userId)) &&
      (scope.all || (!!r.orgUnitId && scope.orgUnitIds.has(r.orgUnitId))),
  );
  if (eligible.length === 0) throw new ValidationError("invite_batch_empty");

  const mailEnabled = inviteMailEnabled();
  const plan = eligible.map((r) => ({ ...r, channel: pickChannel(input.mode, r, mailEnabled) }));
  const counts = {
    email: plan.filter((p) => p.channel === "email").length,
    whatsapp: plan.filter((p) => p.channel === "whatsapp").length,
    print: plan.filter((p) => p.channel === "print").length,
    skipped: ids.length - eligible.length,
  };
  // 2.6b'den önce geçici şifreyle açılmış hesapların bilinen şifresi geçersiz kılınır
  const legacy = plan.filter((p) => p.mustChangePassword);
  const hashes = new Map(await Promise.all(legacy.map(async (p) => [p.userId, await unusablePasswordHash()] as const)));

  return withActor(actor, async (tx) => {
    const [batch] = await tx
      .insert(invitationBatches)
      .values({
        mode: input.mode,
        total: plan.length,
        emailCount: counts.email,
        whatsappCount: counts.whatsapp,
        printCount: counts.print,
        createdBy: actor.userId,
      })
      .returning({ id: invitationBatches.id });
    const printed: IssuedInvite[] = [];
    for (const p of plan) {
      const issued = await issueInvitation(tx, { userId: p.userId, channel: p.channel, createdBy: actor.userId, batchId: batch!.id });
      if (issued.channel === "print") printed.push(issued);
      const hash = hashes.get(p.userId);
      if (hash) {
        await tx.update(accounts).set({ password: hash }).where(and(eq(accounts.userId, p.userId), eq(accounts.providerId, "credential")));
        await tx.update(personnel).set({ mustChangePassword: false }).where(eq(personnel.userId, p.userId));
        await tx.delete(sessions).where(eq(sessions.userId, p.userId));
      }
    }
    return { batchId: batch!.id, counts, printed };
  });
}

export type BatchInviteState = "open" | "used" | "revoked" | "expired";

export type BatchView = {
  id: string;
  mode: InviteBatchMode;
  createdAt: Date;
  createdByName: string;
  counts: { total: number; email: number; whatsapp: number; print: number };
  rows: {
    invitationId: string;
    userId: string;
    sicilNo: string;
    fullName: string;
    channel: InviteChannel;
    state: BatchInviteState;
    sharedAt: Date | null;
    expiresAt: Date;
    /** Yalnızca açık WhatsApp davetinde: İK'nın cihazında açılacak bağlantı */
    whatsappUrl: string | null;
  }[];
};

/** WhatsApp gönderim listesi ve grup özeti; davet süresi boyunca tekrar açılabilir (karar #201). */
export async function getInvitationBatch(actor: Actor, batchId: string): Promise<BatchView> {
  assertCan(actor, "people.manage");
  const [batch] = await db()
    .select({ b: invitationBatches, createdByName: users.name })
    .from(invitationBatches)
    .innerJoin(users, eq(users.id, invitationBatches.createdBy))
    .where(eq(invitationBatches.id, batchId))
    .limit(1);
  if (!batch) throw new NotFoundError("invitation_batch");
  const scope = await orgScopeFor(actor);
  const rows = await db()
    .select({
      i: accountInvitations,
      sicilNo: personnel.sicilNo,
      fullName: personnel.fullName,
      phone: personnel.phone,
      orgUnitId: positions.orgUnitId,
    })
    .from(accountInvitations)
    .innerJoin(personnel, eq(personnel.userId, accountInvitations.userId))
    .leftJoin(positions, eq(positions.id, personnel.positionId))
    .where(eq(accountInvitations.batchId, batchId))
    .orderBy(personnel.fullName);
  const visible = rows.filter((r) => scope.all || (!!r.orgUnitId && scope.orgUnitIds.has(r.orgUnitId)));
  const s = await getSettings(["auth.invite_code_attempts", "auth.invite_valid_hours"]);
  const now = new Date();
  return {
    id: batch.b.id,
    mode: batch.b.mode,
    createdAt: batch.b.createdAt,
    createdByName: batch.createdByName,
    counts: { total: batch.b.total, email: batch.b.emailCount, whatsapp: batch.b.whatsappCount, print: batch.b.printCount },
    rows: visible.map(({ i, sicilNo, fullName, phone }) => {
      const state: BatchInviteState = i.usedAt
        ? "used"
        : i.revokedAt
          ? "revoked"
          : isInvitationOpen(i, now, s["auth.invite_code_attempts"])
            ? "open"
            : "expired";
      const link = state === "open" && i.channel === "whatsapp" && i.linkEnc && phone ? decryptInviteLink(i.linkEnc) : null;
      return {
        invitationId: i.id,
        userId: i.userId,
        sicilNo,
        fullName,
        channel: i.channel,
        state,
        sharedAt: i.sharedAt,
        expiresAt: i.expiresAt,
        whatsappUrl: link && phone ? inviteWhatsappUrl({ phone, fullName, url: link, hours: s["auth.invite_valid_hours"] }) : null,
      };
    }),
  };
}

/** İK "WhatsApp'ta gönder"e bastı: satır "gönderildi" işaretlenir (ilk basış zamanı korunur). */
export async function markInviteShared(actor: Actor, invitationId: string): Promise<void> {
  assertCan(actor, "people.manage");
  const [row] = await db()
    .select({ batchId: accountInvitations.batchId, channel: accountInvitations.channel })
    .from(accountInvitations)
    .where(eq(accountInvitations.id, invitationId))
    .limit(1);
  if (!row?.batchId) throw new NotFoundError("invitation");
  if (row.channel !== "whatsapp") throw new ForbiddenError("people.manage");
  await withActor(actor, (tx) =>
    tx
      .update(accountInvitations)
      .set({ sharedAt: new Date() })
      .where(and(eq(accountInvitations.id, invitationId), isNull(accountInvitations.sharedAt))),
  );
}

export type BatchSummary = { id: string; createdAt: Date; createdByName: string; total: number; whatsapp: number; open: number; shared: number };

/** Son davet grupları (Davetler ekranında "kaldığım yerden devam"). */
export async function recentInvitationBatches(actor: Actor, limit = 10): Promise<BatchSummary[]> {
  assertCan(actor, "people.manage");
  const batches = await db()
    .select({ b: invitationBatches, createdByName: users.name })
    .from(invitationBatches)
    .innerJoin(users, eq(users.id, invitationBatches.createdBy))
    .orderBy(desc(invitationBatches.createdAt))
    .limit(limit);
  if (batches.length === 0) return [];
  const invites = await db()
    .select({
      batchId: accountInvitations.batchId,
      channel: accountInvitations.channel,
      usedAt: accountInvitations.usedAt,
      revokedAt: accountInvitations.revokedAt,
      expiresAt: accountInvitations.expiresAt,
      failedAttempts: accountInvitations.failedAttempts,
      sharedAt: accountInvitations.sharedAt,
    })
    .from(accountInvitations)
    .where(inArray(accountInvitations.batchId, batches.map((b) => b.b.id)));
  const { "auth.invite_code_attempts": maxAttempts } = await getSettings(["auth.invite_code_attempts"]);
  const now = new Date();
  return batches.map(({ b, createdByName }) => {
    const mine = invites.filter((i) => i.batchId === b.id && i.channel === "whatsapp");
    return {
      id: b.id,
      createdAt: b.createdAt,
      createdByName,
      total: b.total,
      whatsapp: b.whatsappCount,
      open: mine.filter((i) => isInvitationOpen(i, now, maxAttempts)).length,
      shared: mine.filter((i) => i.sharedAt).length,
    };
  });
}

/** Gece işi: süresi dolan davetlerin saklanan bağlantıları silinir (karar #201). */
export async function purgeExpiredInviteLinks(actor: Actor, now: Date = new Date()): Promise<number> {
  return withActor(actor, async (tx) => {
    const rows = await tx
      .update(accountInvitations)
      .set({ linkEnc: null })
      .where(and(isNotNull(accountInvitations.linkEnc), lt(accountInvitations.expiresAt, now)))
      .returning({ id: accountInvitations.id });
    return rows.length;
  });
}
