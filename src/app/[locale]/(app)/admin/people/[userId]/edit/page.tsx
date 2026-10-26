import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { adminAccess, orNull } from "@/features/admin/guard";
import { PersonForm } from "@/features/people/components/person-form";
import { listPositionOptions } from "@/server/services/org";
import { getPerson } from "@/server/services/people";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.people.form");
  return { title: t("edit") };
}

export default function Page({ params }: PageProps<"/[locale]/admin/people/[userId]/edit">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ userId: string }> }) {
  const access = await adminAccess("people.manage");
  if (!access) return <NotFoundView />;
  const { userId } = await params;
  const person = await orNull(getPerson(access.actor, userId));
  if (!person) return <NotFoundView />;
  const [t, positions] = await Promise.all([getTranslations("admin.people"), listPositionOptions(access.actor)]);
  // Mevcut pozisyon pasifse de listede görünsün
  const options = positions.map((p) => ({ id: p.id, label: p.label }));
  if (person.positionId && !options.some((o) => o.id === person.positionId)) {
    const all = await listPositionOptions(access.actor, { includePassive: true });
    const current = all.find((p) => p.id === person.positionId);
    if (current) options.unshift({ id: current.id, label: current.label });
  }

  return (
    <section>
      <PageHeader title={t("form.edit")} description={person.fullName} back={{ href: `/admin/people/${userId}`, label: person.fullName }} />
      <PersonForm person={person} positions={options} />
    </section>
  );
}
