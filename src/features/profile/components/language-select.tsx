import { Check, Languages } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { APP_LOCALES, type AppLocale } from "@/lib/locale";
import { setLocaleAction } from "../actions";

/** Dil adları her dilde kendi adıyla yazılır (Türkçe / English); bu yüzden metin dosyasından gelmez. */
export const LOCALE_NAMES: Record<AppLocale, string> = { tr: "Türkçe", en: "English" };

/** Profilde dil tercihi (karar #207). */
export async function LanguageSelect({ current }: { current: AppLocale }) {
  const t = await getTranslations("profile.language");
  return (
    <section aria-labelledby="language-title" className="mt-6 rounded-2xl border p-5">
      <h2 id="language-title" className="flex items-center gap-2 text-lg font-semibold">
        <Languages aria-hidden="true" className="size-5" />
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
      <form action={setLocaleAction} className="mt-4 grid grid-cols-2 gap-3">
        {APP_LOCALES.map((l) => (
          <Button
            key={l}
            type="submit"
            name="locale"
            value={l}
            size="lg"
            variant={l === current ? "default" : "outline"}
            aria-pressed={l === current}
            lang={l}
          >
            {l === current && <Check aria-hidden="true" />}
            {LOCALE_NAMES[l]}
          </Button>
        ))}
      </form>
    </section>
  );
}
