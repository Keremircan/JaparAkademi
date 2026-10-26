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

export default getRequestConfig(async ({ locale: override, requestLocale }) => {
  const requested = await resolveLocale(override, requestLocale);
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    // Tarih/saat gösterimi her zaman kurum saat diliminde (org.timezone varsayılanı)
    timeZone: "Europe/Istanbul",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
