import { and, count, eq, gt, inArray, notInArray, sql } from "drizzle-orm";
import { getAuth } from "@/server/auth/auth";
import { checkPassword, type PasswordIssue } from "@/server/auth/password-policy";
import { systemActor, type UserActor } from "@/server/authz/actor";
import { effectiveRoles, isRole, type Role } from "@/server/authz/roles";
import { db } from "@/server/db/client";
import { loginAttempts, personnel, sessions, userRoles, users } from "@/server/db/schema";
import { EMAIL_LOGIN_ROLES } from "@/server/services/roles";
import { withActor } from "@/server/db/with-actor";
import { ValidationError } from "@/server/errors";
import { logger } from "@/server/logger";
import { getSetting, getSettings } from "@/server/services/settings";
import { toAppLocale, type AppLocale } from "@/lib/locale";

const authActor = systemActor("auth");
/** last_seen_at en fazla bu sıklıkta güncellenir (gereksiz yazmayı önler). */
const LAST_SEEN_THROTTLE_MS = 60_000;

export type RequestMeta = { headers: Headers; ip: string | null; userAgent: string | null };

export type SignInResult =
  | { ok: true; setCookieHeaders: Headers; mustChangePassword: boolean; locale: AppLocale }
  | { ok: false; reason: "invalid_credentials" | "locked" | "inactive" | "rate_limited"; lockedUntil?: Date };

type AttemptResult = (typeof loginAttempts.$inferInsert)["result"];

export async function recordAttempt(
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

/** Aynı IP'den son `auth.ip_window_min` içinde `auth.ip_max_failures` başarısız deneme (giriş veya davet kodu) var mı. */
export async function isIpBlocked(ip: string | null): Promise<boolean> {
  if (!ip) return false;
  const cfg = await getSettings(["auth.ip_max_failures", "auth.ip_window_min"]);
  const since = new Date(Date.now() - cfg["auth.ip_window_min"] * 60_000);
  const [row] = await db()
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), notInArray(loginAttempts.result, ["success", "activated"]), gt(loginAttempts.at, since)));
  return (row?.n ?? 0) >= cfg["auth.ip_max_failures"];
}

/**
 * Girişte yazılan değeri sicil no'ya çevirir. `@` içeriyorsa ve e-postayla giriş rolündeki (owner, sysadmin, hr)
 * tek bir kişiye aitse o kişinin sicili döner (karar #189); değilse null (bilinmeyen kullanıcı gibi davranılır).
 */
async function resolveLoginId(input: string): Promise<string | null> {
  if (!input.includes("@")) return input;
  const email = input.toLowerCase();
  const rows = await db()
    .selectDistinct({ sicilNo: personnel.sicilNo })
    .from(personnel)
    .innerJoin(userRoles, eq(userRoles.userId, personnel.userId))
    .where(and(sql`lower(${personnel.email}) = ${email}`, inArray(userRoles.role, [...EMAIL_LOGIN_ROLES])));
  return rows.length === 1 ? rows[0]!.sicilNo : null;
}

/**
 * Sicil no (yöneticide e-posta da olabilir) + şifre ile giriş (SPEC 11.4).
 * Sıra: IP sınırı → hesap kilidi → şifre doğrulama → hesap durumu.
 * Başarılı olursa istemciye yazılacak Set-Cookie başlıklarını döner.
 */
export async function signIn(
  input: { sicilNo: string; password: string; sharedDevice: boolean },
  meta: RequestMeta,
): Promise<SignInResult> {
  const loginInput = input.sicilNo.trim();
  const cfg = await getSettings(["auth.lockout_attempts", "auth.lockout_min"]);
  const now = new Date();

  if (await isIpBlocked(meta.ip)) {
    await recordAttempt(loginInput, "rate_limited", meta);
    return { ok: false, reason: "rate_limited" };
  }

  const sicilNo = await resolveLoginId(loginInput);
  if (!sicilNo) {
    await recordAttempt(loginInput, "unknown_user", meta);
    return { ok: false, reason: "invalid_credentials" };
  }

  const [person] = await db()
    .select({
      userId: personnel.userId,
      status: personnel.status,
      lockedUntil: personnel.lockedUntil,
      failedLoginCount: personnel.failedLoginCount,
      mustChangePassword: personnel.mustChangePassword,
      locale: personnel.locale,
    })
    .from(personnel)
    .innerJoin(users, eq(users.id, personnel.userId))
    .where(eq(users.username, sicilNo))
    .limit(1);

  if (!person) {
    await recordAttempt(loginInput, "unknown_user", meta);
    return { ok: false, reason: "invalid_credentials" };
  }

  if (person.lockedUntil && person.lockedUntil > now) {
    await recordAttempt(loginInput, "locked", meta, person.userId);
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
    await recordAttempt(loginInput, "bad_password", meta, person.userId);
    return lock && lockedUntil
      ? { ok: false, reason: "locked", lockedUntil }
      : { ok: false, reason: "invalid_credentials" };
  }

  const token = signInResult.response.token;

  if (person.status !== "active") {
    // Şifre doğru ama hesap aktif değil: açılan oturum hemen kapatılır.
    await withActor(authActor, (tx) => tx.delete(sessions).where(eq(sessions.token, token)));
    await recordAttempt(loginInput, "inactive", meta, person.userId);
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
  await recordAttempt(loginInput, "success", meta, person.userId);

  return {
    ok: true,
    setCookieHeaders: signInResult.headers,
    mustChangePassword: person.mustChangePassword,
    locale: toAppLocale(person.locale),
  };
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
  /** Geçerli roller (`owner` ise bütün roller, karar #192). */
  roles: Role[];
  /** Kişiye atanmış roller (profilde gösterilir). */
  baseRoles: Role[];
  mustChangePassword: boolean;
  sharedDevice: boolean;
  /** Arayüz dili tercihi (karar #207). */
  locale: AppLocale;
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
      locale: personnel.locale,
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

  const baseRoles = roleRows.map((r) => r.role).filter(isRole);
  return {
    userId: row.userId,
    sessionId: row.sessionId,
    sicilNo: row.sicilNo,
    fullName: row.fullName,
    roles: effectiveRoles(baseRoles),
    baseRoles,
    mustChangePassword: row.mustChangePassword,
    sharedDevice: row.sharedDevice,
    locale: toAppLocale(row.locale),
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
      .set({ mustChangePassword: false, passwordChangedAt: new Date(), activatedAt: sql`coalesce(${personnel.activatedAt}, now())` })
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

/** Kişinin arayüz dili tercihini kaydeder (karar #207). Yalnızca kendi tercihi. */
export async function setPreferredLocale(user: SessionUser, locale: AppLocale): Promise<void> {
  await withActor(toActor(user), (tx) => tx.update(personnel).set({ locale }).where(eq(personnel.userId, user.userId)));
}

export function toActor(user: SessionUser): UserActor {
  return { kind: "user", userId: user.userId, roles: user.roles, baseRoles: user.baseRoles };
}
