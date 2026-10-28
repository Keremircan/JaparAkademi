import { Languages } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** Ziyaretçi ekranlarının çerçevesi: logo, başlık, dil seçimi (FG-8.2: Türkçe ve İngilizce). Telefon ve tablet öncelikli. */
export async function VisitorFrame({
  title,
  path,
  locale,
  allowLanguage = true,
  children,
}: {
  title: string;
  /** Dil değiştirince açılacak yol (dil öneki olmadan). */
  path: string;
  locale: string;
  allowLanguage?: boolean;
  children: ReactNode;
}) {
  const t = await getTranslations("visitorFlow");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Logo priority className="w-44" />
        {allowLanguage && (
          <nav aria-label={t("language")} className="flex items-center gap-2">
            <Languages aria-hidden="true" className="size-5 text-muted-foreground" />
            {(["tr", "en"] as const).map((l) => (
              <Link
                key={l}
                href={path}
                locale={l}
                lang={l}
                aria-current={l === locale ? "true" : undefined}
                className={cn("flex min-h-12 items-center rounded-full border px-4", l === locale ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                {t(`languages.${l}`)}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
      {children}
    </main>
  );
}
