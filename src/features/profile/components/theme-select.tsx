import { Monitor, Moon, Palette, Sun } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { THEMES, type Theme } from "@/lib/theme";
import { setThemeAction } from "../actions";

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

/** Profilde Görünüm: Sistem / Açık / Koyu (iş paketi 3.12, karar #272). */
export async function ThemeSelect({ current }: { current: Theme }) {
  const t = await getTranslations("profile.theme");
  return (
    <section aria-labelledby="theme-title" className="mt-6 rounded-xl border p-4">
      <h2 id="theme-title" className="flex items-center gap-2 text-base font-semibold">
        <Palette aria-hidden="true" className="size-5" />
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
      <form action={setThemeAction} className="mt-4 grid grid-cols-3 gap-3">
        {THEMES.map((theme) => {
          const Icon = ICONS[theme];
          return (
            <Button
              key={theme}
              type="submit"
              name="theme"
              value={theme}
              size="lg"
              variant={theme === current ? "default" : "outline"}
              aria-pressed={theme === current}
            >
              <Icon aria-hidden="true" />
              {t(theme)}
            </Button>
          );
        })}
      </form>
    </section>
  );
}
