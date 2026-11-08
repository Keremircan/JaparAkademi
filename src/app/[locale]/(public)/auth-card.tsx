import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { LocaleLinks } from "@/components/brand/locale-links";
import { Link } from "@/i18n/navigation";

/**
 * Giriş ve şifre sayfalarının ortak çerçevesi (telefon öncelikli, ortalanmış kart).
 * `languages`: hesapsız ekranlarda dil seçimi (oturum açık ekranlarda dil profilden değişir).
 * Altta her zaman "Gizlilik ve çerezler" bağlantısı bulunur (karar #278): aydınlatma girişten önce okunabilir.
 */
export function AuthCard({
  title,
  intro,
  children,
  languages = false,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
  languages?: boolean;
}) {
  const t = useTranslations("auth.login");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo priority className="w-56" />
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
          <h1 className="text-xl font-semibold">{title}</h1>
          {intro && <p className="mt-2 text-muted-foreground">{intro}</p>}
          <div className="mt-6">{children}</div>
        </div>
        <div className="mt-4 flex flex-col items-center">
          {languages && <LocaleLinks />}
          <Link href="/privacy" className="inline-flex min-h-12 items-center gap-2 text-sm text-muted-foreground underline underline-offset-4">
            <ShieldCheck aria-hidden="true" className="size-4" />
            {t("privacy")}
          </Link>
        </div>
      </div>
    </main>
  );
}
