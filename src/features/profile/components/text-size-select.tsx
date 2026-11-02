import { ALargeSmall, Check } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { TEXT_SIZES, type TextSize } from "@/lib/text-size";
import { setTextSizeAction } from "../actions";

/** Profilde yazı boyutu tercihi (iş paketi 3.6, karar #244; SPEC 13.1 "büyük yazı seçeneği"). */
export async function TextSizeSelect({ current }: { current: TextSize }) {
  const t = await getTranslations("profile.textSize");
  return (
    <section aria-labelledby="text-size-title" className="mt-6 rounded-xl border p-4">
      <h2 id="text-size-title" className="flex items-center gap-2 text-base font-semibold">
        <ALargeSmall aria-hidden="true" className="size-5" />
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
      <form action={setTextSizeAction} className="mt-4 grid grid-cols-2 gap-3">
        {TEXT_SIZES.map((size) => (
          <Button
            key={size}
            type="submit"
            name="textSize"
            value={size}
            size="lg"
            variant={size === current ? "default" : "outline"}
            aria-pressed={size === current}
            className={size === "large" ? "text-lg" : undefined}
          >
            {size === current && <Check aria-hidden="true" />}
            {t(size)}
          </Button>
        ))}
      </form>
    </section>
  );
}
