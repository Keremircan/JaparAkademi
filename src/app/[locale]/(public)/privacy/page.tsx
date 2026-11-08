import { ArrowLeft, Cookie, FileText } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { LocaleLinks } from "@/components/brand/locale-links";
import { LegalTextBody } from "@/features/legal/components/legal-text-body";
import { Link } from "@/i18n/navigation";
import { privacyPage } from "@/server/services/legal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("privacy");
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** Kullanılan çerezler (karar #278): hepsi zorunlu; adlar koddaki adlarla aynı (Better Auth öneki `akademi`). */
const COOKIES = [
  { name: "akademi.session_token", key: "session" },
  { name: "akademi.dont_remember", key: "dontRemember" },
  { name: "akademi_locale", key: "locale" },
  { name: "akademi_theme", key: "theme" },
  { name: "akademi_device", key: "device" },
] as const;

/**
 * "Gizlilik ve çerezler" (iş paketi 3.13, karar #278): giriş gerektirmez. Yayındaki çalışan ve ziyaretçi aydınlatma
 * metinleri ile açık rıza metni (sayfanın dilinde, yoksa Türkçe), çerezler ve cihazda tutulan bilgiler.
 */
export default async function PrivacyPage() {
  const t = await getTranslations("privacy");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-8 pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="flex justify-center">
        <Logo priority className="w-48" />
      </div>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </header>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Content />
      </Suspense>
      <footer className="flex flex-col items-center gap-1 border-t pt-4">
        <LocaleLinks />
        <Link href="/login" className="inline-flex min-h-12 items-center gap-2 underline underline-offset-4">
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t("back")}
        </Link>
      </footer>
    </main>
  );
}

async function Content() {
  await connection();
  const [t, format, locale] = await Promise.all([getTranslations("privacy"), getFormatter(), getLocale()]);
  const { texts, sessionDays } = await privacyPage(locale);
  return (
    <>
      <nav aria-labelledby="privacy-contents" className="rounded-xl border p-4">
        <h2 id="privacy-contents" className="font-semibold">
          {t("contents")}
        </h2>
        <ul className="mt-1 flex flex-col">
          {texts.map(({ kind }) => (
            <li key={kind}>
              <a href={`#${kind}`} className="flex min-h-12 items-center gap-2 text-primary underline-offset-4 hover:underline">
                <FileText aria-hidden="true" className="size-4 shrink-0" />
                {t(`kinds.${kind}`)}
              </a>
            </li>
          ))}
          <li>
            <a href="#cookies" className="flex min-h-12 items-center gap-2 text-primary underline-offset-4 hover:underline">
              <Cookie aria-hidden="true" className="size-4 shrink-0" />
              {t("cookies.heading")}
            </a>
          </li>
        </ul>
      </nav>

      {texts.map(({ kind, text }) => (
        <section key={kind} id={kind} aria-labelledby={`${kind}-title`} className="scroll-mt-4 rounded-xl border p-4">
          <h2 id={`${kind}-title`} className="text-lg font-semibold">
            {t(`kinds.${kind}`)}
          </h2>
          {text ? (
            <details className="mt-1">
              <summary className="flex min-h-12 cursor-pointer flex-col justify-center">
                <span lang={text.locale} className="font-medium">
                  {text.title}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t("published", { version: text.version, date: format.dateTime(text.publishedAt ?? text.createdAt, { dateStyle: "long" }) })}
                </span>
              </summary>
              <div lang={text.locale} className="pt-3">
                <LegalTextBody body={text.body} />
              </div>
            </details>
          ) : (
            <p className="mt-2 text-muted-foreground">{t("notPublished")}</p>
          )}
        </section>
      ))}

      <section id="cookies" aria-labelledby="cookies-title" className="scroll-mt-4 rounded-xl border p-4">
        <h2 id="cookies-title" className="text-lg font-semibold">
          {t("cookies.heading")}
        </h2>
        <p className="mt-2">{t("cookies.intro")}</p>
        <ul aria-label={t("cookies.caption")} className="mt-4 flex flex-col gap-3">
          {COOKIES.map(({ name, key }) => (
            <li key={name} className="rounded-lg border p-3">
              <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
                <dt className="text-sm text-muted-foreground">{t("cookies.name")}</dt>
                <dd>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-sm break-all">{name}</code>
                </dd>
                <dt className="text-sm text-muted-foreground">{t("cookies.purpose")}</dt>
                <dd>{t(`cookies.${key}.purpose`)}</dd>
                <dt className="text-sm text-muted-foreground">{t("cookies.duration")}</dt>
                <dd>{t(`cookies.${key}.duration`, { days: sessionDays })}</dd>
              </dl>
            </li>
          ))}
        </ul>
        <h3 className="mt-6 font-semibold">{t("cookies.storageHeading")}</h3>
        <ul className="mt-2 flex list-disc flex-col gap-1 ps-5">
          <li>{t("cookies.storageApp")}</li>
          <li>{t("cookies.storageEvacuation")}</li>
          <li>{t("cookies.storageVisitor")}</li>
        </ul>
      </section>
    </>
  );
}
