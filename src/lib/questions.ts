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

/** Doğru/yanlış şıklarının İngilizcesi (çeviri girilmese de İngilizce soruda kullanılır). */
export const TRUE_FALSE_OPTIONS_EN = ["True", "False"];

/**
 * Sorunun isteğe bağlı İngilizce metni (karar #207). Şık ve çift sayısı Türkçeyle aynıdır, sıralar eşleşir;
 * doğru cevap ve bölgeler Türkçe sürümdeki gibidir.
 */
export type QuestionTranslation = { stem: string; options?: string[]; pairs?: MatchingPair[]; explanation?: string | null };
export type QuestionTranslations = { en?: QuestionTranslation };

/**
 * Kursiyerin dilinde soru metinleri (karar #207): İngilizcesi varsa o, yoksa Türkçe. Yalnızca metinler değişir;
 * şık ve çift sıraları aynı olduğundan doğru cevap ve kayıtlı sıra (optionOrder) etkilenmez.
 */
export function questionTexts(
  v: { type: QuestionType; stem: string; options: string[]; pairs: MatchingPair[] | null; translations: QuestionTranslations | null },
  locale: string,
): { locale: "tr" | "en"; stem: string; options: string[]; pairs: MatchingPair[] | null } {
  const en = locale === "en" ? v.translations?.en : undefined;
  if (!en?.stem) return { locale: "tr", stem: v.stem, options: v.options, pairs: v.pairs };
  const options =
    v.type === "true_false" ? TRUE_FALSE_OPTIONS_EN : en.options && en.options.length === v.options.length ? en.options : v.options;
  const pairs = v.pairs && en.pairs && en.pairs.length === v.pairs.length ? en.pairs : v.pairs;
  return { locale: "en", stem: en.stem, options, pairs };
}
