import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NavIcon } from "@/components/app-shell/nav-icon";
import { visibleNav } from "@/features/app-shell/navigation";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/current-user";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sections.more");
  return { title: t("title") };
}

/** Mobilde alt sekmeye sığmayan bölümlerin listesi. */
export default function MorePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const user = await requireUser();
  const t = await getTranslations();

  return (
    <section className="max-w-xl">
      <h1 className="text-2xl font-semibold">{t("sections.more.title")}</h1>
      <ul className="mt-6 divide-y rounded-2xl border">
        {visibleNav(user.roles).map((item) => (
          <li key={item.key}>
            <Link href={item.href} className="flex min-h-14 items-center gap-4 px-5 text-lg hover:bg-muted">
              <NavIcon name={item.key} className="size-6" />
              {t(`nav.${item.key}`)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
