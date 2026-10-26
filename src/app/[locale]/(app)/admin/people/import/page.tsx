import { Download } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { adminAccess } from "@/features/admin/guard";
import { ImportUploadForm } from "@/features/people/components/import-upload-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.people.import");
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
  const access = await adminAccess("people.manage");
  if (!access) return <NotFoundView />;
  const t = await getTranslations("admin.people");

  return (
    <section>
      <PageHeader
        title={t("import.title")}
        description={t("import.intro")}
        back={{ href: "/admin/people", label: t("title") }}
        actions={
          // Dosya indirme: istemci tarafı yönlendirme değil, doğrudan istek
          <Button variant="outline" nativeButton={false} render={<a href="/api/admin/people/import-template" download />}>
            <Download aria-hidden="true" />
            {t("import.downloadTemplate")}
          </Button>
        }
      />
      <ImportUploadForm />
    </section>
  );
}
