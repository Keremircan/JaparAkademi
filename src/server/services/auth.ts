import { and, count, eq, gt, ne } from "drizzle-orm";
import { getAuth } from "@/server/auth/auth";
import { checkPassword, type PasswordIssue } from "@/server/auth/password-policy";
import { systemActor, type UserActor } from "@/server/authz/actor";
import { isRole, type Role } from "@/server/authz/roles";
import { db } from "@/server/db/client";
import { loginAttempts, personnel, sessions, userRoles, users } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ValidationError } from "@/server/errors";
import { logger } from "@/server/logger";
import { getSetting, getSettings } from "@/server/services/settings";

const authActor = systemActor("auth");
/** last_seen_at en fazla bu sıklıkta güncellenir (gereksiz yazmayı önler). */
const LAST_SEEN_THROTTLE_MS = 60_000;

export type RequestMeta = { headers: Headers; ip: string | null; userAgent: string | null };

export type SignInResult =
  | { ok: true; setCookieHeaders: Headers; mustChangePassword: boolean }
  | { ok: false; reason: "invalid_credentials" | "locked" | "inactive" | "rate_limited"; lockedUntil?: Date };

type AttemptResult = (typeof loginAttempts.$inferInsert)["result"];

async function recordAttempt(
  sicilInput: string,
  result: AttemptResult,
  meta: RequestMeta,
  userId: string | null = null,
) {
  await withActor(userId ? userActorStub(userId) : authActor, (tx) =>
    tx.insert(loginAttempts).values({
      sicilInput: sicilInput.slice(0, 64),
      userId,
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 512) ?? null,
      result,
    }),
  );
}

/** Denetim kaydında aktör olarak yalnızca kullanıcı kimliği gerekir. */
function userActorStub(userId: string): UserActor {
  return { kind: "user", userId, roles: [] };
}

/**
 * Sicil no + şifre ile giriş (SPEC 11.4).
 * Sıra: IP sınırı → hesap kilidi → şifre doğrulama → hesap durumu.
 * Başarılı olursa istemciye yazılacak Set-Cookie başlıklarını döner.
 */
export async function signIn(
  input: { sicilNo: string; password: string; sharedDevice: boolean },
  meta: RequestMeta,
): Promise<SignInResult> {
  const sicilNo = input.sicilNo.trim();
  const cfg = await getSettings([
    "auth.lockout_attempts",
    "auth.lockout_min",
    "auth.ip_max_failures",
    "auth.ip_window_min",
  ]);
  const now = new Date();

  if (meta.ip) {
    const since = new Date(now.getTime() - cfg["auth.ip_window_min"] * 60_000);
    const [row] = await db()
      .select({ n: count() })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.ip, meta.ip), ne(loginAttempts.result, "success"), gt(loginAttempts.at, since)));
    if ((row?.n ?? 0) >= cfg["auth.ip_max_failures"]) {
      await recordAttempt(sicilNo, "rate_limited", meta);
      return { ok: false, reason: "rate_limited" };
    }
  }

  const [person] = await db()
    .select({
      userId: personnel.userId,
      status: personnel.status,
      lockedUntil: personnel.lockedUntil,
      failedLoginCount: personnel.failedLoginCount,
      mustChangePassword: personnel.mustChangePassword,
    })
    .from(personnel)
    .innerJoin(users, eq(users.id, personnel.userId))
    .where(eq(users.username, sicilNo))
    .limit(1);

  if (!person) {
    await recordAttempt(sicilNo, "unknown_user", meta);
    return { ok: false, reason: "invalid_credentials" };
  }

  if (person.lockedUntil && person.lockedUntil > now) {
    await recordAttempt(sicilNo, "locked", meta, person.userId);
    return { ok: false, reason: "locked", lockedUntil: person.lockedUntil };
  }

  let signInResult: Awaited<ReturnType<typeof callSignIn>>;
  try {
    signInResult = await callSignIn(sicilNo, input.password, !input.sharedDevice, meta.headers);
  } catch (err) {
    logger.debug({ err, sicilNo }, "Giriş başarısız");
    const failed = person.failedLoginCount + 1;
    const lock = failed >= cfg["auth.lockout_attempts"];
    const lockedUntil = lock ? new Date(now.getTime() + cfg["auth.lockout_min"] * 60_000) : null;
    await withActor(authActor, (tx) =>
      tx
        .update(personnel)
        .set({ failedLoginCount: lock ? 0 : failed, lockedUntil })
        .where(eq(personnel.userId, person.userId)),
    );
    await recordAttempt(sicilNo, "bad_password", meta, person.userId);
    return lock && lockedUntil
      ? { ok: false, reason: "locked", lockedUntil }
      : { ok: false, reason: "invalid_credentials" };
  }

  const token = signInResult.response.token;

  if (person.status !== "active") {
    // Şifre doğru ama hesap aktif değil: açılan oturum hemen kapatılır.
    await withActor(authActor, (tx) => tx.delete(sessions).where(eq(sessions.token, token)));
    await recordAttempt(sicilNo, "inactive", meta, person.userId);
    return { ok: false, reason: "inactive" };
  }

  await withActor(userActorStub(person.userId), async (tx) => {
    await tx
      .update(personnel)
      .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now })
      .where(eq(personnel.userId, person.userId));
    await tx
      .update(sessions)
      .set({ sharedDevice: input.sharedDevice, lastSeenAt: now })
      .where(eq(sessions.token, token));
  });
  await recordAttempt(sicilNo, "success", meta, person.userId);

  return { ok: true, setCookieHeaders: signInResult.headers, mustChangePassword: person.mustChangePassword };
}

function callSignIn(username: string, password: string, rememberMe: boolean, headers: Headers) {
  return getAuth().api.signInUsername({
    body: { username, password, rememberMe },
    headers,
    returnHeaders: true,
  });
}

export type SessionUser = {
  userId: string;
  sessionId: string;
  sicilNo: string;
  fullName: string;
  roles: Role[];
  mustChangePassword: boolean;
  sharedDevice: boolean;
};

/**
 * Better Auth oturumunu uygulama kullanıcısına çevirir ve oturum kurallarını uygular:
 * pasif personel ve süresi dolan (işlemsiz) oturumlar kapatılır.
 */
export async function loadSessionUser(sessionId: string): Promise<SessionUser | null> {
  const [row] = await db()
    .select({
      sessionId: sessions.id,
      userId: sessions.userId,
      sharedDevice: sessions.sharedDevice,
      lastSeenAt: sessions.lastSeenAt,
      sicilNo: personnel.sicilNo,
      fullName: personnel.fullName,
      status: personnel.status,
      mustChangePassword: personnel.mustChangePassword,
    })
    .from(sessions)
    .innerJoin(personnel, eq(personnel.userId, sessions.userId))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row) return null;

  const cfg = await getSettings(["session.shared_idle_min", "session.personal_days"]);
  const idleLimitMs = row.sharedDevice
    ? cfg["session.shared_idle_min"] * 60_000
    : cfg["session.personal_days"] * 24 * 60 * 60_000;
  const now = Date.now();
  const expired = now - row.lastSeenAt.getTime() > idleLimitMs;

  if (expired || row.status !== "active") {
    await withActor(authActor, (tx) => tx.delete(sessions).where(eq(sessions.id, row.sessionId)));
    return null;
  }

  if (now - row.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await db().update(sessions).set({ lastSeenAt: new Date(now) }).where(eq(sessions.id, row.sessionId));
  }

  const roleRows = await db()
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, row.userId));

  return {
    userId: row.userId,
    sessionId: row.sessionId,
    sicilNo: row.sicilNo,
    fullName: row.fullName,
    roles: roleRows.map((r) => r.role).filter(isRole),
    mustChangePassword: row.mustChangePassword,
    sharedDevice: row.sharedDevice,
  };
}

/**
 * Şifre değiştirme. Diğer tüm oturumlar kapatılır; mevcut cihaz için yeni oturum açılır
 * (ortak cihaz bilgisi korunur).
 */
export async function changePassword(
  user: SessionUser,
  input: { currentPassword: string; newPassword: string },
  meta: RequestMeta,
): Promise<{ setCookieHeaders: Headers }> {
  const minLength = await getSetting("auth.password_min_length");
  const issues: (PasswordIssue | "same_as_current")[] = checkPassword(input.newPassword, {
    minLength,
    sicilNo: user.sicilNo,
  });
  if (input.newPassword === input.currentPassword) issues.push("same_as_current");
  if (issues.length > 0) throw new ValidationError("weak_password", issues);

  let result;
  try {
    result = await getAuth().api.changePassword({
      body: {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        revokeOtherSessions: true,
      },
      headers: meta.headers,
      returnHeaders: true,
    });
  } catch (err) {
    logger.debug({ err, userId: user.userId }, "Şifre değiştirilemedi");
    throw new ValidationError("current_password_invalid");
  }

  const newToken = result.response.token;
  await withActor(userActorStub(user.userId), async (tx) => {
    await tx
      .update(personnel)
      .set({ mustChangePassword: false, passwordChangedAt: new Date() })
      .where(eq(personnel.userId, user.userId));
    if (newToken) {
      await tx
        .update(sessions)
        .set({ sharedDevice: user.sharedDevice, lastSeenAt: new Date() })
        .where(eq(sessions.token, newToken));
    }
  });

  return { setCookieHeaders: result.headers };
}

/** Oturumu kapatır; istemcideki çerezi silen başlıkları döner. */
export async function signOut(meta: RequestMeta): Promise<{ setCookieHeaders: Headers }> {
  const result = await getAuth().api.signOut({ headers: meta.headers, returnHeaders: true });
  return { setCookieHeaders: result.headers };
}

export function toActor(user: SessionUser): UserActor {
  return { kind: "user", userId: user.userId, roles: user.roles };
}
