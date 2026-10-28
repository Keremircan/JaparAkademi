import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertUser } from "@/server/authz/policy";
import { db } from "@/server/db/client";
import { devices, users } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { NotFoundError, ValidationError } from "@/server/errors";

/**
 * Ortak cihazlar (FG-4.1): sistem yöneticisinin kaydettiği tarayıcıda giriş her zaman "ortak cihaz" modundadır
 * (kısa işlemsizlik süresi, "beni hatırla" kapalı). Cihaz, tarayıcıdaki uzun ömürlü bir çerezle tanınır;
 * veritabanında belirtecin yalnızca özeti tutulur.
 */

export const DEVICE_COOKIE = "akademi_device";
export const DEVICE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

function hash(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export async function registerDevice(actor: Actor, input: { name: string; kind?: "shared_pc" | "kiosk" }): Promise<{ id: string; token: string }> {
  assertUser(actor);
  assertCan(actor, "devices.manage");
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 100) throw new ValidationError("device_name_invalid");
  const token = randomBytes(32).toString("base64url");
  const [row] = await withActor(actor, (tx) =>
    tx.insert(devices).values({ name, kind: input.kind ?? "shared_pc", tokenHash: hash(token), registeredBy: actor.userId }).returning({ id: devices.id }),
  );
  return { id: row!.id, token };
}

export async function revokeDevice(actor: Actor, id: string): Promise<void> {
  assertUser(actor);
  assertCan(actor, "devices.manage");
  await withActor(actor, async (tx) => {
    const rows = await tx
      .update(devices)
      .set({ revokedAt: new Date(), revokedBy: actor.userId })
      .where(and(eq(devices.id, id), isNull(devices.revokedAt)))
      .returning({ id: devices.id });
    if (rows.length === 0) throw new NotFoundError("device");
  });
}

export async function listDevices(actor: Actor) {
  assertCan(actor, "devices.manage");
  return db()
    .select({
      id: devices.id,
      name: devices.name,
      kind: devices.kind,
      createdAt: devices.createdAt,
      lastSeenAt: devices.lastSeenAt,
      revokedAt: devices.revokedAt,
      registeredByName: users.name,
    })
    .from(devices)
    .innerJoin(users, eq(users.id, devices.registeredBy))
    .orderBy(desc(devices.createdAt));
}

/** Çerezdeki belirteç kayıtlı ve iptal edilmemiş bir cihaza mı ait. */
export async function recognizeDevice(token: string | undefined | null): Promise<{ id: string; name: string } | null> {
  if (!token || token.length > 200) return null;
  const [row] = await db()
    .select({ id: devices.id, name: devices.name })
    .from(devices)
    .where(and(eq(devices.tokenHash, hash(token)), isNull(devices.revokedAt)))
    .limit(1);
  if (!row) return null;
  await db().update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, row.id));
  return row;
}

/** Kapı tableti (kiosk) olarak kayıtlı ve iptal edilmemiş cihaz (iş paketi 2.3a, karar #146). */
export async function recognizeKiosk(token: string | undefined | null): Promise<{ id: string; name: string } | null> {
  if (!token || token.length > 200) return null;
  const [row] = await db()
    .select({ id: devices.id, name: devices.name })
    .from(devices)
    .where(and(eq(devices.tokenHash, hash(token)), isNull(devices.revokedAt), eq(devices.kind, "kiosk")))
    .limit(1);
  return row ?? null;
}
