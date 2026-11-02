/** Yazı boyutu tercihi (iş paketi 3.6, karar #244; SPEC 13.1 "büyük yazı seçeneği"). */
export const TEXT_SIZES = ["normal", "large"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export function toTextSize(value: unknown): TextSize {
  return value === "large" ? "large" : "normal";
}
