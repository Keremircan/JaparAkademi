import { createHmac, randomInt } from "node:crypto";
import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertUser } from "@/server/authz/policy";
import { db, type Tx } from "@/server/db/client";
import { proctorCodeFailures, proctorSessions } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { env } from "@/server/env";
import { NotFoundError, ValidationError } from "@/server/errors";
import { getSettings } from "@/server/services/settings";

/**
 * Gözetmen kodu (SPEC Bölüm 6, karar #62): gözetmen 6 haneli, süreli kod üretir; kod süresi boyunca herhangi bir
 * sınavda kullanılabilir, denemeye gözetmen kimliği yazılır. Kodun kendisi saklanmaz (HMAC özeti).
 * Hatalı kod denemesi kursiyer başına sınırlıdır.
 */

function hashCode(code: string): string {
  return createHmac("sha256", env().BETTER_AUTH_SECRET).update(`proctor:${code}`).digest("base64url");
}

export async function issueProctorCode(actor: Actor, input: { location: string | null }): Promise<{ id: string; code: string; expiresAt: Date }> {
  assertUser(actor);
  assertCan(actor, "proctor.issue_code");
  const location = input.location?.trim() || null;
  if (location && location.length > 200) throw new ValidationError("location_invalid");
  const ttl = (await getSettings(["proctor.code_ttl_min"]))["proctor.code_ttl_min"];
  return withActor(actor, async (tx) => {
    const now = new Date();
    // Etkin oturumlarla çakışmayan kod
    for (let i = 0; i < 20; i++) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const codeHash = hashCode(code);
      const [clash] = await tx
        .select({ id: proctorSessions.id })
        .from(proctorSessions)
        .where(and(eq(proctorSessions.codeHash, codeHash), isNull(proctorSessions.revokedAt), gt(proctorSessions.expiresAt, now)))
        .limit(1);
      if (clash) continue;
      const expiresAt = new Date(now.getTime() + ttl * 60_000);
      const [row] = await tx.insert(proctorSessions).values({ proctorUserId: actor.userId, codeHash, location, expiresAt }).returning({ id: proctorSessions.id });
      return { id: row!.id, code, expiresAt };
    }
    throw new ValidationError("proctor_code_unavailable");
  });
}

export async function myProctorSessions(actor: Actor) {
  assertUser(actor);
  assertCan(actor, "proctor.issue_code");
  return db()
    .select({ id: proctorSessions.id, location: proctorSessions.location, createdAt: proctorSessions.createdAt, expiresAt: proctorSessions.expiresAt })
    .from(proctorSessions)
    .where(and(eq(proctorSessions.proctorUserId, actor.userId), isNull(proctorSessions.revokedAt), gt(proctorSessions.expiresAt, new Date())))
    .orderBy(desc(proctorSessions.createdAt));
}

export async function revokeProctorSession(actor: Actor, id: string): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    const rows = await tx
      .update(proctorSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(proctorSessions.id, id), eq(proctorSessions.proctorUserId, actor.userId), isNull(proctorSessions.revokedAt)))
      .returning({ id: proctorSessions.id });
    if (!rows.length) throw new NotFoundError("proctor_session");
  });
}

/**
 * Kursiyerin girdiği kodu doğrular. Kilitliyse veya kod geçersizse hata; hatalı deneme kaydedilir
 * (kayıt, sınav başlatma transaction'ı geri alınsa da kalsın diye ayrı transaction'da yazılır).
 */
export async function verifyProctorCode(tx: Tx, userId: string, code: string): Promise<{ sessionId: string; proctorUserId: string }> {
  const s = await getSettings(["proctor.code_max_failures", "proctor.code_lock_min"]);
  const since = new Date(Date.now() - s["proctor.code_lock_min"] * 60_000);
  const [failures] = await tx
    .select({ n: count() })
    .from(proctorCodeFailures)
    .where(and(eq(proctorCodeFailures.userId, userId), gt(proctorCodeFailures.at, since)));
  if (Number(failures?.n ?? 0) >= s["proctor.code_max_failures"]) throw new ValidationError("proctor_code_locked");

  const clean = code.replace(/\s/g, "");
  const [session] = /^\d{6}$/.test(clean)
    ? await tx
        .select({ id: proctorSessions.id, proctorUserId: proctorSessions.proctorUserId })
        .from(proctorSessions)
        .where(and(eq(proctorSessions.codeHash, hashCode(clean)), isNull(proctorSessions.revokedAt), gt(proctorSessions.expiresAt, new Date())))
        .limit(1)
    : [];
  // Gözetmen, sınava giren kişinin kendisi olamaz
  if (!session || session.proctorUserId === userId) {
    await recordFailure(userId);
    throw new ValidationError("proctor_code_invalid");
  }
  return { sessionId: session.id, proctorUserId: session.proctorUserId };
}

async function recordFailure(userId: string) {
  await withActor({ kind: "system", name: "exam:proctor" }, (tx) => tx.insert(proctorCodeFailures).values({ userId }));
}
