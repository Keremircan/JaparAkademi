import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

/** Sayfa başlığı: isteğe bağlı geri bağlantısı, açıklama ve sağda eylemler. */
export function PageHeader({
  title,
  description,
  back,
  actions,
}: {
  title: string;
  description?: string;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col gap-2">
      {back && (
        <Link
          href={back.href}
          className="flex min-h-12 items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground pointer-fine:min-h-8"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground pointer-fine:text-base">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}
