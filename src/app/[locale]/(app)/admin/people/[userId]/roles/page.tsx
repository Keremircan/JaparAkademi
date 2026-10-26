import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { adminAccess, orNull } from "@/features/admin/guard";
import { RolesForm, ScopesForm } from "@/features/people/components/roles-form";
import { listUnitOptions } from "@/server/services/org";
import { getPerson } from "@/server/services/people";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.roles");
  return { title: t("title") };
}

export default function Page({ params }: PageProps<"/[locale]/admin/people/[userId]/roles">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ userId: string }> }) {
  const access = await adminAccess("roles.manage");
  if (!access) return <NotFoundView />;
  const { userId } = await params;
  const person = await orNull(getPerson(access.actor, userId));
  if (!person) return <NotFoundView />;
  const [t, units] = await Promise.all([getTranslations("admin.roles"), listUnitOptions(access.actor)]);
  const isManager = person.roles.includes("section_manager");

  return (
    <section className="max-w-3xl">
      <PageHeader title={t("title")} description={`${person.fullName} · ${t("intro")}`} back={{ href: `/admin/people/${userId}`, label: person.fullName }} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border p-5">
          <h2 className="mb-3 text-lg font-semibold">{t("roles")}</h2>
          <RolesForm userId={userId} roles={person.roles} />
        </div>
        <div className="rounded-2xl border p-5">
          <h2 className="mb-3 text-lg font-semibold">{t("scopes")}</h2>
          {isManager ? (
            <>
              {person.scopeOrgUnitIds.length === 0 && <p className="mb-3 text-sm text-destructive">{t("noScopes")}</p>}
              <ScopesForm userId={userId} units={units} selected={person.scopeOrgUnitIds} />
            </>
          ) : (
            <p className="text-muted-foreground">{t("scopesNeedRole")}</p>
          )}
        </div>
      </div>
    </section>
  );
}
