import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertUser } from "@/server/authz/policy";
import { db, type DbOrTx } from "@/server/db/client";
import { blacklistEntries, users } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { NotFoundError, ValidationError } from "@/server/errors";
import { todayIn } from "@/lib/dates";
import { isBlacklistActive } from "@/server/state/visits";
import { notify, usersWithRole } from "../notifications";
import { getSetting } from "../settings";
import { protectVisitorId, type VisitorIdInput } from "./identity";

/**
 * Kara liste / giriş yasağı (FG-8.4, karar #131): yalnızca İSG uzmanı ve güvenlik.
 * Eşleşme kimlik no özetiyle (HMAC). Kayıt değiştirilemez; kaldırma gerekçeli ve bir kez.
 */

const createdByUser = alias(users, "bl_created_by");
const liftedByUser = alias(users, "bl_lifted_by");

export async function listBlacklist(actor: Actor) {
  assertCan(actor, "blacklist.manage");
  const today = todayIn(await getSetting("org.timezone"));
  const rows = await db()
    .select({
      id: blacklistEntries.id,
      fullName: blacklistEntries.fullNameSnapshot,
      nationalIdMasked: blacklistEntries.nationalIdMasked,
      reason: blacklistEntries.reason,
      endsAt: blacklistEntries.endsAt,
      createdAt: blacklistEntries.createdAt,
      createdByName: createdByUser.name,
      liftedAt: blacklistEntries.liftedAt,
      liftedReason: blacklistEntries.liftedReason,
      liftedByName: liftedByUser.name,
    })
    .from(blacklistEntries)
    .innerJoin(createdByUser, eq(createdByUser.id, blacklistEntries.createdBy))
    .leftJoin(liftedByUser, eq(liftedByUser.id, blacklistEntries.liftedBy))
    .where(isNull(blacklistEntries.anonymizedAt))
    .orderBy(desc(blacklistEntries.createdAt));
  return rows.map((r) => ({ ...r, active: isBlacklistActive(r, today) }));
}

/** Verilen kimlik özetlerinden bugün kara listede olanlar. */
export async function activeBlacklistHmacs(hmacs: readonly string[], conn: DbOrTx = db()): Promise<Set<string>> {
  if (hmacs.length === 0) return new Set();
  const today = todayIn(await getSetting("org.timezone", conn));
  const rows = await conn
    .select({ hmac: blacklistEntries.nationalIdHmac, liftedAt: blacklistEntries.liftedAt, endsAt: blacklistEntries.endsAt })
    .from(blacklistEntries)
    .where(and(inArray(blacklistEntries.nationalIdHmac, [...hmacs]), isNull(blacklistEntries.liftedAt)));
  return new Set(rows.filter((r) => isBlacklistActive(r, today)).map((r) => r.hmac!));
}

export async function addToBlacklist(
  actor: Actor,
  input: VisitorIdInput & { fullName: string; reason: string; endsAt?: string | null },
): Promise<{ id: string }> {
  assertCan(actor, "blacklist.manage");
  assertUser(actor);
  const fullName = input.fullName.trim();
  const reason = input.reason.trim();
  if (fullName.length < 2 || fullName.length > 200) throw new ValidationError("invalid_name");
  if (reason.length < 10) throw new ValidationError("reason_required");
  const endsAt = input.endsAt || null;
  const today = todayIn(await getSetting("org.timezone"));
  if (endsAt && (!/^\d{4}-\d{2}-\d{2}$/.test(endsAt) || endsAt < today)) throw new ValidationError("invalid_date");
  const id = protectVisitorId(input);
  if ((await activeBlacklistHmacs([id.hmac])).size > 0) throw new ValidationError("blacklist_exists");

  return withActor(actor, async (tx) => {
    const [row] = await tx
      .insert(blacklistEntries)
      .values({ nationalIdHmac: id.hmac, nationalIdMasked: id.masked, fullNameSnapshot: fullName, reason, endsAt, createdBy: actor.userId })
      .returning({ id: blacklistEntries.id });
    // SPEC 10.2: İSG uzmanına bildirim (ekleyen hariç)
    await notify(tx, {
      kind: "blacklist_added",
      userIds: await usersWithRole(tx, "ohs_specialist"),
      exclude: [actor.userId],
      subjectKey: `blacklist:${row!.id}`,
      link: "/security/blacklist",
    });
    return { id: row!.id };
  });
}

export async function liftBlacklist(actor: Actor, id: string, reason: string): Promise<void> {
  assertCan(actor, "blacklist.manage");
  assertUser(actor);
  const text = reason.trim();
  if (text.length < 10) throw new ValidationError("reason_required");
  const [row] = await db().select().from(blacklistEntries).where(eq(blacklistEntries.id, id)).limit(1);
  if (!row || row.anonymizedAt) throw new NotFoundError("blacklist_entry");
  if (row.liftedAt) throw new ValidationError("already_lifted");
  await withActor(actor, (tx) =>
    tx
      .update(blacklistEntries)
      .set({ liftedAt: new Date(), liftedBy: actor.userId, liftedReason: text })
      .where(eq(blacklistEntries.id, id)),
  );
}
