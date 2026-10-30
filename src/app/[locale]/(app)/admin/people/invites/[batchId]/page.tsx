import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { adminAccess, orNull } from "@/features/admin/guard";
import { WhatsAppSendList } from "@/features/people/components/invite-batch";
import { getInvitationBatch } from "@/server/services/invitation-batches";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invite.batch");
  return { title: t("groupTitle") };
}

/** Davet grubu: özet + WhatsApp gönderim listesi (karar #201); davet süresi boyunca yeniden açılabilir. */
export default function Page({ params, searchParams }: PageProps<"/[locale]/admin/people/invites/[batchId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await adminAccess("people.manage");
  if (!access) return <NotFoundView />;
  const { batchId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(batchId)) return <NotFoundView />;
  const batch = await orNull(getInvitationBatch(access.actor, batchId));
  if (!batch) return <NotFoundView />;
  const pdf = (await searchParams).pdf === "1";
  const [t, format] = await Promise.all([getTranslations("invite.batch"), getFormatter()]);
  const whatsapp = batch.rows.filter((r) => r.channel === "whatsapp");

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={t("groupTitle")}
        description={t("groupMeta", { date: format.dateTime(batch.createdAt, { dateStyle: "medium", timeStyle: "short" }), name: batch.createdByName })}
        back={{ href: "/admin/people/invites", label: t("back") }}
      />
      <div className="flex flex-col gap-2 rounded-2xl border p-5">
        <p className="font-medium">
          {t("summary", { total: batch.counts.total, email: batch.counts.email, whatsapp: batch.counts.whatsapp, print: batch.counts.print })}
        </p>
        {batch.counts.email > 0 && <p className="text-muted-foreground">{t("emailQueued", { count: batch.counts.email })}</p>}
        {pdf && batch.counts.print > 0 && <p className="text-muted-foreground">{t("sheetsDownloaded")}</p>}
      </div>

      {batch.counts.whatsapp > 0 && (
        <section aria-labelledby="wa-heading" className="flex flex-col gap-3">
          <h2 id="wa-heading" className="text-lg font-semibold">
            {t("whatsappTitle")}
          </h2>
          <p className="text-muted-foreground">{t("whatsappIntro")}</p>
          <WhatsAppSendList
            key={batch.id}
            rows={whatsapp.map((r) => ({
              invitationId: r.invitationId,
              fullName: r.fullName,
              sicilNo: r.sicilNo,
              state: r.state,
              sharedAt: r.sharedAt?.toISOString() ?? null,
              whatsappUrl: r.whatsappUrl,
            }))}
          />
        </section>
      )}
    </section>
  );
}
