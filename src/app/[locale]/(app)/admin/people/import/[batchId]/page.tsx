import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { adminAccess, orNull } from "@/features/admin/guard";
import { ImportPreview } from "@/features/people/components/import-preview";
import { getImportBatch } from "@/server/services/imports";
import { listPositionOptions } from "@/server/services/org";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.people.import");
  return { title: t("previewTitle") };
}

export default function Page({ params }: PageProps<"/[locale]/admin/people/import/[batchId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ batchId: string }> }) {
  const access = await adminAccess("people.manage");
  if (!access) return <NotFoundView />;
  const { batchId } = await params;
  const data = await orNull(getImportBatch(access.actor, batchId));
  if (!data) return <NotFoundView />;
  const [t, positions] = await Promise.all([
    getTranslations("admin.people.import"),
    listPositionOptions(access.actor, { includePassive: true }),
  ]);
  const label = new Map(positions.map((p) => [p.id, p.label]));
  const { batch, rows } = data;

  return (
    <section className="max-w-6xl">
      <PageHeader
        title={t("previewTitle")}
        description={batch.fileName}
        back={{ href: "/admin/people/import", label: t("title") }}
      />
      {batch.status === "cancelled" ? (
        <p className="rounded-2xl border p-6">{t("expired")}</p>
      ) : (
        <>
          {batch.status === "committed" && <p className="mb-4 rounded-2xl border p-4">{t("alreadyCommitted")}</p>}
          <ImportPreview
            batchId={batch.id}
            status={batch.status}
            rows={rows.map((r) => ({
              rowNumber: r.rowNumber,
              sicilNo: r.sicilNo,
              fullName: r.fullName,
              positionLabel: r.positionId ? (label.get(r.positionId) ?? null) : null,
              isUpdate: r.isUpdate,
              status: r.status,
              errors: r.errors,
            }))}
            counts={{
              total: batch.totalRows,
              valid: batch.validRows,
              errors: batch.errorRows,
              creates: rows.filter((r) => r.status === "valid" && !r.isUpdate).length,
              updates: rows.filter((r) => r.status === "valid" && r.isUpdate).length,
            }}
          />
        </>
      )}
    </section>
  );
}
