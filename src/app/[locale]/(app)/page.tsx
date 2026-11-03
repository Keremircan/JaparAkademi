import { getTranslations } from "next-intl/server";
import { NavIcon } from "@/components/app-shell/nav-icon";
import { visibleNav } from "@/features/app-shell/navigation";
import { TodayCard } from "@/features/schedules/components/today-card";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/services/auth";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";

export default function HomePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const user = await requireUser();
  const t = await getTranslations();
  const shortcuts = visibleNav(user.roles).filter((i) => i.key !== "home");

  return (
    <section className="max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">{t("home.greeting", { name: user.fullName })}</h1>
      <p className="mt-2 text-muted-foreground">{t("home.intro")}</p>
      <TodayCard actor={toActor(user)} />
      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {shortcuts.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-4 py-3 text-base font-medium hover:bg-muted"
            >
              <NavIcon name={item.key} className="size-6" />
              {t(`nav.${item.key}`)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
