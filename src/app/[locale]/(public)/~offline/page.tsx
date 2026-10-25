import { WifiOff } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

/** Service worker'ın bağlantı yokken gösterdiği sayfa (önbellekte tutulur). */
export default async function OfflinePage() {
  const t = await getTranslations("offline");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <WifiOff aria-hidden="true" className="size-12 text-muted-foreground" />
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="max-w-sm text-muted-foreground">{t("description")}</p>
      <form>
        <Button type="submit" size="lg">
          {t("retry")}
        </Button>
      </form>
    </main>
  );
}
