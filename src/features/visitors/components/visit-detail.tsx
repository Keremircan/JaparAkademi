import { ShieldAlert } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { UserActor } from "@/server/authz/actor";
import { can } from "@/server/authz/policy";
import { companyOptions, getVisit, visitorHistory } from "@/server/services/visitors";
import { getSettings } from "@/server/services/settings";
import { todayIn } from "@/lib/dates";
import { ActionButton } from "@/components/forms/action-button";
import { cancelVisitAction, resendVisitLinkAction } from "../actions";
import { ReasonAction } from "./reason-action";
import { VisitForm } from "./visit-form";

type Visit = Awaited<ReturnType<typeof getVisit>>;

/** Ziyaret ayrıntısı: bilgiler, düzenleme (girişten önce), iptal ve (güvenlik/İSG için) geçmiş ziyaretler. */
export async function VisitDetail({ actor, visit, base }: { actor: UserActor; visit: Visit; base: string }) {
  const [t, format, s, companies] = await Promise.all([
    getTranslations("visitors"),
    getFormatter(),
    getSettings(["org.timezone", "visitor.types"]),
    companyOptions(actor),
  ]);
  const viewAll = can(actor, "visits.view_all");
  const history = viewAll ? (await visitorHistory(actor, visit.visitorId)).filter((h) => h.id !== visit.id) : [];
  const types = (["office", "site", "contractor"] as const).filter((k) => s["visitor.types"][k].enabled || k === visit.visitorType);
  const today = todayIn(s["org.timezone"]);
  const date = (d: string) => format.dateTime(new Date(`${d}T12:00:00`), { dateStyle: "long" });

  return (
    <div className="flex flex-col gap-6">
      {visit.blacklisted && (
        <p role="alert" className="flex items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-destructive">
          <ShieldAlert aria-hidden="true" className="size-6 shrink-0" />
          {t("detail.blacklistedWarning")}
        </p>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-2xl border p-5">
        <dt className="text-muted-foreground">{t("detail.status")}</dt>
        <dd className="font-medium">{t(`status.${visit.status}`)}</dd>
        <dt className="text-muted-foreground">{t("form.type")}</dt>
        <dd>{t(`types.${visit.visitorType}`)}</dd>
        <dt className="text-muted-foreground">{t("form.date")}</dt>
        <dd>{date(visit.plannedDate)}</dd>
        <dt className="text-muted-foreground">{t("detail.host")}</dt>
        <dd>{visit.hostUserId ? visit.hostName : t("detail.hostWritten", { name: visit.hostName })}</dd>
        <dt className="text-muted-foreground">{t("detail.code")}</dt>
        <dd className="font-mono text-lg font-semibold tracking-widest">{visit.code}</dd>
        <dt className="text-muted-foreground">{t("detail.briefing")}</dt>
        <dd>
          {visit.briefingCompletedAt
            ? visit.quizScore !== null
              ? t("detail.briefingDone", {
                  date: format.dateTime(visit.briefingCompletedAt, { dateStyle: "medium", timeStyle: "short" }),
                  locale: visit.briefingLocale === "en" ? "English" : "Türkçe",
                  score: visit.quizScore,
                })
              : t("detail.briefingDoneNoQuiz", {
                  date: format.dateTime(visit.briefingCompletedAt, { dateStyle: "medium", timeStyle: "short" }),
                  locale: visit.briefingLocale === "en" ? "English" : "Türkçe",
                })
            : t("detail.briefingPending")}
        </dd>
        {visit.nationalIdMasked && (
          <>
            <dt className="text-muted-foreground">{t("detail.id")}</dt>
            <dd>{visit.nationalIdMasked}</dd>
          </>
        )}
        {visit.checkedInAt && (
          <>
            <dt className="text-muted-foreground">{t("detail.gate")}</dt>
            <dd>
              {t("detail.checkedIn", { time: format.dateTime(visit.checkedInAt, { dateStyle: "medium", timeStyle: "short" }), badge: visit.badgeNo ?? "" })}
              {visit.ppeIssued && visit.ppeIssued.length > 0 && <span className="block">{t("detail.ppe", { items: visit.ppeIssued.join(", ") })}</span>}
              {visit.checkedOutAt && (
                <span className="block">
                  {t("detail.checkedOut", {
                    time: format.dateTime(visit.checkedOutAt, { dateStyle: "medium", timeStyle: "short" }),
                    returned: visit.badgeReturned ? "true" : "false",
                  })}
                </span>
              )}
            </dd>
          </>
        )}
        {visit.status === "cancelled" && (
          <>
            <dt className="text-muted-foreground">{t("detail.cancelReason")}</dt>
            <dd>{visit.cancelReason}</dd>
          </>
        )}
      </dl>

      {visit.canEdit && (
        <section aria-labelledby="visit-edit" className="flex flex-col gap-4">
          <h2 id="visit-edit" className="text-xl font-semibold">
            {t("detail.edit")}
          </h2>
          <VisitForm
            mode={visit.canSetId ? "security" : "host"}
            base={base}
            types={types}
            companies={companies}
            minDate={visit.plannedDate < today ? visit.plannedDate : today}
            visitId={visit.id}
            initial={{
              visitorType: visit.visitorType,
              plannedDate: visit.plannedDate,
              fullName: visit.fullName,
              companyName: visit.companyName ?? "",
              contractorCompanyId: visit.contractorCompanyId ?? "",
              phone: visit.phone ?? "",
              email: visit.email ?? "",
              note: visit.note ?? "",
            }}
          />
        </section>
      )}
      {!visit.canEdit && visit.note && <p className="rounded-2xl border p-5 text-muted-foreground">{visit.note}</p>}

      {visit.canEdit && visit.email && (
        <ActionButton action={resendVisitLinkAction.bind(null, visit.id)}>{t("detail.resendLink")}</ActionButton>
      )}

      {visit.canCancel && (
        <ReasonAction
          id={`cancel-${visit.id}`}
          label={t("detail.cancel")}
          reasonLabel={t("detail.cancelReason")}
          confirmLabel={t("detail.cancelConfirm")}
          action={cancelVisitAction.bind(null, visit.id)}
        />
      )}

      {history.length > 0 && (
        <section aria-labelledby="visit-history" className="flex flex-col gap-3">
          <h2 id="visit-history" className="text-xl font-semibold">
            {t("detail.history")}
          </h2>
          <ul className="divide-y rounded-2xl border">
            {history.map((h) => (
              <li key={h.id} className="flex min-h-12 flex-wrap items-center gap-x-4 px-5 py-2 text-sm">
                <span className="w-32">{date(h.plannedDate)}</span>
                <span className="flex-1">
                  {t(`types.${h.visitorType}`)} · {t("list.host", { name: h.hostName })}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t(`status.${h.status}`)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
