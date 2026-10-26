import { AlertTriangle, Download, FileText, Loader2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import type { ContentBody, ContentType, RichNode } from "@/server/services/content/body";
import type { AssetInfo } from "@/server/services/media";
import { formatBytes } from "../format";
import { RichText } from "./rich-text";
import { VideoPlayer } from "./video-player";

type Body = {
  doc?: RichNode;
  assetId?: string;
  description?: string;
  items?: { assetId?: string; caption?: string; text?: string; critical?: boolean }[];
  steps?: { title?: string; text?: string; assetId?: string }[];
};

/**
 * İçerik görüntüleyici (7 tip). Kütüphane önizlemesinde ve (1.4'te) kursiyer ekranında kullanılır.
 * PDF'ler 1.4'te pdf.js ile sayfa içinde gösterilecek; şimdilik yeni sekmede açılır.
 */
export async function ContentRenderer({
  type,
  title,
  body,
  assets,
}: {
  type: ContentType;
  title: string;
  body: ContentBody;
  assets: Map<string, AssetInfo>;
}) {
  const t = await getTranslations("content.viewer");
  const b = body as Body;

  const notReady = (id: string | undefined) => {
    const a = id ? assets.get(id) : undefined;
    if (!a) return <Missing text={t("missing")} />;
    if (a.status === "failed") return <Missing text={t("failed")} />;
    if (a.status !== "ready") {
      return (
        <p className="flex items-center gap-2 rounded-xl border border-dashed p-4 text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-5 animate-spin" />
          {t("processing")}
        </p>
      );
    }
    return null;
  };

  const description = b.description ? <p className="whitespace-pre-line text-muted-foreground">{b.description}</p> : null;

  switch (type) {
    case "text":
      return b.doc?.content?.length ? <RichText doc={b.doc} /> : <Missing text={t("empty")} />;

    case "video":
      return (
        <div className="flex flex-col gap-4">
          {notReady(b.assetId) ?? <VideoPlayer assetId={b.assetId!} title={title} />}
          {description}
        </div>
      );

    case "pdf":
    case "form_template": {
      const a = b.assetId ? assets.get(b.assetId) : undefined;
      return (
        <div className="flex flex-col gap-4">
          {description}
          {notReady(b.assetId) ?? (
            <div className="flex flex-wrap items-center gap-4 rounded-xl border p-4">
              <FileText aria-hidden="true" className="size-8 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{a!.originalName}</p>
                <p className="text-sm text-muted-foreground">
                  {formatBytes(a!.size)}
                  {a!.pageCount ? ` · ${t("pages", { count: a!.pageCount })}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {a!.mime === "application/pdf" && (
                  <Button variant="outline" nativeButton={false} render={<a href={`/api/media/${a!.id}/file`} target="_blank" rel="noopener" />}>
                    <FileText aria-hidden="true" />
                    {t("open")}
                  </Button>
                )}
                <Button nativeButton={false} render={<a href={`/api/media/${a!.id}/download`} />}>
                  <Download aria-hidden="true" />
                  {t("download")}
                </Button>
              </div>
            </div>
          )}
        </div>
      );
    }

    case "gallery":
      if (!b.items?.length) return <Missing text={t("empty")} />;
      return (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {b.items.map((item, i) => (
            <li key={i} className="flex flex-col gap-2">
              {notReady(item.assetId) ?? (
                <a href={`/api/media/${item.assetId}/image`} target="_blank" rel="noopener" className="block overflow-hidden rounded-xl border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/media/${item.assetId}/image`} alt={item.caption || t("imageAlt", { n: i + 1 })} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                </a>
              )}
              {item.caption && <p className="text-sm">{item.caption}</p>}
            </li>
          ))}
        </ul>
      );

    case "instruction":
      if (!b.steps?.length) return <Missing text={t("empty")} />;
      return (
        <ol className="flex flex-col gap-4">
          {b.steps.map((step, i) => (
            <li key={i} className="flex gap-4 rounded-xl border p-4">
              <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <p className="text-lg font-semibold">
                  <span className="sr-only">{t("step", { n: i + 1 })}: </span>
                  {step.title}
                </p>
                {step.text && <p className="whitespace-pre-line">{step.text}</p>}
                {step.assetId &&
                  (notReady(step.assetId) ?? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/media/${step.assetId}/image`} alt={step.title ?? ""} loading="lazy" className="max-h-96 w-full rounded-lg border object-contain" />
                  ))}
              </div>
            </li>
          ))}
        </ol>
      );

    case "checklist":
      if (!b.items?.length) return <Missing text={t("empty")} />;
      return (
        <ul className="flex flex-col divide-y rounded-xl border">
          {b.items.map((item, i) => (
            <li key={i} className="flex min-h-14 items-center gap-3 px-4 py-3">
              <span aria-hidden="true" className="size-6 shrink-0 rounded-md border-2" />
              <span className="flex-1">{item.text}</span>
              {item.critical && (
                <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-sm text-destructive">
                  <AlertTriangle aria-hidden="true" className="size-4" />
                  {t("critical")}
                </span>
              )}
            </li>
          ))}
        </ul>
      );
  }
}

function Missing({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed p-4 text-muted-foreground">{text}</p>;
}
