import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { EvacuationBoard, type BoardPerson } from "@/features/visitors/components/evacuation-board";
import { securityAccess } from "@/features/visitors/guard";
import { insideNow, openRollcall, recentRollcalls } from "@/server/services/visitors";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("evacuation");
  return { title: t("title") };
}

/** Tesis içindekiler ve tahliye yoklaması (SPEC 8.3 FG-8.1, iş paketi 2.4): güvenlik ve İSG, telefon öncelikli. */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const access = await securityAccess("evacuation.manage");
  if (!access) return <NotFoundView />;
  const [t, tNav, tTypes, format, rollcall, inside, history] = await Promise.all([
    getTranslations("evacuation"),
    getTranslations("sections.security"),
    getTranslations("visitors.types"),
    getFormatter(),
    openRollcall(access.actor),
    insideNow(access.actor),
    recentRollcalls(access.actor),
  ]);
  const time = (d: Date) => format.dateTime(d, { dateStyle: "short", timeStyle: "short" });
  const source = rollcall ? rollcall.people : inside.map((p) => ({ ...p, safeAt: null as Date | null }));
  const people: BoardPerson[] = source.map((p) => ({
    visitId: p.visitId,
    fullName: p.fullName,
    companyName: p.companyName,
    typeLabel: tTypes(p.visitorType),
    hostName: p.hostName,
    badgeNo: p.badgeNo,
    checkedInLabel: p.checkedInAt ? time(p.checkedInAt) : "",
    safe: !!p.safeAt,
  }));
  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={t("title")} description={`${t("description")} ${t("inside", { count: inside.length })}`} back={{ href: "/security", label: tNav("title") }} />
      <EvacuationBoard
        key={rollcall?.id ?? "none"}
        rollcall={rollcall ? { id: rollcall.id, kind: rollcall.kind, startedLabel: time(rollcall.startedAt), startedAt: rollcall.startedAt.toISOString() } : null}
        people={people}
        savedLabel={time(new Date())}
      />
      {history.length > 0 && (
        <section aria-labelledby="rollcall-history" className="flex flex-col gap-2">
          <h2 id="rollcall-history" className="text-xl font-semibold">
            {t("history")}
          </h2>
          <ul className="divide-y rounded-2xl border">
            {history.map((h) => (
              <li key={h.id} className="flex min-h-12 flex-wrap items-center gap-x-4 px-5 py-2 text-sm">
                <span className="flex-1">
                  {t("historyRow", { kind: t(`kinds.${h.kind}`), time: time(h.startedAt), safe: h.safe, total: h.total })}
                  {!h.endedAt && ` · ${t("openNow")}`} · {h.startedByName}
                </span>
                <a href={`/api/security/evacuation/pdf?rollcall=${h.id}`} className="inline-flex min-h-12 items-center underline underline-offset-4">
                  {t("pdfShort")}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
