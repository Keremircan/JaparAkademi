/**
 * Koyu/açık mod tercihi (iş paketi 3.12, kararlar #272–274).
 *
 * "system" cihazın ayarına uyar (CSS `prefers-color-scheme`); "light"/"dark" `<html data-theme>` ile
 * zorlanır. Tercih hesaptadır (`personnel.theme`); tarayıcıdaki çerez yalnızca sayfa çizilmeden önce
 * okunmak içindir. Girişten önceki ekranlar (giriş, ziyaretçi, kiosk) her zaman cihazın ayarına uyar.
 */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export function toTheme(value: unknown): Theme {
  return value === "light" || value === "dark" ? value : "system";
}

/** Tercihin tarayıcıdaki kopyası. Betik okuduğu için HttpOnly değildir; yalnızca "light" ya da "dark" taşır. */
export const THEME_COOKIE = "akademi_theme";

/** Tarayıcı çubuğunun rengi; sayfa arka planıyla aynı (globals.css `--background`). */
export const THEME_COLORS = { light: "#ffffff", dark: "#0a0a0a" } as const;

/** Çerez satırı (`document.cookie`'ye yazılır). "Sistem" seçilince çerez silinir. */
export function themeCookie(theme: Theme, secure: boolean): string {
  const tail = `; path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
  return theme === "system" ? `${THEME_COOKIE}=; max-age=0${tail}` : `${THEME_COOKIE}=${theme}; max-age=31536000${tail}`;
}

/**
 * Oturum açık sayfaların başında, ilk çizimden önce çalışan betik: çerezdeki tercihi `<html>`e yazar
 * (Next rehberi "preventing flash before hydration") ve tarayıcı çubuğu rengini ayarlar. Sayfa açıldıktan
 * sonra `ThemeSync` hesaptaki tercihle eşitler.
 */
export const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)(?:;|$)/);if(!m)return;var c=${JSON.stringify(THEME_COLORS)}[m[1]];document.documentElement.setAttribute("data-theme",m[1]);document.querySelectorAll('meta[name="theme-color"]').forEach(function(x){x.content=c})}catch(e){}})()`;
