/** Arayüz ve içerik dilleri (karar #207). Türkçe varsayılan ve her zaman vardır; İngilizce isteğe bağlıdır. */
export const APP_LOCALES = ["tr", "en"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "tr";

export function toAppLocale(value: unknown): AppLocale {
  return value === "en" ? "en" : "tr";
}

/** Dil tercihi çerezi: proxy, oturum açık sayfaları tercih edilen dile yönlendirir (iyimser; asıl kaynak hesap). */
export const LOCALE_COOKIE = "akademi_locale";
