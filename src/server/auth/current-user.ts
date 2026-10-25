import "server-only";
import { getLocale } from "next-intl/server";
import { headers } from "next/headers";
import { cache } from "react";
import { canSeeNav, type NavKey } from "@/features/app-shell/navigation";
import { redirect } from "@/i18n/navigation";
import { loadSessionUser, type SessionUser } from "@/server/services/auth";
import { getAuth } from "./auth";

/**
 * İstek başına bir kez oturumu okur (React cache). Oturumu okuyan bileşenler <Suspense> içinde olmalıdır.
 * "use cache: private" kullanılmaz: loadSessionUser son görülme zamanını yazar ve süresi dolan oturumu kapatır.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const result = await getAuth().api.getSession({
    headers: await headers(),
    query: { disableRefresh: true },
  });
  if (!result) return null;
  return loadSessionUser(result.session.id);
});

/** Oturum zorunlu sayfalar için. Şifre değiştirmesi gereken kullanıcı şifre sayfasına yönlendirilir. */
export async function requireUser(opts: { allowPasswordChange?: boolean } = {}): Promise<SessionUser> {
  const user = await getCurrentUser();
  const locale = await getLocale();
  if (!user) return redirect({ href: "/login", locale });
  if (user.mustChangePassword && !opts.allowPasswordChange) {
    return redirect({ href: "/change-password", locale });
  }
  return user;
}

/**
 * Menü bölümüne erişim. Yetkisi yoksa null döner; sayfa 404 görünümünü (NotFoundView) gösterir,
 * böylece bölümün varlığı belli edilmez. (Suspense içinde notFound() akış başladıktan sonra çalışmıyor.)
 */
export async function getSectionUser(key: NavKey): Promise<SessionUser | null> {
  const user = await requireUser();
  return canSeeNav(key, user.roles) ? user : null;
}
