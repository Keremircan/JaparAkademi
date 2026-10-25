import { SearchX } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** 404 görünümü: var olmayan sayfa veya yetkisi olmayan bölüm (yetkisiz bölümün varlığı belli edilmez). */
export function NotFoundView() {
  const t = useTranslations("notFound");
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <SearchX aria-hidden="true" className="size-12 text-muted-foreground" />
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="max-w-sm text-muted-foreground">{t("description")}</p>
      <Button size="lg" nativeButton={false} render={<Link href="/" />}>
        {t("home")}
      </Button>
    </div>
  );
}
