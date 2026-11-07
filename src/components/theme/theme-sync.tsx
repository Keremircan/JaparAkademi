"use client";

import { useLayoutEffect } from "react";
import { THEME_COLORS, THEME_SCRIPT, themeCookie, type Theme } from "@/lib/theme";

/**
 * Koyu/açık mod (iş paketi 3.12, kararlar #272–274).
 *
 * `ThemeScript`: oturum açık sayfaların başında, ilk çizimden önce çerezdeki tercihi uygular (tam yüklemede
 * beyaz parlama olmaz). Sunucuda `text/javascript`, istemcide `text/plain` çizilir: React istemcide eklenen
 * betikleri zaten çalıştırmaz ve uyarı vermez (Next rehberi "preventing flash before hydration").
 */
export function ThemeScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
    />
  );
}

/** Tarayıcı çubuğu rengi: Next iki meta yazar (açık/koyu cihaz); seçilen tema ikisini de geçersiz kılar. */
function setThemeColor(theme: Theme | null) {
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const deviceDark = meta.media.includes("dark");
    const color = theme === "light" || theme === "dark" ? THEME_COLORS[theme] : THEME_COLORS[deviceDark ? "dark" : "light"];
    meta.content = color;
  }
}

function clearTheme() {
  document.documentElement.removeAttribute("data-theme");
  setThemeColor(null);
}

/**
 * Hesaptaki tercihi sayfaya ve çereze uygular (istemci içi geçişlerde betik çalışmaz). Oturum açık kabuktadır:
 * kabuk gizlenince (çıkış → giriş ekranı; Next önceki sayfaları gizli tutar) tercih kalkar, giriş ekranı
 * cihazın ayarına döner. Geliştirmede Strict Mode `<html>` niteliklerini sıfırladığında da yeniden uygular.
 */
export function ThemeSync({ theme }: { theme: Theme }) {
  useLayoutEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    setThemeColor(theme);
    document.cookie = themeCookie(theme, location.protocol === "https:");
    return clearTheme;
  }, [theme]);
  return null;
}

/**
 * Girişten önceki ekranlar (giriş, etkinleştirme, ziyaretçi, kiosk) cihazın ayarına uyar (karar #273).
 * Oturumu düşmüş biri uygulama adresini açıp girişe yönlenirse betiğin koyduğu tercih burada kalkar.
 */
export function DeviceTheme() {
  useLayoutEffect(clearTheme, []);
  return null;
}
