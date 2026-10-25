import { getSessionCookie } from "better-auth/cookies";
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { AUTH_COOKIE_PREFIX, PUBLIC_PATHS } from "@/server/auth/constants";

const handleI18n = createMiddleware(routing);

function splitLocale(pathname: string): { prefix: string; path: string } {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      return { prefix: `/${locale}`, path: pathname.slice(locale.length + 1) || "/" };
    }
  }
  return { prefix: "", path: pathname };
}

/**
 * İyimser yönlendirme: oturum çerezi yoksa giriş sayfasına gönderir.
 * Bu bir yetki kontrolü DEĞİLDİR; asıl kontrol sunucu tarafında (requireUser / servisler) yapılır.
 */
export default function proxy(request: NextRequest) {
  const { prefix, path } = splitLocale(request.nextUrl.pathname);
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!isPublic && !getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX })) {
    const url = request.nextUrl.clone();
    url.pathname = `${prefix}/login`;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return handleI18n(request);
}

export const config = {
  // API rotaları, Next iç dosyaları ve uzantılı statik dosyalar hariç
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
