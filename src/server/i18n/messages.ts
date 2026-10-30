import en from "../../../messages/en.json";
import tr from "../../../messages/tr.json";

/**
 * Sunucuda (worker, e-posta, push) kişinin dilindeki metinler (karar #207). `en.json`'da olmayan anahtar Türkçeye
 * düşer; arayüzdeki birleştirmeyle aynı kural (`src/i18n/request.ts`).
 */
type Messages = { [key: string]: string | Messages };

function merge(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key];
    out[key] = typeof value === "object" && typeof existing === "object" ? merge(existing, value) : value;
  }
  return out;
}

const english = merge(tr as Messages, en as Messages) as unknown as typeof tr;

export function messagesFor(locale: string): typeof tr {
  return locale === "en" ? english : tr;
}

/** Uygulama içi bağlantıyı kişinin diline çevirir (Türkçe öneksiz, İngilizce `/en`). */
export function localizedPath(path: string, locale: string): string {
  return locale === "en" ? `/en${path === "/" ? "" : path}` : path;
}
