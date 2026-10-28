import { CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { locale as rootLocale } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { DoneStep, VisitorFlow } from "@/features/visitor-flow/components/visitor-flow";
import { VisitorFrame } from "@/features/visitor-flow/components/visitor-frame";
import { getSettings } from "@/server/services/settings";
import { visitorView } from "@/server/services/visitors";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("visitorFlow");
  return { title: t("title"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/** Ziyaretçi bilgilendirmesi (SPEC 8.2, iş paketi 2.3a): hesapsız, ziyaret belirteciyle. */
export default function Page({ params }: PageProps<"/[locale]/v/[token]">) {
  return (
    <Suspense fallback={null}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ token: string }> }) {
  // Prerender zamana/veritabanına dokunmasın diye önce istek verisi okunur
  await connection();
  const { token } = await params;
  const locale = ((await rootLocale()) === "en" ? "en" : "tr") as "tr" | "en";
  const [t, view, s] = await Promise.all([getTranslations("visitorFlow"), visitorView(token, locale), getSettings(["visitor.kiosk_reset_seconds"])]);
  const path = `/v/${token}`;

  if (view.state === "invalid" || view.state === "not_ready") {
    return (
      <VisitorFrame title={t("title")} path={path} locale={locale} allowLanguage={view.state === "not_ready"}>
        <p role="alert" className="flex items-center gap-3 text-lg">
          <CircleAlert aria-hidden="true" className="size-7 shrink-0 text-destructive" />
          {view.state === "invalid" ? t("invalid") : t("notReady")}
        </p>
      </VisitorFrame>
    );
  }
  const kiosk = view.channel === "kiosk";
  if (view.state === "done") {
    return (
      <VisitorFrame title={t("title")} path={path} locale={locale} allowLanguage={false}>
        <DoneStep code={view.code} kiosk={kiosk} resetSeconds={s["visitor.kiosk_reset_seconds"]} />
      </VisitorFrame>
    );
  }
  return (
    <VisitorFrame title={`${t("title")} · ${t(`types.${view.visitorType}`)}`} path={path} locale={locale}>
      <VisitorFlow
        key={locale}
        token={token}
        locale={locale}
        code={view.code}
        firstName={view.firstName}
        cards={view.cards}
        cardMinSeconds={view.cardMinSeconds}
        questionCount={view.questionCount}
        quizPassed={view.quizPassed}
        rules={view.rules}
        kvkk={view.kvkk}
        kiosk={kiosk}
        resetSeconds={s["visitor.kiosk_reset_seconds"]}
      />
    </VisitorFrame>
  );
}
