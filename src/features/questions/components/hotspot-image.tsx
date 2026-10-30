"use client";

import { Circle, Square, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { HOTSPOT_MAX_REGIONS, type HotspotPoint, type HotspotRegion } from "@/lib/questions";

/**
 * Görselde işaretleme (karar #204). Koordinatlar görsel boyutuna oranlıdır (0–1); SVG katmanı 0–100 görünüm kutusuyla
 * görselin üzerine oturur, böylece her ekran boyutunda aynı yeri gösterir.
 */

const pct = (n: number) => n * 100;

/** Görsel + üzerine çizilen katman (bölgeler, işaret). Kapsayıcı görsel boyutunu alır. */
export function ImageStage({
  src,
  children,
  overlay,
  className = "",
}: {
  src: string;
  children?: ReactNode;
  overlay?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative inline-block max-w-full select-none ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" draggable={false} className="block h-auto max-h-[70vh] w-auto max-w-full rounded-xl border" />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
        {overlay}
      </svg>
      {children}
    </div>
  );
}

export function RegionShapes({ regions, highlight }: { regions: readonly HotspotRegion[]; highlight?: number | null }) {
  return (
    <>
      {regions.map((r, i) => {
        const cls = i === highlight ? "fill-amber-400/40 stroke-amber-500" : "fill-emerald-500/25 stroke-emerald-600";
        return r.shape === "rect" ? (
          <rect key={i} x={pct(r.x)} y={pct(r.y)} width={pct(r.w)} height={pct(r.h)} className={cls} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
        ) : (
          <ellipse key={i} cx={pct(r.cx)} cy={pct(r.cy)} rx={pct(r.rx)} ry={pct(r.ry)} className={cls} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
        );
      })}
    </>
  );
}

/** Dokunulan nokta: görsel en-boy oranından bağımsız, sabit boyutlu yuvarlak işaret (telefonda kolay görülür). */
export function PointMarker({ point }: { point: HotspotPoint }) {
  return (
    <span
      aria-hidden="true"
      data-testid="hotspot-marker"
      className="pointer-events-none absolute flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-primary bg-primary/25 shadow-[0_0_0_3px_var(--background)]"
      style={{ left: `${pct(point.x)}%`, top: `${pct(point.y)}%` }}
    >
      <span className="size-2 rounded-full bg-primary" />
    </span>
  );
}

function relative(e: PointerEvent<HTMLElement>): { p: HotspotPoint; w: number; h: number } {
  const box = e.currentTarget.getBoundingClientRect();
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return { p: { x: clamp((e.clientX - box.left) / box.width), y: clamp((e.clientY - box.top) / box.height) }, w: box.width, h: box.height };
}

/** Soru yazarı: görsel üzerinde doğru bölgeleri sürükleyerek çizer (dikdörtgen veya daire). */
export function HotspotEditor({ src, regions, onChange }: { src: string; regions: HotspotRegion[]; onChange: (r: HotspotRegion[]) => void }) {
  const t = useTranslations("questions.form.hotspot");
  const [shape, setShape] = useState<"rect" | "ellipse">("rect");
  const [draft, setDraft] = useState<HotspotRegion | null>(null);
  const start = useRef<HotspotPoint | null>(null);
  const full = regions.length >= HOTSPOT_MAX_REGIONS;

  function build(a: HotspotPoint, b: HotspotPoint, w: number, h: number): HotspotRegion {
    if (shape === "rect") return { shape: "rect", x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
    // Daire: merkez başlangıç noktası, yarıçap ekranda piksel olarak eşit (oranlı elips)
    const r = Math.hypot((b.x - a.x) * w, (b.y - a.y) * h);
    const rx = Math.min(r / w, a.x, 1 - a.x);
    const ry = Math.min(r / h, a.y, 1 - a.y);
    return { shape: "ellipse", cx: a.x, cy: a.y, rx, ry };
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label={t("shape")} className="flex flex-wrap gap-2">
        {(["rect", "ellipse"] as const).map((s) => (
          <label key={s} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border-2 px-3 has-checked:border-primary has-checked:bg-primary/5">
            <input type="radio" className="sr-only" name="hotspot-shape" checked={shape === s} onChange={() => setShape(s)} />
            {s === "rect" ? <Square aria-hidden="true" className="size-5" /> : <Circle aria-hidden="true" className="size-5" />}
            {t(s)}
          </label>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{full ? t("full", { max: HOTSPOT_MAX_REGIONS }) : t("hint")}</p>
      <ImageStage src={src} overlay={<RegionShapes regions={draft ? [...regions, draft] : regions} highlight={draft ? regions.length : null} />}>
        <div
          data-testid="hotspot-editor"
          className={`absolute inset-0 ${full ? "cursor-not-allowed" : "cursor-crosshair"} touch-none`}
          onPointerDown={(e) => {
            if (full) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            start.current = relative(e).p;
          }}
          onPointerMove={(e) => {
            if (!start.current) return;
            const { p, w, h } = relative(e);
            setDraft(build(start.current, p, w, h));
          }}
          onPointerUp={(e) => {
            if (!start.current) return;
            const { p, w, h } = relative(e);
            const region = build(start.current, p, w, h);
            start.current = null;
            setDraft(null);
            const big = region.shape === "rect" ? region.w >= 0.01 && region.h >= 0.01 : region.rx >= 0.005 && region.ry >= 0.005;
            if (big) onChange([...regions, region]);
          }}
        />
      </ImageStage>
      {regions.length > 0 && (
        <ol className="flex flex-col gap-1">
          {regions.map((r, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="flex-1">{t("regionN", { n: i + 1, shape: t(r.shape) })}</span>
              <Button type="button" variant="ghost" size="icon" aria-label={t("remove", { n: i + 1 })} onClick={() => onChange(regions.filter((_, k) => k !== i))}>
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * Kursiyer: görsele dokunarak işaret koyar; işaret teslime kadar değiştirilebilir. Klavyeyle de kullanılabilir
 * (ok tuşları imleci taşır, Enter/Boşluk işaret koyar).
 */
export function HotspotAnswer({ src, value, onChange, label }: { src: string; value: HotspotPoint | null; onChange: (p: HotspotPoint) => void; label: string }) {
  const [cursor, setCursor] = useState<HotspotPoint>(value ?? { x: 0.5, y: 0.5 });
  const [keyboard, setKeyboard] = useState(false);
  const step = 0.02;
  const move = (dx: number, dy: number) => setCursor((c) => ({ x: Math.min(1, Math.max(0, c.x + dx)), y: Math.min(1, Math.max(0, c.y + dy)) }));
  return (
    <ImageStage
      src={src}
    >
      {value && <PointMarker point={value} />}
      {keyboard && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute size-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-dashed border-amber-500"
          style={{ left: `${pct(cursor.x)}%`, top: `${pct(cursor.y)}%` }}
        />
      )}
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        data-testid="hotspot-answer"
        className="absolute inset-0 cursor-crosshair rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        onPointerDown={(e) => {
          setKeyboard(false);
          const { p } = relative(e);
          setCursor(p);
          onChange(p);
        }}
        onFocus={() => setKeyboard(true)}
        onBlur={() => setKeyboard(false)}
        onKeyDown={(e) => {
          const k = e.key;
          if (k === "ArrowLeft") move(-step, 0);
          else if (k === "ArrowRight") move(step, 0);
          else if (k === "ArrowUp") move(0, -step);
          else if (k === "ArrowDown") move(0, step);
          else if (k === "Enter" || k === " ") onChange(cursor);
          else return;
          e.preventDefault();
          setKeyboard(true);
        }}
      />
    </ImageStage>
  );
}
