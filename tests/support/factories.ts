import { systemActor, type UserActor } from "@/server/authz/actor";
import type { Role } from "@/server/authz/roles";
import { createAccount } from "@/server/services/accounts";
import type { RequestMeta } from "@/server/services/auth";

export const TEST_PASSWORD = "Kl8#mxPq2-test";

let counter = 0;

/** Test personeli oluşturur. Varsayılan: şifre değiştirme zorunlu değil. */
export async function createTestUser(
  opts: { roles?: Role[]; sicilNo?: string; mustChangePassword?: boolean; positionId?: string; trainingRequired?: boolean; hireDate?: string } = {},
) {
  counter += 1;
  const sicilNo = opts.sicilNo ?? `T${Date.now().toString(36)}${counter}`;
  const { userId } = await createAccount(systemActor("test"), {
    sicilNo,
    fullName: `Test Kişi ${counter}`,
    password: TEST_PASSWORD,
    roles: opts.roles,
    mustChangePassword: opts.mustChangePassword ?? false,
    positionId: opts.positionId ?? null,
    trainingRequired: opts.trainingRequired ?? false,
    hireDate: opts.hireDate ?? null,
  });
  const actor: UserActor = { kind: "user", userId, roles: ["personnel", ...(opts.roles ?? [])] };
  return { userId, sicilNo, actor };
}

export function meta(opts: { cookie?: string; ip?: string } = {}): RequestMeta {
  return {
    headers: new Headers(opts.cookie ? { cookie: opts.cookie } : {}),
    ip: opts.ip ?? "10.0.0.1",
    userAgent: "vitest",
  };
}

/** Set-Cookie başlıklarından tarayıcının göndereceği Cookie başlığını üretir. */
export function cookieHeader(setCookie: Headers): string {
  return setCookie
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
