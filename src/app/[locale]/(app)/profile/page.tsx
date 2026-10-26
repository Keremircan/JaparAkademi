import { KeyRound, LogOut } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/actions";
import { Link } from "@/i18n/navigation";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { getSectionUser } from "@/server/auth/current-user";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("profile");
  return { title: t("title") };
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const user = await getSectionUser("profile");
  if (!user) return <NotFoundView />;
  const t = await getTranslations();

  return (
    <section className="max-w-xl">
      <h1 className="text-2xl font-semibold lg:text-3xl">{t("profile.title")}</h1>

      <dl className="mt-6 divide-y rounded-2xl border">
        <div className="px-5 py-4">
          <dt className="text-sm text-muted-foreground">{t("profile.sicil")}</dt>
          <dd className="mt-1 text-lg font-medium">{user.sicilNo}</dd>
        </div>
        <div className="px-5 py-4">
          <dt className="text-sm text-muted-foreground">{t("profile.roles")}</dt>
          <dd className="mt-2 flex flex-wrap gap-2">
            {user.roles.map((role) => (
              <span key={role} className="rounded-full bg-muted px-3 py-1 text-sm">
                {t(`roles.${role}`)}
              </span>
            ))}
          </dd>
        </div>
      </dl>

      {user.sharedDevice && <p className="mt-4 text-sm text-muted-foreground">{t("profile.sharedDevice")}</p>}

      <div className="mt-6 flex flex-col gap-3">
        <Button
          variant="outline"
          size="lg"
          className="justify-start"
          nativeButton={false}
          render={<Link href="/change-password" />}
        >
          <KeyRound aria-hidden="true" />
          {t("profile.changePassword")}
        </Button>
        <form action={signOutAction}>
          <Button type="submit" variant="outline" size="lg" className="w-full justify-start">
            <LogOut aria-hidden="true" />
            {t("auth.signOut")}
          </Button>
        </form>
      </div>
    </section>
  );
}
