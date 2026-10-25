import type messages from "../../messages/tr.json";
import type { routing } from "./routing";

// next-intl tip güvenliği: anahtarlar tr.json'dan türetilir, yanlış anahtar derleme hatası verir.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
