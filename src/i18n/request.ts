import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { routing } from "./routing";

/**
 * Dil, kök parametreden ([locale]) okunur (next/root-params): statik render'ı bozmaz.
 * Root params Server Action ve Route Handler'da kullanılamaz; orada next-intl'in istek dili kullanılır.
 */
async function resolveLocale(override: string | undefined, requestLocale: Promise<string | undefined>) {
  if (override) return override;
  try {
    return await rootLocale();
  } catch {
    return await requestLocale;
  }
}

type Messages = { [key: string]: string | Messages };

/** Varsayılan dilin metinleri üzerine seçili dilin metinlerini yazar (eksik çeviri Türkçe görünür). */
function mergeMessages(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key];
    out[key] =
      typeof value === "object" && typeof existing === "object" ? mergeMessages(existing, value) : value;
  }
  return out;
}

export default getRequestConfig(async ({ locale: override, requestLocale }) => {
  const requested = await resolveLocale(override, requestLocale);
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const base = (await import("../../messages/tr.json")).default as Messages;
  const messages =
    locale === routing.defaultLocale
      ? base
      : mergeMessages(base, (await import(`../../messages/${locale}.json`)).default as Messages);

  return {
    locale,
    // Tarih/saat gösterimi her zaman kurum saat diliminde (org.timezone varsayılanı)
    timeZone: "Europe/Istanbul",
    messages,
  };
});
