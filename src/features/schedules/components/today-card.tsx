import { CalendarClock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { UserActor } from "@/server/authz/actor";
import { myTodayFlow } from "@/server/services/schedules";
import { ChooseShift, TodayFlowView } from "./schedule-view";

/** Ana sayfadaki "Bugünün akışı" kartı (kararlar #254, #256); pozisyonda program yoksa gösterilmez. */
export async function TodayCard({ actor }: { actor: UserActor }) {
  const home = await myTodayFlow(actor);
  if (home.state === "none") return null;
  const t = await getTranslations("schedules");

  return (
    <section aria-labelledby="today-flow-heading" className="mt-6 flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="today-flow-heading" className="flex flex-1 items-center gap-2 text-base font-semibold">
          <CalendarClock aria-hidden="true" className="size-5" />
          {t("today.title")}
        </h2>
        <Link href="/schedule" className="inline-flex min-h-12 items-center underline underline-offset-4 pointer-fine:min-h-8">
          {t("today.open")}
        </Link>
      </div>
      {home.state === "choose" ? (
        <>
          <p className="font-medium">{t("choose.title")}</p>
          <p className="text-muted-foreground">{t("choose.hint")}</p>
          <ChooseShift programs={home.programs} />
        </>
      ) : (
        <TodayFlowView home={home} />
      )}
    </section>
  );
}
