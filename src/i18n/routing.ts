import { defineRouting } from "next-intl/routing";

/** Varsayılan dil Türkçe ve URL'de öneksiz; İngilizce /en altında (ziyaretçi içerikleri, Faz 2). */
export const routing = defineRouting({
  locales: ["tr", "en"],
  defaultLocale: "tr",
  localePrefix: "as-needed",
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
