import { GraduationCap } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { getSectionUser } from "@/server/auth/current-user";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sections.learn");
  return { title: t("title") };
}

/** Kursiyer ana sayfası. Atama ve ilerleme iş paketi 1.4'te gelir. */
export default function LearnPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  if (!(await getSectionUser("learn"))) return <NotFoundView />;
  const t = await getTranslations("sections.learn");

  return (
    <section className="max-w-2xl">
      <h1 className="text-2xl font-semibold lg:text-3xl">{t("title")}</h1>
      <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border p-8 text-center">
        <GraduationCap aria-hidden="true" className="size-12 text-muted-foreground" />
        <p className="text-lg">{t("empty")}</p>
      </div>
    </section>
  );
}
