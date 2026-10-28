import { Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { ActionButton } from "@/components/forms/action-button";
import { Button } from "@/components/ui/button";
import { legalAccess } from "@/features/legal/access";
import { publishLegalTextAction } from "@/features/legal/actions";
import { LegalTextBody } from "@/features/legal/components/legal-text-body";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { LEGAL_KINDS, listTexts, type LegalText } from "@/server/services/legal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.legal");
  return { title: t("title") };
}

/** KVKK ve ziyaretçi metinleri (SPEC 13.3, iş paketi 2.2): tür sekmeleri, sürüm başına dil satırları. */
export default function Page({ searchParams }: PageProps<"/[locale]/admin/legal">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const access = await legalAccess(typeof sp.kind === "string" ? sp.kind : undefined);
  if (!access) return <NotFoundView />;
  const { actor, kind, kinds } = access;
  const [t, tc, tNav, format, texts] = await Promise.all([
    getTranslations("admin.legal"),
    getTranslations("common"),
    getTranslations("sections.admin"),
    getFormatter(),
    listTexts(actor, kind),
  ]);
  const locales = LEGAL_KINDS[kind].locales as readonly string[];
  const versions = [...new Set(texts.map((x) => x.version))];
  const byVersion = (v: number) => texts.filter((x) => x.version === v);
  const draftVersion = texts.find((x) => !x.publishedAt)?.version;
  const currentVersion = texts.find((x) => x.publishedAt)?.version;

  return (
    <section className="max-w-4xl">
      <PageHeader
        title={t("title")}
        description={t(`intro.${kind}`)}
        back={{ href: "/admin", label: tNav("title") }}
        actions={
          draftVersion === undefined && (
            <Button nativeButton={false} render={<Link href={`/admin/legal/new?kind=${kind}&locale=${locales[0]}`} />}>
              <Plus aria-hidden="true" />
              {t("newDraft")}
            </Button>
          )
        }
      />
      {kinds.length > 1 && (
        <nav aria-label={t("kindsLabel")} className="mb-6 flex flex-wrap gap-2">
          {kinds.map((k) => (
            <Link
              key={k}
              href={`/admin/legal?kind=${k}`}
              aria-current={k === kind ? "page" : undefined}
              className={cn("flex min-h-12 items-center rounded-full border px-4", k === kind ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
            >
              {t(`kinds.${k}`)}
            </Link>
          ))}
        </nav>
      )}
      {versions.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {versions.map((version) => {
            const rows = byVersion(version);
            const published = rows[0]?.publishedAt ?? null;
            const missing = locales.filter((l) => !rows.some((r) => r.locale === l));
            return (
              <li key={version} className="rounded-2xl border">
                <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{t("version", { version })}</p>
                    <p className="text-sm text-muted-foreground">
                      {published ? t("published", { date: format.dateTime(published, { dateStyle: "medium", timeStyle: "short" }) }) : t("draft")}
                      {version === currentVersion && ` · ${t("current")}`}
                    </p>
                  </div>
                  {!published && (
                    <div className="flex flex-wrap gap-2">
                      {missing.map((l) => (
                        <Button key={l} variant="outline" nativeButton={false} render={<Link href={`/admin/legal/new?kind=${kind}&locale=${l}`} />}>
                          <Plus aria-hidden="true" />
                          {t("addLocale", { locale: t(`locales.${l as "tr" | "en"}`) })}
                        </Button>
                      ))}
                      {missing.length === 0 && (
                        <ActionButton confirmText={t("publishConfirm")} action={publishLegalTextAction.bind(null, rows[0]!.id)}>
                          {t("publish")}
                        </ActionButton>
                      )}
                    </div>
                  )}
                </div>
                {rows.map((text: LegalText) => (
                  <details key={text.id} className="border-b px-5 py-3 last:border-b-0">
                    <summary className="min-h-12 cursor-pointer content-center">
                      {locales.length > 1 && <span className="mr-2 rounded-full bg-muted px-2 py-0.5 text-xs">{t(`locales.${text.locale as "tr" | "en"}`)}</span>}
                      {text.title}
                    </summary>
                    <div className="flex flex-col gap-3 pt-2">
                      <LegalTextBody body={text.body} />
                      {!published && (
                        <Button variant="outline" className="self-start" nativeButton={false} render={<Link href={`/admin/legal/${text.id}`} />}>
                          <Pencil aria-hidden="true" />
                          {tc("edit")}
                        </Button>
                      )}
                    </div>
                  </details>
                ))}
                {!published && missing.length > 0 && <p className="px-5 py-3 text-sm text-muted-foreground">{t("missingLocales")}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
