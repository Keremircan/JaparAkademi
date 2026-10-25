import { getTranslations } from "next-intl/server";
import { NavIcon } from "@/components/app-shell/nav-icon";
import { visibleNav } from "@/features/app-shell/navigation";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/current-user";
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
      <h1 className="text-2xl font-semibold lg:text-3xl">{t("home.greeting", { name: user.fullName })}</h1>
      <p className="mt-2 text-muted-foreground">{t("home.intro")}</p>
      <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {shortcuts.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="flex min-h-16 items-center gap-4 rounded-2xl border bg-card px-5 py-4 text-lg font-medium hover:bg-muted"
            >
              <NavIcon name={item.key} className="size-7" />
              {t(`nav.${item.key}`)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
