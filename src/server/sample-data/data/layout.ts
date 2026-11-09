/**
 * Örnek görsellerin ortak ölçüleri: görselde işaretleme sorularının doğru bölgesi, çizilen görselle aynı yerdedir.
 * Koordinatlar görsel genişliğine/yüksekliğine oranlıdır (0–1).
 */

export const HOTSPOT_IMAGE = { width: 1200, height: 800 } as const;

/** Pres kumanda panosu: sarı zemin üzerindeki kırmızı mantar başlı acil durdurma butonu. */
export const PANEL_ESTOP = { cx: 0.76, cy: 0.42, r: 96 } as const;

/** Saha planı: toplanma alanı (yeşil kare, içe bakan oklar). */
export const SITE_ASSEMBLY = { x: 0.8, y: 0.07, w: 0.15, h: 0.22 } as const;

export const panelEstopRegion = () => ({
  shape: "ellipse" as const,
  cx: PANEL_ESTOP.cx,
  cy: PANEL_ESTOP.cy,
  rx: Math.round(((PANEL_ESTOP.r * 1.15) / HOTSPOT_IMAGE.width) * 10_000) / 10_000,
  ry: Math.round(((PANEL_ESTOP.r * 1.15) / HOTSPOT_IMAGE.height) * 10_000) / 10_000,
});

export const siteAssemblyRegion = () => ({ shape: "rect" as const, ...SITE_ASSEMBLY });
