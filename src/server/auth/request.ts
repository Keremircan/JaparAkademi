import "server-only";
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import { cookies, headers } from "next/headers";
import type { RequestMeta } from "@/server/services/auth";
import { LOCALE_COOKIE, type AppLocale } from "@/lib/locale";

/**
 * İstek bilgisi. IP, ters vekil sunucunun (Caddy) eklediği X-Forwarded-For'un en sağındaki değerdir;
 * istemcinin gönderdiği soldaki değerlere güvenilmez.
 */
export async function getRequestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded ? (forwarded.split(",").at(-1)?.trim() ?? null) : h.get("x-real-ip");
  return { headers: new Headers(h), ip: ip || null, userAgent: h.get("user-agent") };
}

/** Better Auth'un döndürdüğü Set-Cookie başlıklarını Next.js yanıtına yazar (Server Action içinde). */
export async function applySetCookies(source: Headers): Promise<void> {
  const setCookie = source.get("set-cookie");
  if (!setCookie) return;
  const store = await cookies();
  for (const [name, attrs] of parseSetCookieHeader(setCookie)) {
    if (name) store.set(name, attrs.value, toCookieOptions(attrs));
  }
}

/** Dil tercihi çerezini yazar (girişte ve profilde tercih değişince; karar #207). */
export async function setLocaleCookie(locale: AppLocale): Promise<void> {
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}
