"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

/**
 * Yönetim özeti eğilimi (iş paketi 3.5): iki küçük grafik yan yana — aylık tamamlanan eğitim (sütun) ve ilk denemede
 * geçme oranı (çizgi, 0–100). İki ölçek tek eksende birleştirilmez. Fare/dokunma ve klavye (sol/sağ ok) aynı ayı iki
 * grafikte birlikte gösterir; bütün değerler ayrıca sayfadaki tabloda vardır. Metinler sunucuda biçimlenip gelir.
 */

export type TrendDatum = {
  /** Eksen etiketi (kısa ay adı). */
  label: string;
  /** Uzun ay adı; bitmemiş ayda "(devam ediyor)" ekli. */
  title: string;
  partial: boolean;
  completed: number;
  completedText: string;
  rate: number | null;
  rateText: string;
  rateDetail: string | null;
};

export type ChartTexts = { title: string; aria: string; keyboard: string; empty: string };

const HEIGHT = 220;
const M = { top: 24, right: 12, bottom: 30, left: 44 };
const PLOT_H = HEIGHT - M.top - M.bottom;

type ChartId = "completed" | "rate";

export function TrendCharts({
  data,
  completed,
  rate,
  rateTicks,
  locale,
}: {
  data: TrendDatum[];
  completed: ChartTexts;
  rate: ChartTexts;
  rateTicks: [string, string, string];
  locale: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [focused, setFocused] = useState<ChartId | null>(null);
  const shared = { data, active, setActive, focused, setFocused };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartFrame id="completed" texts={completed} empty={data.every((d) => d.completed === 0)} readout={(d) => ({ value: d.completedText, detail: null })} {...shared}>
        {(width) => <Columns data={data} width={width} active={active} locale={locale} />}
      </ChartFrame>
      <ChartFrame id="rate" texts={rate} empty={data.every((d) => d.rate === null)} readout={(d) => ({ value: d.rateText, detail: d.rateDetail })} {...shared}>
        {(width) => <RateLine data={data} width={width} active={active} ticks={rateTicks} />}
      </ChartFrame>
    </div>
  );
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry!.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Ayın yatay merkezi. */
function centerX(i: number, n: number, width: number): number {
  const band = (width - M.left - M.right) / n;
  return M.left + band * (i + 0.5);
}

function ChartFrame({
  id,
  texts,
  empty,
  data,
  active,
  setActive,
  focused,
  setFocused,
  readout,
  children,
}: {
  id: ChartId;
  texts: ChartTexts;
  empty: boolean;
  data: TrendDatum[];
  active: number | null;
  setActive: (i: number | null) => void;
  focused: ChartId | null;
  setFocused: (id: ChartId | null) => void;
  readout: (d: TrendDatum) => { value: string; detail: string | null };
  children: (width: number) => ReactNode;
}) {
  const [ref, width] = useWidth();
  const n = data.length;
  const current = active === null ? null : data[active];
  const shown = current ? readout(current) : null;

  // İpucu kutusu ayın ortasına hizalanır, kenarda grafiğin içine kaydırılır (ölçülen genişlikle; telefonda taşmaz)
  const tipRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!tip || active === null) return;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.min(Math.max(centerX(active, n, width) - w / 2, 0), Math.max(0, width - w))}px`;
  });

  // İşaretçinin en yakın ayı: ince çizgiyi ya da çubuğu değil, ayın bütün sütununu hedefler
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const band = (width - M.left - M.right) / n;
    setActive(Math.min(n - 1, Math.max(0, Math.floor((x - M.left) / band))));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = n - 1;
    const next = { ArrowLeft: Math.max(0, (active ?? last) - 1), ArrowRight: Math.min(last, (active ?? last) + 1), Home: 0, End: last }[e.key];
    if (next === undefined) {
      if (e.key === "Escape") setActive(null);
      return;
    }
    e.preventDefault();
    setActive(next);
  };

  return (
    <figure className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4">
      <figcaption className="font-medium">{texts.title}</figcaption>
      {empty ? (
        <p className="flex min-h-20 items-center text-muted-foreground">{texts.empty}</p>
      ) : (
        <div
          ref={ref}
          role="group"
          aria-label={texts.keyboard}
          tabIndex={0}
          className="relative rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => {
            if (focused === null) setActive(null);
          }}
          onFocus={() => {
            setFocused(id);
            if (active === null) setActive(n - 1);
          }}
          onBlur={() => {
            setFocused(null);
            setActive(null);
          }}
          onKeyDown={onKey}
        >
          <svg role="img" aria-label={texts.aria} viewBox={`0 0 ${width} ${HEIGHT}`} width="100%" height={HEIGHT} className="block touch-pan-y select-none">
            {children(width)}
          </svg>
          {current && shown && (
            <div
              ref={tipRef}
              aria-hidden="true"
              className="pointer-events-none absolute top-0 z-10 w-max max-w-full rounded-lg border bg-popover px-3 py-2 text-sm shadow-md"
            >
              <p className="text-base font-semibold">{shown.value}</p>
              <p className="text-muted-foreground">{current.title}</p>
              {shown.detail && <p className="text-muted-foreground">{shown.detail}</p>}
            </div>
          )}
          <p className="sr-only" aria-live="polite">
            {focused === id && current && shown ? `${current.title}: ${shown.value}${shown.detail ? `, ${shown.detail}` : ""}` : ""}
          </p>
        </div>
      )}
    </figure>
  );
}

/** Sayılar için yuvarlak eksen adımları (en az 1). */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 3;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough)!);
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

/** Üstü 4px yuvarlak, tabanı düz sütun. */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, h, w / 2);
  const b = y + h;
  return `M${x},${b}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${b}Z`;
}

function Grid({ width, ticks, top, labels }: { width: number; ticks: number[]; top: number; labels: string[] }) {
  return (
    <g>
      {ticks.map((t, i) => {
        const y = M.top + PLOT_H - (t / top) * PLOT_H;
        return (
          <g key={t}>
            <line
              x1={M.left}
              x2={width - M.right}
              y1={y}
              y2={y}
              strokeWidth={1}
              shapeRendering="crispEdges"
              className={i === 0 ? "stroke-muted-foreground/50" : "stroke-border"}
            />
            <text x={M.left - 8} y={y} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-xs tabular-nums">
              {labels[i]}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function MonthAxis({ data, width }: { data: TrendDatum[]; width: number }) {
  const n = data.length;
  const band = (width - M.left - M.right) / n;
  return (
    <g>
      {data.map((d, i) =>
        // Dar ekranda bir atlayarak (son ay her zaman görünür)
        band >= 34 || (n - 1 - i) % 2 === 0 ? (
          <text key={i} x={centerX(i, n, width)} y={HEIGHT - 10} textAnchor="middle" className="fill-muted-foreground text-xs">
            {d.label}
          </text>
        ) : null,
      )}
    </g>
  );
}

function ActiveBand({ index, n, width }: { index: number | null; n: number; width: number }) {
  if (index === null) return null;
  const band = (width - M.left - M.right) / n;
  return <rect x={M.left + band * index} y={M.top} width={band} height={PLOT_H} className="fill-muted" />;
}

function Columns({ data, width, active, locale }: { data: TrendDatum[]; width: number; active: number | null; locale: string }) {
  const n = data.length;
  const max = Math.max(...data.map((d) => d.completed));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1]!;
  const fmt = new Intl.NumberFormat(locale === "en" ? "en-GB" : "tr-TR", { notation: "compact" });
  const band = (width - M.left - M.right) / n;
  const barW = Math.min(24, Math.max(4, band * 0.6));
  // Seçici etiket: son ay ve en yüksek ay (her sütuna sayı yazılmaz)
  const maxIndex = data.findIndex((d) => d.completed === max);
  const labelled = new Set([n - 1, maxIndex]);
  return (
    <>
      <ActiveBand index={active} n={n} width={width} />
      <Grid width={width} ticks={ticks} top={top} labels={ticks.map((t) => fmt.format(t))} />
      {data.map((d, i) => {
        if (d.completed <= 0) return null;
        const h = (d.completed / top) * PLOT_H;
        const x = centerX(i, n, width) - barW / 2;
        const y = M.top + PLOT_H - h;
        return (
          <g key={i}>
            <path d={columnPath(x, y, barW, h)} className="fill-viz-series" fillOpacity={d.partial ? 0.45 : 1} />
            {labelled.has(i) && (
              <text x={x + barW / 2} y={y - 6} textAnchor="middle" className="fill-foreground text-xs font-medium">
                {d.completedText}
              </text>
            )}
          </g>
        );
      })}
      <MonthAxis data={data} width={width} />
    </>
  );
}

function RateLine({ data, width, active, ticks }: { data: TrendDatum[]; width: number; active: number | null; ticks: [string, string, string] }) {
  const n = data.length;
  const y = (rate: number) => M.top + PLOT_H - (rate / 100) * PLOT_H;
  // Sınav olmayan ayda çizgi kesilir
  let path = "";
  let open = false;
  data.forEach((d, i) => {
    if (d.rate === null) {
      open = false;
      return;
    }
    path += `${open ? "L" : "M"}${centerX(i, n, width)},${y(d.rate)}`;
    open = true;
  });
  const lastIndex = data.findLastIndex((d) => d.rate !== null);
  return (
    <>
      <Grid width={width} ticks={[0, 50, 100]} top={100} labels={ticks} />
      {active !== null && (
        <line x1={centerX(active, n, width)} x2={centerX(active, n, width)} y1={M.top} y2={M.top + PLOT_H} strokeWidth={1} className="stroke-muted-foreground" />
      )}
      <path d={path} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-viz-series" />
      {data.map((d, i) =>
        d.rate === null ? null : (
          <circle
            key={i}
            cx={centerX(i, n, width)}
            cy={y(d.rate)}
            r={active === i ? 6 : 4}
            strokeWidth={2}
            // Bitmemiş ay içi boş; diğerleri yüzey renginde halkalı
            className={d.partial ? "fill-card stroke-viz-series" : "fill-viz-series stroke-card"}
          />
        ),
      )}
      {lastIndex >= 0 && (
        <text x={centerX(lastIndex, n, width)} y={y(data[lastIndex]!.rate!) - 10} textAnchor="middle" className="fill-foreground text-xs font-medium">
          {data[lastIndex]!.rateText}
        </text>
      )}
      <MonthAxis data={data} width={width} />
    </>
  );
}
