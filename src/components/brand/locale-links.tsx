"use client";

import { Languages } from "lucide-react";
import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { APP_LOCALES } from "@/lib/locale";

const NAMES = { tr: "Türkçe", en: "English" } as const;

/** Hesapsız ekranlarda dil seçimi (giriş, etkinleştirme, şifre sıfırlama; karar #207). Dil adları kendi dilinde. */
export function LocaleLinks() {
  const locale = useLocale();
  const pathname = usePathname();
  return (
    <nav aria-label="Dil / Language" className="flex items-center justify-center gap-2">
      <Languages aria-hidden="true" className="size-5 text-muted-foreground" />
      {APP_LOCALES.map((l) =>
        l === locale ? (
          <span key={l} lang={l} aria-current="true" className="flex min-h-12 items-center rounded-xl px-3 font-semibold">
            {NAMES[l]}
          </span>
        ) : (
          <Link
            key={l}
            href={pathname}
            locale={l}
            lang={l}
            className="flex min-h-12 items-center rounded-xl px-3 text-primary underline-offset-4 hover:underline"
          >
            {NAMES[l]}
          </Link>
        ),
      )}
    </nav>
  );
}
