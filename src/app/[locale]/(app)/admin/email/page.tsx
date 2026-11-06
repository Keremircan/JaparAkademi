import { CircleAlert, MailCheck, MailX } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { adminAccess } from "@/features/admin/guard";
import { TestMailForm } from "@/features/mail/components/test-mail-form";
import { mailStatus } from "@/server/services/mail-status";
import type { MailProblem } from "@/server/state/mail";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("mailStatus");
  return { title: t("title") };
}

/** E-posta durumu (iş paketi 3.7, karar #261): sistem yöneticisi ve üst yönetici. */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const access = await adminAccess("mail.manage");
  if (!access) return <NotFoundView />;
  const [t, tNav, format, status] = await Promise.all([getTranslations("mailStatus"), getTranslations("sections.admin"), getFormatter(), mailStatus(access.actor)]);
  const hint = (problem: MailProblem) => {
    const specific = `hints.${status.transport}.${problem}`;
    return t.has(specific as never) ? t(specific as never) : t(`hints.common.${problem}` as never);
  };
  const limited = status.limit > 0;
  const usedPct = limited ? Math.min(100, Math.round((status.sentToday / status.limit) * 100)) : 0;
  const time = (d: Date) => format.dateTime(d, { dateStyle: "short", timeStyle: "short" });

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} back={{ href: "/admin", label: tNav("title") }} />

      <section aria-labelledby="mail-sending" className="flex flex-col gap-4 rounded-xl border p-4">
        <h2 id="mail-sending" className="flex items-center gap-2 text-base font-semibold">
          {status.enabled ? (
            <MailCheck aria-hidden="true" className="size-5 text-emerald-700 dark:text-emerald-400" />
          ) : (
            <MailX aria-hidden="true" className="size-5 text-muted-foreground" />
          )}
          {status.enabled ? t("on") : t("off")}
        </h2>
        {!status.enabled && <p className="text-sm text-muted-foreground">{t("offHint")}</p>}
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[12rem_1fr]">
          <dt className="text-sm text-muted-foreground">{t("transport")}</dt>
          <dd data-testid="mail-transport">{t(`transports.${status.transport}`)}</dd>
          <dt className="text-sm text-muted-foreground">{t("sender")}</dt>
          <dd className="break-all">{status.sender ?? t("noSender")}</dd>
          <dt className="text-sm text-muted-foreground">{t("today")}</dt>
          <dd className="flex flex-col gap-2">
            <span data-testid="mail-today">
              {limited ? t("todayOf", { sent: status.sentToday, limit: status.limit }) : t("todayUnlimited", { sent: status.sentToday })}
            </span>
            {limited && (
              <span
                role="meter"
                aria-label={t("today")}
                aria-valuemin={0}
                aria-valuemax={status.limit}
                aria-valuenow={Math.min(status.sentToday, status.limit)}
                className="block h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted"
              >
                <span className="block h-full rounded-full bg-primary" style={{ width: `${usedPct}%` }} />
              </span>
            )}
            <span className="text-sm text-muted-foreground">
              {limited ? t("todayHint", { time: format.dateTime(status.resetsAt, { timeStyle: "short" }), reserve: status.reserve }) : t("unlimitedHint")}
            </span>
          </dd>
        </dl>
      </section>

      <section aria-labelledby="mail-week" className="flex flex-col gap-3">
        <h2 id="mail-week" className="text-base font-semibold">
          {t("week.title")}
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(
            [
              ["pending", status.pending],
              ["sent", status.week.sent],
              ["failed", status.week.failed],
            ] as const
          ).map(([key, value]) => (
            <li key={key} className="rounded-xl border p-4">
              <span className="block text-sm text-muted-foreground">{t(`week.${key}`)}</span>
              <span className="block text-2xl font-semibold tabular-nums" data-testid={`mail-${key}`}>
                {format.number(value)}
              </span>
            </li>
          ))}
        </ul>
        {status.pending > 0 && status.pendingProblem && (
          <p className="flex items-start gap-2 rounded-xl border p-3 text-sm">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              {t("pendingProblem", { problem: t(`problems.${status.pendingProblem.problem}`), time: time(status.pendingProblem.at) })} {hint(status.pendingProblem.problem)}
            </span>
          </p>
        )}
      </section>

      <section aria-labelledby="mail-failures" className="flex flex-col gap-3">
        <h2 id="mail-failures" className="text-base font-semibold">
          {t("failures.title")}
        </h2>
        {status.failures.length === 0 ? (
          <p className="rounded-xl border border-dashed p-5 text-muted-foreground">{t("failures.empty")}</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {status.failures.map((f) => (
              <li key={f.id}>
                <details>
                  <summary className="flex min-h-12 cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
                    <span className="font-mono text-sm text-muted-foreground">{time(f.at)}</span>
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">{t(`problems.${f.problem}`)}</span>
                    <span>{t(`kinds.${f.kind}`)}</span>
                    <span className="font-mono text-sm text-muted-foreground">{f.to}</span>
                  </summary>
                  <div className="flex flex-col gap-1 border-t px-4 py-3 text-sm">
                    <p>{hint(f.problem)}</p>
                    {f.detail && <p className="font-mono text-xs text-muted-foreground">{f.detail}</p>}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="mail-test" className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 id="mail-test" className="text-base font-semibold">
          {t("test.title")}
        </h2>
        {status.enabled ? (
          <>
            <p className="text-sm text-muted-foreground">{t("test.intro")}</p>
            <TestMailForm defaultTo={status.myEmail ?? ""} transport={status.transport} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("test.disabled")}</p>
        )}
      </section>
    </section>
  );
}
