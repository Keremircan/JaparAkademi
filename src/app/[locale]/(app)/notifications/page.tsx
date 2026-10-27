import { CheckCheck } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { ActionButton } from "@/components/forms/action-button";
import { markAllReadAction } from "@/features/notifications/actions";
import { NotificationItem } from "@/features/notifications/components/notification-item";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/services/auth";
import { myNotifications } from "@/server/services/notifications";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notifications");
  return { title: t("title") };
}

/** Bildirim merkezi (SPEC 10.2): okunmamışlar üstte; tıklanınca ilgili ekrana gidilir. */
export default function Page({ searchParams }: PageProps<"/[locale]/notifications">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Number(typeof sp.page === "string" ? sp.page : 1) || 1;
  const [t, tc, format, data] = await Promise.all([getTranslations("notifications"), getTranslations("common"), getFormatter(), myNotifications(toActor(user), page)]);
  const unread = data.items.some((n) => !n.read);
  return (
    <section className="flex max-w-2xl flex-col gap-4">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          unread ? (
            <ActionButton action={markAllReadAction}>
              <CheckCheck aria-hidden="true" />
              {t("markAll")}
            </ActionButton>
          ) : undefined
        }
      />
      {data.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border">
          {data.items.map((n) => (
            <li key={n.id}>
              <NotificationItem
                id={n.id}
                read={n.read}
                unreadLabel={t("unread")}
                title={t(`kinds.${n.kind}`, n.params as Record<string, string>)}
                time={format.relativeTime(n.at)}
              />
            </li>
          ))}
        </ul>
      )}
      {data.pages > 1 && (
        <nav aria-label={t("pagination")} className="flex items-center justify-between gap-3">
          {data.page > 1 ? (
            <Link href={`/notifications?page=${data.page - 1}`} className="inline-flex min-h-12 items-center underline underline-offset-4">
              {tc("previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">{tc("pageOf", { page: data.page, pages: data.pages })}</span>
          {data.page < data.pages ? (
            <Link href={`/notifications?page=${data.page + 1}`} className="inline-flex min-h-12 items-center underline underline-offset-4">
              {tc("next")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}
