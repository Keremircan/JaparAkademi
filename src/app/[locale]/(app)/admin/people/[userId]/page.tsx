import { Pencil, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { adminAccess, orNull } from "@/features/admin/guard";
import { ResetPasswordControl, RevealNationalId, StatusControls } from "@/features/people/components/person-actions";
import { Link } from "@/i18n/navigation";
import { can } from "@/server/authz/policy";
import { listPositionOptions, listUnitOptions } from "@/server/services/org";
import { getPerson } from "@/server/services/people";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.people");
  return { title: t("title") };
}

export default function Page({ params }: PageProps<"/[locale]/admin/people/[userId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-3 sm:grid-cols-[14rem_1fr]">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

async function Content({ params }: { params: Promise<{ userId: string }> }) {
  const access = await adminAccess("people.view");
  if (!access) return <NotFoundView />;
  const { userId } = await params;
  const person = await orNull(getPerson(access.actor, userId));
  if (!person) return <NotFoundView />;

  const [t, tc, tRoles, format, positions, units] = await Promise.all([
    getTranslations("admin.people"),
    getTranslations("common"),
    getTranslations("roles"),
    getFormatter(),
    listPositionOptions(access.actor, { includePassive: true }),
    listUnitOptions(access.actor),
  ]);
  const position = positions.find((p) => p.id === person.positionId);
  const canManage = can(access.actor, "people.manage");
  const canRoles = can(access.actor, "roles.manage");
  const canSeeTc = can(access.actor, "people.view_national_id");
  const isSelf = access.actor.userId === person.userId;
  const fmtDate = (d: string | null) => (d ? format.dateTime(new Date(`${d}T00:00:00`), { dateStyle: "medium" }) : tc("none"));

  return (
    <section className="max-w-4xl">
      <PageHeader
        title={person.fullName}
        description={`${t("form.sicil")}: ${person.sicilNo} · ${t(`status.${person.status}`)}`}
        back={{ href: "/admin/people", label: t("title") }}
        actions={
          <>
            {canManage && (
              <Button variant="outline" nativeButton={false} render={<Link href={`/admin/people/${person.userId}/edit`} />}>
                <Pencil aria-hidden="true" />
                {t("form.edit")}
              </Button>
            )}
            {canRoles && (
              <Button variant="outline" nativeButton={false} render={<Link href={`/admin/people/${person.userId}/roles`} />}>
                <ShieldCheck aria-hidden="true" />
                {t("detail.manageRoles")}
              </Button>
            )}
          </>
        }
      />

      <h2 className="mb-2 text-lg font-semibold">{t("detail.info")}</h2>
      <dl className="mb-8 divide-y rounded-2xl border">
        <Row label={t("form.position")}>{position?.label ?? t("form.noPosition")}</Row>
        <Row label={t("form.hireDate")}>{fmtDate(person.hireDate)}</Row>
        <Row label={t("form.employmentType")}>{t(`form.employmentTypes.${person.employmentType}`)}</Row>
        <Row label={t("detail.nationalId")}>
          {person.nationalIdMasked ? (
            canSeeTc ? (
              <RevealNationalId userId={person.userId} masked={person.nationalIdMasked} />
            ) : (
              <span className="font-mono">{person.nationalIdMasked}</span>
            )
          ) : (
            t("detail.noNationalId")
          )}
        </Row>
        <Row label={t("form.phone")}>{person.phone ?? tc("none")}</Row>
        <Row label={t("form.email")}>{person.email ?? tc("none")}</Row>
        <Row label={t("form.trainingRequired")}>{person.trainingRequired ? tc("yes") : tc("no")}</Row>
        <Row label={t("detail.sourceLabel")}>{t(`detail.source.${person.source}`)}</Row>
        {person.endDate && <Row label={t("detail.endDate")}>{fmtDate(person.endDate)}</Row>}
      </dl>

      <h2 className="mb-2 text-lg font-semibold">{t("detail.roles")}</h2>
      <div className="mb-8 rounded-2xl border px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {person.roles.map((r) => (
            <span key={r} className="rounded-full bg-muted px-3 py-1 text-sm">
              {tRoles(r)}
            </span>
          ))}
        </div>
        {person.roles.includes("section_manager") && (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("detail.scopes")}:{" "}
            {person.scopeOrgUnitIds.length
              ? person.scopeOrgUnitIds.map((id) => units.find((u) => u.id === id)?.label ?? id).join(", ")
              : tc("none")}
          </p>
        )}
      </div>

      <h2 className="mb-2 text-lg font-semibold">{t("detail.account")}</h2>
      <div className="mb-8 flex flex-col gap-4 rounded-2xl border px-5 py-4">
        <p className="text-sm text-muted-foreground">
          {t("detail.lastLogin")}:{" "}
          {person.lastLoginAt ? format.dateTime(person.lastLoginAt, { dateStyle: "medium", timeStyle: "short" }) : t("detail.never")}
          {person.mustChangePassword && ` · ${t("mustChange")}`}
        </p>
        {canManage && !isSelf && person.status === "active" && <ResetPasswordControl userId={person.userId} sicilNo={person.sicilNo} />}
      </div>

      {canManage && !isSelf && (
        <>
          <h2 className="mb-2 text-lg font-semibold">{t("detail.statusTitle")}</h2>
          <div className="rounded-2xl border px-5 py-4">
            <StatusControls userId={person.userId} status={person.status} />
          </div>
        </>
      )}
    </section>
  );
}
