import { Pencil, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { adminAccess, orNull } from "@/features/admin/guard";
import { ResetControl } from "@/features/people/components/invite-controls";
import { RevealNationalId, StatusControls } from "@/features/people/components/person-actions";
import { EraseControl } from "@/features/people/components/erase-control";
import { erasureInfo } from "@/server/services/erasure";
import { inviteMailEnabled, inviteStatus, resetBlockFor } from "@/server/services/invitations";
import { Link } from "@/i18n/navigation";
import { can } from "@/server/authz/policy";
import { listPositionOptions, listUnitOptions } from "@/server/services/org";
import { getPerson } from "@/server/services/people";
import { assignmentsForPerson, trainerCandidates } from "@/server/services/assignments";
import { AssignmentControls } from "@/features/assignments/components/assignment-controls";
import { AssignmentSummaryView } from "@/features/assignments/components/assignment-summary";
import { CertificateList } from "@/features/certification/components/certificate-list";
import { certificatesForUser } from "@/server/services/certificates";
import { PersonalExportButton } from "@/features/reports/components/personal-export-button";
import { ProfilePhoto } from "@/features/profile/components/profile-photo";
import { personPhoto } from "@/server/services/profile";

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
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[14rem_1fr]">
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
  // Kişisel verisi silinmiş kişide hiçbir değişiklik yapılmaz; kayıtlar yalnızca görüntülenir (karar #266)
  const erased = person.anonymizedAt !== null;
  const canManage = can(access.actor, "people.manage") && !erased;
  const canRoles = can(access.actor, "roles.manage") && !erased;
  const canSeeTc = can(access.actor, "people.view_national_id");
  const isSelf = access.actor.userId === person.userId;
  const canAssign = can(access.actor, "assignments.manage");
  const canErase = can(access.actor, "people.erase") && !isSelf;
  const showReset = canManage && !isSelf && person.status === "active";
  const [assignmentList, trainers, ta, tcert, certs, invite, tInvite, photo, block, erasure] = await Promise.all([
    canAssign ? assignmentsForPerson(access.actor, person.userId) : Promise.resolve([]),
    canAssign ? trainerCandidates(access.actor) : Promise.resolve([]),
    getTranslations("assignments"),
    getTranslations("certificates.list"),
    canAssign ? certificatesForUser(access.actor, person.userId).catch(() => []) : Promise.resolve([]),
    inviteStatus(access.actor, person.userId),
    getTranslations("invite"),
    personPhoto(access.actor, person.userId),
    showReset ? resetBlockFor(access.actor, person.userId) : Promise.resolve(null),
    canErase && erased ? erasureInfo(access.actor, person.userId) : Promise.resolve(null),
  ]);
  const open = assignmentList.find((a) => ["active", "awaiting_readiness", "awaiting_decision"].includes(a.status));
  const past = assignmentList.filter((a) => a !== open);
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

      {erased && (
        <div role="status" className="mb-6 rounded-xl border px-4 py-3" data-testid="person-erased">
          <p className="font-medium">
            {t("erase.erased", { date: format.dateTime(person.anonymizedAt!, { dateStyle: "medium", timeStyle: "short" }) })}
          </p>
          {erasure && <p className="text-sm text-muted-foreground">{t("erase.erasedBy", { name: erasure.erasedByName, reason: erasure.reason })}</p>}
        </div>
      )}

      <h2 className="mb-2 text-base font-semibold">{t("detail.info")}</h2>
      {/* Profil fotoğrafı (iş paketi 3.4): kişinin açık rızası varken İK yükleyebilir */}
      <div className="mb-4 rounded-xl border p-4">
        <ProfilePhoto userId={person.userId} name={person.fullName} photo={photo.photo} consent={photo.consent} canEdit={photo.canEdit && canManage} />
      </div>
      <dl className="mb-6 divide-y rounded-xl border">
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

      {/* Hesap ve şifre sıfırlama kişi bilgilerinin hemen altında (iş paketi 3.7, karar #259) */}
      <section aria-labelledby="account-heading" className="mb-6">
        <h2 id="account-heading" className="mb-2 text-base font-semibold">
          {t("detail.account")}
        </h2>
        <div className="flex flex-col gap-4 rounded-xl border px-4 py-3">
          <p className="text-sm">
            {tInvite("status.label")}:{" "}
            <span className="font-medium" data-testid="account-state">
              {tInvite(`status.${invite.state}`, {
                channel: invite.channel ? tInvite(`channel.${invite.channel}`) : "",
                date: invite.expiresAt ? format.dateTime(invite.expiresAt, { dateStyle: "medium", timeStyle: "short" }) : "",
              })}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            {t("detail.lastLogin")}:{" "}
            {person.lastLoginAt ? format.dateTime(person.lastLoginAt, { dateStyle: "medium", timeStyle: "short" }) : t("detail.never")}
            {person.mustChangePassword && ` · ${t("mustChange")}`}
          </p>
          {showReset &&
            (block ? (
              <p className="text-sm text-muted-foreground" data-testid="reset-blocked">
                {tInvite(`reset.blocked.${block}`)}
              </p>
            ) : (
              <ResetControl userId={person.userId} mailEnabled={inviteMailEnabled()} mode={invite.state === "active" || person.lastLoginAt ? "reset" : "invite"} />
            ))}
        </div>
      </section>

      {canAssign && (
        <section aria-labelledby="training-heading" className="mb-6">
          <h2 id="training-heading" className="mb-2 text-base font-semibold">
            {ta("heading")}
          </h2>
          <div className="flex flex-col gap-4 rounded-xl border px-4 py-3">
            {open ? (
              <>
                <AssignmentSummaryView a={open} viewer={access.actor} />
                {!erased && (
                  <AssignmentControls
                    mode="edit"
                    assignmentId={open.id}
                    trainers={trainers}
                    trainerUserId={open.trainerUserId}
                    targetDate={open.targetDate}
                    needsTrainer={open.modules.some((m) => m.kind === "practice" || m.kind === "practice_exam")}
                  />
                )}
                {open.status !== "active" && !isSelf && !erased && (
                  <Button className="self-start" nativeButton={false} render={<Link href={`/manage/readiness/${open.id}`} />}>
                    {tcert("openReview")}
                  </Button>
                )}
              </>
            ) : (
              <>
                <p className="text-muted-foreground">{person.positionId ? ta("none") : ta("noPosition")}</p>
                {person.status === "active" && person.positionId && !isSelf && !erased && <AssignmentControls mode="start" userId={person.userId} trainers={trainers} />}
              </>
            )}
            {past.length > 0 && (
              <details>
                <summary className="min-h-12 cursor-pointer content-center">{ta("history", { count: past.length })}</summary>
                <div className="flex flex-col gap-6 pt-3">
                  {past.map((a) => (
                    <AssignmentSummaryView key={a.id} a={a} showModules={false} viewer={access.actor} />
                  ))}
                </div>
              </details>
            )}
          </div>
        </section>
      )}

      {canAssign && (
        <section aria-labelledby="certificates-heading" className="mb-6">
          <h2 id="certificates-heading" className="mb-2 text-base font-semibold">
            {tcert("title")}
          </h2>
          <CertificateList items={certs} canRevoke={can(access.actor, "certificates.revoke") && !isSelf && !erased} />
        </section>
      )}

      {can(access.actor, "people.export_personal") && !isSelf && !erased && (
        <div className="mb-6">
          <PersonalExportButton userId={person.userId} />
        </div>
      )}

      <h2 className="mb-2 text-base font-semibold">{t("detail.roles")}</h2>
      <div className="mb-6 rounded-xl border px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {/* Silinen kişinin rolleri kaldırılır */}
          {person.roles.length === 0 && <span className="text-sm text-muted-foreground">{tc("none")}</span>}
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

      {canManage && !isSelf && (
        <>
          <h2 className="mb-2 text-base font-semibold">{t("detail.statusTitle")}</h2>
          <div className="mb-6 rounded-xl border px-4 py-3">
            <StatusControls userId={person.userId} status={person.status} />
          </div>
        </>
      )}

      {/* Kişiyi kalıcı silme: yalnızca üst yönetici, yalnızca işten ayrılmış kişi (kararlar #264–267) */}
      {canErase && !erased && (
        <section aria-labelledby="erase-heading" className="mb-6">
          <h2 id="erase-heading" className="mb-2 text-base font-semibold">
            {t("erase.title")}
          </h2>
          <div className="flex flex-col gap-3 rounded-xl border border-destructive/40 px-4 py-3">
            <p className="text-sm text-muted-foreground">{t("erase.intro")}</p>
            {person.status === "terminated" ? (
              <EraseControl userId={person.userId} fullName={person.fullName} />
            ) : (
              <p className="text-sm">{t("erase.onlyTerminated")}</p>
            )}
          </div>
        </section>
      )}
    </section>
  );
}
