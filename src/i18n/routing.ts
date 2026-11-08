import { defineRouting } from "next-intl/routing";

/** Varsayılan dil Türkçe ve URL'de öneksiz; İngilizce /en altında (ziyaretçi içerikleri, Faz 2). */
export const routing = defineRouting({
  locales: ["tr", "en"],
  defaultLocale: "tr",
  localePrefix: "as-needed",
  localeDetection: false,
  // Dil adresten gelir; algılama kapalıyken NEXT_LOCALE çerezi işe yaramaz. Girişten önce çerez yazılmasın
  // (KVKK Çerez Rehberi, karar #278). Oturum açık sayfalarda dil tercihi `akademi_locale` çerezindedir.
  localeCookie: false,
});

export type Locale = (typeof routing.locales)[number];
