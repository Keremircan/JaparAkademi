import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { adminAccess } from "@/features/admin/guard";
import { PersonForm } from "@/features/people/components/person-form";
import { inviteMailEnabled } from "@/server/services/invitations";
import { listPositionOptions } from "@/server/services/org";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.people.form");
  return { title: t("new") };
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const access = await adminAccess("people.manage");
  if (!access) return <NotFoundView />;
  const [t, positions] = await Promise.all([getTranslations("admin.people"), listPositionOptions(access.actor)]);
  return (
    <section>
      <PageHeader title={t("form.new")} back={{ href: "/admin/people", label: t("title") }} />
      <PersonForm positions={positions.map((p) => ({ id: p.id, label: p.label }))} mailEnabled={inviteMailEnabled()} />
    </section>
  );
}
