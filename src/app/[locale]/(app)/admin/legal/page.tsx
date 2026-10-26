import { Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { ActionButton } from "@/components/forms/action-button";
import { Button } from "@/components/ui/button";
import { adminAccess } from "@/features/admin/guard";
import { publishLegalTextAction } from "@/features/legal/actions";
import { LegalTextBody } from "@/features/legal/components/legal-text-body";
import { Link } from "@/i18n/navigation";
import { listPersonnelTexts } from "@/server/services/legal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.legal");
  return { title: t("title") };
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const access = await adminAccess("legal.manage");
  if (!access) return <NotFoundView />;
  const [t, tc, tNav, format, texts] = await Promise.all([
    getTranslations("admin.legal"),
    getTranslations("common"),
    getTranslations("sections.admin"),
    getFormatter(),
    listPersonnelTexts(access.actor),
  ]);
  const hasDraft = texts.some((x) => !x.publishedAt);
  const currentId = texts.find((x) => x.publishedAt)?.id;

  return (
    <section className="max-w-4xl">
      <PageHeader
        title={t("title")}
        description={t("intro")}
        back={{ href: "/admin", label: tNav("title") }}
        actions={
          !hasDraft && (
            <Button nativeButton={false} render={<Link href="/admin/legal/new" />}>
              <Plus aria-hidden="true" />
              {t("newDraft")}
            </Button>
          )
        }
      />
      {texts.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {texts.map((text) => (
            <li key={text.id} className="rounded-2xl border">
              <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{text.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("version", { version: text.version })} ·{" "}
                    {text.publishedAt
                      ? t("published", { date: format.dateTime(text.publishedAt, { dateStyle: "medium", timeStyle: "short" }) })
                      : t("draft")}
                    {text.id === currentId && ` · ${t("current")}`}
                  </p>
                </div>
                {!text.publishedAt && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" nativeButton={false} render={<Link href={`/admin/legal/${text.id}`} />}>
                      <Pencil aria-hidden="true" />
                      {tc("edit")}
                    </Button>
                    <ActionButton variant="default" confirmText={t("publishConfirm")} action={publishLegalTextAction.bind(null, text.id)}>
                      {t("publish")}
                    </ActionButton>
                  </div>
                )}
              </div>
              <details className="px-5 py-3">
                <summary className="min-h-12 cursor-pointer content-center">{t("body")}</summary>
                <div className="pt-2">
                  <LegalTextBody body={text.body} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
