import { KeyRound, LogOut, UserRoundPlus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/actions";
import { Link } from "@/i18n/navigation";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { getSectionUser } from "@/server/auth/current-user";
import { toActor } from "@/server/services/auth";
import { getOwnPlacement } from "@/server/services/people";
import { pushPublicKey } from "@/server/services/push";
import { PushToggle } from "@/features/push/components/push-toggle";
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
  const [t, placement] = await Promise.all([getTranslations(), getOwnPlacement(toActor(user))]);
  const publicKey = pushPublicKey();

  return (
    <section className="max-w-xl">
      <h1 className="text-2xl font-semibold lg:text-3xl">{t("profile.title")}</h1>

      <dl className="mt-6 divide-y rounded-2xl border">
        <div className="px-5 py-4">
          <dt className="text-sm text-muted-foreground">{t("profile.sicil")}</dt>
          <dd className="mt-1 text-lg font-medium">{user.sicilNo}</dd>
        </div>
        <div className="px-5 py-4">
          <dt className="text-sm text-muted-foreground">{t("profile.position")}</dt>
          <dd className="mt-1 text-lg font-medium">{placement?.positionName ?? t("profile.noPosition")}</dd>
          {placement?.unitPath && <dd className="text-sm text-muted-foreground">{placement.unitPath}</dd>}
        </div>
        <div className="px-5 py-4">
          <dt className="text-sm text-muted-foreground">{t("profile.roles")}</dt>
          <dd className="mt-2 flex flex-wrap gap-2">
            {user.baseRoles.map((role) => (
              <span key={role} className="rounded-full bg-muted px-3 py-1 text-sm">
                {t(`roles.${role}`)}
              </span>
            ))}
          </dd>
        </div>
      </dl>

      {user.sharedDevice && <p className="mt-4 text-sm text-muted-foreground">{t("profile.sharedDevice")}</p>}

      {/* Push tercihi cihaz bazında; ortak cihazda gösterilmez (kararlar #177–178) */}
      {!user.sharedDevice &&
        (publicKey ? (
          <PushToggle publicKey={publicKey} />
        ) : (
          <section aria-labelledby="push-title" className="mt-6 rounded-2xl border p-5">
            <h2 id="push-title" className="text-lg font-semibold">
              {t("push.title")}
            </h2>
            <p role="status" className="mt-2 text-sm text-muted-foreground">{t("push.blocked.server")}</p>
          </section>
        ))}

      <div className="mt-6 flex flex-col gap-3">
        {/* Ziyaretçi ön kaydı her personele açıktır (iş paketi 2.2, karar #130) */}
        <Button variant="outline" size="lg" className="justify-start" nativeButton={false} render={<Link href="/visits" />}>
          <UserRoundPlus aria-hidden="true" />
          {t("visitors.mine.title")}
        </Button>
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
