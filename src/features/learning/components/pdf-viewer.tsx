"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { ExternalLink, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

/**
 * PDF'i sayfa içinde gösterir (pdf.js, karar #41). Sayfalar görünür olunca çizilir;
 * son sayfa görünür olduğunda `onLastPage` çağrılır (FG-4.2). Dosya kendi sunucumuzdan gelir.
 */
export function PdfViewer({ assetId, title, onLastPage }: { assetId: string; title: string; onLastPage?: () => void }) {
  const t = useTranslations("learn.pdf");
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState(1);
  const lastPageRef = useRef(onLastPage);
  useEffect(() => {
    lastPageRef.current = onLastPage;
  });

  useEffect(() => {
    let cancelled = false;
    // pdfjs 6: belge ve worker bağlantısı yükleme görevi üzerinden kapatılır
    let task: { destroy(): Promise<void> } | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (!pdfjs.GlobalWorkerOptions.workerPort) {
          pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
        }
        const loading = pdfjs.getDocument({ url: `/api/media/${assetId}/file` });
        task = loading;
        const loaded = await loading.promise;
        if (cancelled) return void loading.destroy();
        setDoc(loaded);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [assetId]);

  if (failed) {
    return (
      <p role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border p-4">
        {t("error")}
        <a href={`/api/media/${assetId}/file`} target="_blank" rel="noopener" className="inline-flex min-h-12 items-center gap-1 underline underline-offset-4">
          <ExternalLink aria-hidden="true" className="size-4" />
          {t("open")}
        </a>
      </p>
    );
  }
  if (!doc) {
    return (
      <p className="flex min-h-40 items-center justify-center gap-2 rounded-xl border text-muted-foreground" role="status">
        <Loader2 aria-hidden="true" className="animate-spin" />
        {t("loading")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="sticky top-0 z-10 self-end rounded-full bg-background/90 px-3 py-1 text-sm shadow-sm" aria-live="polite">
        {t("page", { current, total: doc.numPages })}
      </p>
      <div className="flex flex-col gap-3" role="document" aria-label={title}>
        {Array.from({ length: doc.numPages }, (_, i) => (
          <PdfPage
            key={i}
            doc={doc}
            pageNumber={i + 1}
            label={t("pageLabel", { n: i + 1 })}
            onVisible={() => {
              setCurrent(i + 1);
              if (i + 1 === doc.numPages) lastPageRef.current?.();
            }}
          />
        ))}
      </div>
    </div>
  );
}

function PdfPage({ doc, pageNumber, label, onVisible }: { doc: PDFDocumentProxy; pageNumber: number; label: string; onVisible: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);
  const visibleRef = useRef(onVisible);
  useEffect(() => {
    visibleRef.current = onVisible;
  });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          visibleRef.current();
          if (!rendered) void render();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    async function render() {
      const page = await doc.getPage(pageNumber);
      const width = el!.clientWidth || 800;
      const viewport = page.getViewport({ scale: 1 });
      const scale = (width / viewport.width) * Math.min(2, window.devicePixelRatio || 1);
      const scaled = page.getViewport({ scale });
      const c = canvas.current;
      if (!c) return;
      c.width = scaled.width;
      c.height = scaled.height;
      await page.render({ canvas: c, viewport: scaled }).promise;
      setRendered(true);
    }
    return () => io.disconnect();
  }, [doc, pageNumber, rendered]);

  return (
    <div ref={box} className="min-h-40 w-full overflow-hidden rounded-xl border bg-white">
      <canvas ref={canvas} aria-label={label} role="img" className="h-auto w-full" />
    </div>
  );
}
