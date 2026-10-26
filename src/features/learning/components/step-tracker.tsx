"use client";

import { CheckCircle2, Download, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { VideoPlayer } from "@/features/content/components/video-player";
import { acknowledgeAction, reportEndAction, reportVideoAction } from "../actions";
import { PdfViewer } from "./pdf-viewer";

type Mode =
  | { kind: "scroll" }
  | { kind: "video"; assetId: string; durationSec: number; target: number }
  | { kind: "pdf"; assetId: string; fileName: string }
  | { kind: "download"; assetId: string; fileName: string };

/**
 * Bir eğitim adımını izler (FG-4.2): sayfa sonu / video eşiği / PDF son sayfa / dosya açma.
 * Sona ulaşılınca "Okudum, anladım" etkinleşir; onay zaman damgasıyla kaydedilir.
 */
export function StepTracker({
  itemId,
  title,
  mode,
  initialReached,
  initialRatio,
  acknowledged,
  children,
}: {
  itemId: string;
  title: string;
  mode: Mode;
  initialReached: boolean;
  initialRatio: number;
  acknowledged: boolean;
  children?: ReactNode;
}) {
  const t = useTranslations("learn.step");
  const router = useRouter();
  const pathname = usePathname();
  const [reached, setReached] = useState(initialReached);
  const [ratio, setRatio] = useState(initialRatio);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);
  const reportedEnd = useRef(initialReached);

  const markEnd = useCallback(
    async (r = 1) => {
      if (reportedEnd.current || acknowledged) return;
      if (r >= 1) reportedEnd.current = true;
      const res = await reportEndAction(itemId, r);
      if (res.ok && r >= 1) setReached(true);
      if (!res.ok) reportedEnd.current = false;
    },
    [itemId, acknowledged],
  );

  // Sayfa sonu: içeriğin altındaki işaretçi görününce
  useEffect(() => {
    if (mode.kind !== "scroll" || reached || acknowledged || !sentinel.current) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void markEnd(1);
    });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [mode.kind, reached, acknowledged, markEnd]);

  // Video: izlenen aralıklar biriktirilir ve aralıklarla sunucuya gönderilir
  const tracker = useCallback(
    (video: HTMLVideoElement) => {
      let start: number | null = null;
      let last = 0;
      let pendingRanges: [number, number][] = [];
      const close = () => {
        if (start !== null && last > start) pendingRanges.push([start, last]);
        start = null;
      };
      const flush = async () => {
        close();
        if (!video.paused && !video.ended) start = video.currentTime;
        if (pendingRanges.length === 0) return;
        const batch = pendingRanges;
        pendingRanges = [];
        const res = await reportVideoAction(itemId, batch);
        if (res.ok) {
          setRatio(res.data.ratio);
          if (res.data.reachedEnd) setReached(true);
        } else pendingRanges.push(...batch);
      };
      const onPlay = () => {
        start = video.currentTime;
        last = video.currentTime;
      };
      const onTime = () => {
        const now = video.currentTime;
        // Normal oynatmada küçük adımlar; büyük sıçrama = ileri/geri sarma (izlenmemiş kısım sayılmaz)
        if (start !== null && (now < last || now - last > 3)) {
          close();
          start = now;
        }
        last = now;
      };
      const onStop = () => {
        last = video.currentTime;
        void flush();
      };
      const onSeeking = () => close();
      const onSeeked = () => {
        if (!video.paused) {
          start = video.currentTime;
          last = video.currentTime;
        }
      };
      const onHidden = () => {
        if (document.visibilityState === "hidden") void flush();
      };
      video.addEventListener("play", onPlay);
      video.addEventListener("timeupdate", onTime);
      video.addEventListener("pause", onStop);
      video.addEventListener("ended", onStop);
      video.addEventListener("seeking", onSeeking);
      video.addEventListener("seeked", onSeeked);
      document.addEventListener("visibilitychange", onHidden);
      const timer = setInterval(() => void flush(), 10_000);
      return () => {
        clearInterval(timer);
        void flush();
        video.removeEventListener("play", onPlay);
        video.removeEventListener("timeupdate", onTime);
        video.removeEventListener("pause", onStop);
        video.removeEventListener("ended", onStop);
        video.removeEventListener("seeking", onSeeking);
        video.removeEventListener("seeked", onSeeked);
        document.removeEventListener("visibilitychange", onHidden);
      };
    },
    [itemId],
  );

  function acknowledge() {
    setError(null);
    startTransition(async () => {
      const res = await acknowledgeAction(itemId);
      if (!res.ok) return setError(res.error);
      router.replace(pathname);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {mode.kind === "video" && (
        <div className="flex flex-col gap-2">
          <VideoPlayer assetId={mode.assetId} title={title} tracker={acknowledged ? undefined : tracker} />
          {!acknowledged && (
            <div className="flex flex-col gap-1">
              <progress max={1} value={ratio} className="h-3 w-full accent-primary" aria-label={t("watched")} />
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {t("watchedPercent", { percent: Math.round(ratio * 100), target: Math.round(mode.target * 100) })}
              </p>
            </div>
          )}
        </div>
      )}
      {mode.kind === "pdf" && <PdfViewer assetId={mode.assetId} title={title} onLastPage={() => void markEnd(1)} />}
      {children}
      {mode.kind === "download" && (
        <Button
          size="lg"
          variant="outline"
          className="self-start"
          nativeButton={false}
          render={<a href={`/api/media/${mode.assetId}/download`} onClick={() => void markEnd(1)} />}
        >
          <Download aria-hidden="true" />
          {t("download", { name: mode.fileName })}
        </Button>
      )}
      <div ref={sentinel} aria-hidden="true" className="h-px" />

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-10 flex flex-col gap-2 rounded-2xl border bg-background/95 p-3 shadow-sm backdrop-blur lg:bottom-4">
        {acknowledged ? (
          <p className="flex min-h-12 items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 aria-hidden="true" />
            {t("acknowledged")}
          </p>
        ) : (
          <>
            <Button size="lg" disabled={!reached || pending} onClick={acknowledge}>
              {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <CheckCircle2 aria-hidden="true" />}
              {t("acknowledge")}
            </Button>
            {!reached && (
              <p className="text-sm text-muted-foreground" role="status">
                {t(`hint.${mode.kind}`)}
              </p>
            )}
            <FormError error={error} />
          </>
        )}
      </div>
    </div>
  );
}
