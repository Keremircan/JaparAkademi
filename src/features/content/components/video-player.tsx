"use client";

import type Hls from "hls.js";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { NativeSelect } from "@/components/ui/native-select";

type Level = { index: number; height: number };

/**
 * HLS video oynatıcı. Safari yerel HLS kullanır; diğer tarayıcılarda hls.js.
 * "Düşük kalite" seçimi mobil veri tasarrufu içindir (SPEC 13.2).
 */
export function VideoPlayer({
  assetId,
  title,
  tracker,
}: {
  assetId: string;
  title: string;
  /** İzleme takibi (kursiyer): video öğesine olay dinleyicileri bağlar, temizleme fonksiyonu döner. */
  tracker?: (video: HTMLVideoElement) => () => void;
}) {
  const t = useTranslations("content.video");
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [quality, setQuality] = useState("auto");
  const [failed, setFailed] = useState(false);
  const selectId = useId();
  const src = `/api/media/${assetId}/hls/master.m3u8`;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let destroyed = false;
    (async () => {
      const { default: HlsLib } = await import("hls.js");
      if (destroyed) return;
      if (HlsLib.isSupported()) {
        const hls = new HlsLib({ capLevelToPlayerSize: true });
        hlsRef.current = hls;
        hls.on(HlsLib.Events.MANIFEST_PARSED, (_e, data) => {
          setLevels(data.levels.map((l, index) => ({ index, height: l.height })));
        });
        hls.on(HlsLib.Events.ERROR, (_e, data) => {
          if (data.fatal) setFailed(true);
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
      } else {
        setFailed(true);
      }
    })();
    return () => {
      destroyed = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !tracker) return;
    return tracker(video);
  }, [tracker]);

  function changeQuality(value: string) {
    setQuality(value);
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = value === "auto" ? -1 : Number(value);
  }

  const lowest = levels.length ? levels.reduce((a, b) => (a.height <= b.height ? a : b)) : null;

  return (
    <div className="flex flex-col gap-2">
      <video
        ref={videoRef}
        controls
        playsInline
        preload="metadata"
        poster={`/api/media/${assetId}/poster`}
        aria-label={title}
        className="aspect-video w-full rounded-xl bg-black"
      />
      {failed && (
        <p role="alert" className="text-destructive">
          {t("error")}
        </p>
      )}
      {levels.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={selectId} className="text-sm font-medium">
            {t("quality")}
          </label>
          <NativeSelect id={selectId} value={quality} onChange={(e) => changeQuality(e.target.value)} className="w-56">
            <option value="auto">{t("auto")}</option>
            {[...levels]
              .sort((a, b) => a.height - b.height)
              .map((l) => (
                <option key={l.index} value={String(l.index)}>
                  {l === lowest ? t("low", { height: l.height }) : `${l.height}p`}
                </option>
              ))}
          </NativeSelect>
        </div>
      )}
    </div>
  );
}
