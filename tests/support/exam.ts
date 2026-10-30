import type { AttemptQuestion } from "@/server/services/exams";

/** Çoktan seçmeli sorunun gösterilen şıkları (diğer tiplerde boş). */
export const opts = (q: AttemptQuestion): string[] => (q.type === "choice" ? q.options : []);

/** Çoktan seçmeli cevap girdisi. */
export const choice = (shownIndex: number | null) => ({ kind: "choice" as const, shownIndex });
