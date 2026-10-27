import { ArrowRight, BookOpenCheck, GraduationCap, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { ModuleList } from "@/features/learning/components/module-list";
import { Link } from "@/i18n/navigation";
import { getSectionUser } from "@/server/auth/current-user";
import { toActor } from "@/server/services/auth";
import { myLearning } from "@/server/services/assignments";
import { myCertificates } from "@/server/services/certificates";
import { CertificateList } from "@/features/certification/components/certificate-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sections.learn");
  return { title: t("title") };
}

/** Kursiyer ana sayfası (Ekran 2): sıradaki adım, ilerleme, kalan süre, okuma görevleri. */
export default function LearnPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const user = await getSectionUser("learn");
  if (!user) return <NotFoundView />;
  const [t, ts, format, data, certs] = await Promise.all([
    getTranslations("learn"),
    getTranslations("sections.learn"),
    getFormatter(),
    myLearning(toActor(user)),
    myCertificates(toActor(user)),
  ]);
  const a = data.current;
  const next = a?.modules.find((m) => m.id === a.nextModuleId);
  const date = (d: string) => format.dateTime(new Date(`${d}T12:00:00`), { dateStyle: "long" });

  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold lg:text-3xl">{ts("title")}</h1>

      {data.rereads.length > 0 && (
        <section aria-labelledby="reread-heading" className="flex flex-col gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
          <h2 id="reread-heading" className="flex items-center gap-2 font-semibold">
            <BookOpenCheck aria-hidden="true" className="size-5" />
            {t("rereadHeading")}
          </h2>
          <ul className="flex flex-col gap-1">
            {data.rereads.map((r) => (
              <li key={r.id}>
                <Link href={`/learn/reread/${r.id}`} className="flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 hover:bg-muted">
                  <span>{r.contentTitle}</span>
                  <span className={`text-sm ${r.overdue ? "text-destructive" : "text-muted-foreground"}`}>{t("due", { date: date(r.dueDate) })}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!a ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border p-8 text-center">
          <GraduationCap aria-hidden="true" className="size-12 text-muted-foreground" />
          <p className="text-lg">{ts("empty")}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-2xl border p-5">
            <p className="text-muted-foreground">{t("plan", { position: a.positionName })}</p>
            <div className="flex flex-col gap-1">
              <progress max={100} value={a.progress} className="h-4 w-full accent-primary" aria-labelledby="progress-label" />
              <p id="progress-label" className="flex flex-wrap justify-between gap-2 text-sm">
                <span>{t("progress", { percent: a.progress })}</span>
                <span>{t("remaining", { hours: Math.floor(a.remainingMinutes / 60), minutes: a.remainingMinutes % 60 })}</span>
              </p>
            </div>
            {a.targetDate && (
              <p className={`text-sm ${a.overdue ? "text-destructive" : "text-muted-foreground"}`}>
                {t("target", { date: date(a.targetDate) })}
                {a.overdue && ` · ${t("overdue")}`}
              </p>
            )}
            {a.trainerName && <p className="text-sm text-muted-foreground">{t("trainer", { name: a.trainerName })}</p>}
          </div>

          {a.status === "awaiting_readiness" ? (
            <p role="status" className="rounded-2xl border border-emerald-600/40 bg-emerald-500/10 p-5 text-lg">
              {t("allDone")}
            </p>
          ) : a.status === "awaiting_decision" ? (
            <p role="status" className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 text-lg">
              {t("awaitingDecision")}
            </p>
          ) : next ? (
            <div className="flex flex-col gap-3 rounded-2xl border-2 border-primary p-5">
              <p className="text-sm font-medium uppercase tracking-wide text-primary">{t("nextStep")}</p>
              <p className="text-xl font-semibold">{next.title}</p>
              <Button size="lg" className="self-start" nativeButton={false} render={<Link href={`/learn/${a.id}/${next.moduleId}`} />}>
                {next.status === "available" ? t("start") : t("continue")}
                <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          ) : null}

          {a.modules.some((m) => m.kind === "practice" && m.status !== "locked") && (
            <Button variant="outline" size="lg" className="self-start" nativeButton={false} render={<Link href="/learn/practice" />}>
              <ListChecks aria-hidden="true" />
              {t("practiceLink")}
            </Button>
          )}

          <section aria-labelledby="modules-heading" className="flex flex-col gap-3">
            <h2 id="modules-heading" className="text-lg font-semibold">
              {t("modulesHeading")}
            </h2>
            <ModuleList assignment={a} linkable />
          </section>
        </>
      )}

      {certs.length > 0 && (
        <section aria-labelledby="certs-heading" className="flex flex-col gap-3">
          <h2 id="certs-heading" className="text-lg font-semibold">
            {t("certificatesHeading")}
          </h2>
          <CertificateList items={certs} />
        </section>
      )}
    </section>
  );
}
