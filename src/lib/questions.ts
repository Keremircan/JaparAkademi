/** Doğru/yanlış sorularının şık metinleri (soru içeriğidir; Excel aktarımı ve form aynı değeri kullanır). */
export const TRUE_FALSE_OPTIONS = ["Doğru", "Yanlış"];

/** Soru tipleri (karar #13, #203, #204). */
export const QUESTION_TYPES = ["single_choice", "true_false", "matching", "hotspot"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Eşleştirme sorusunda çift sayısı (karar #203). */
export const MATCHING_MIN_PAIRS = 3;
export const MATCHING_MAX_PAIRS = 6;
/** Görselde işaretleme sorusunda en fazla doğru bölge. */
export const HOTSPOT_MAX_REGIONS = 5;

export type MatchingPair = { left: string; right: string };
/** Oranlı koordinatlar (0–1); daire ekranda daire görünsün diye elips olarak saklanır (karar #204). */
export type HotspotRegion =
  | { shape: "rect"; x: number; y: number; w: number; h: number }
  | { shape: "ellipse"; cx: number; cy: number; rx: number; ry: number };
export type HotspotPoint = { x: number; y: number };
