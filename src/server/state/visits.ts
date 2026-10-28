/**
 * Ziyaret durumları (SPEC 8.2, iş paketi 2.2, karar #135), saf kurallar.
 * planned → briefed → checked_in → checked_out; iptal yalnızca girişten önce ve gerekçeyle.
 * briefed / checked_in / checked_out geçişleri 2.3'te (bilgilendirme ve kapı) kullanılır.
 */
export const VISIT_STATUSES = ["planned", "briefed", "checked_in", "checked_out", "cancelled"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

const TRANSITIONS: Record<VisitStatus, readonly VisitStatus[]> = {
  planned: ["briefed", "cancelled"],
  briefed: ["checked_in", "cancelled"],
  checked_in: ["checked_out"],
  checked_out: [],
  cancelled: [],
};

export function canTransition(from: VisitStatus, to: VisitStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Ön kayıt bilgileri yalnızca bilgilendirme başlamadan değiştirilebilir. */
export function isVisitEditable(status: VisitStatus): boolean {
  return status === "planned";
}

export function isVisitCancellable(status: VisitStatus): boolean {
  return canTransition(status, "cancelled");
}

/** Kara liste kaydı verilen günde geçerli mi (kaldırılmamış ve bitiş tarihi geçmemiş). */
export function isBlacklistActive(entry: { liftedAt: Date | null; endsAt: string | null }, today: string): boolean {
  return entry.liftedAt === null && (entry.endsAt === null || entry.endsAt >= today);
}

/**
 * Ziyaretçi anonimleştirme sınırı (karar #134): son ziyaret tarihi + N yıl dolduysa.
 * Taşeron ziyareti olan kişide taşeron süresi, diğerlerinde ziyaretçi süresi uygulanır.
 */
export function visitorRetentionYears(types: readonly string[], visitorYears: number, contractorYears: number): number {
  return types.includes("contractor") ? contractorYears : visitorYears;
}

export type BriefingCardText = { titleTr: string; bodyTr: string; titleEn: string; bodyEn: string };
export type BriefingQuestionText = { stemTr: string; stemEn: string; optionsTr: string[]; optionsEn: string[]; correctIndex: number };

/**
 * Yayın kontrolü (FG-8.2): en az bir kart; her kart ve soru TR + EN dolu; şıklar boş değil;
 * soru havuzu tipin soru sayısından az değil.
 */
export function briefingProblems(
  data: { cards: BriefingCardText[]; questions: BriefingQuestionText[] },
  requiredQuestions: number,
): string[] {
  const problems: string[] = [];
  const filled = (s: string) => s.trim().length > 0;
  if (data.cards.length === 0) problems.push("briefing_no_cards");
  if (data.cards.some((c) => !filled(c.titleTr) || !filled(c.bodyTr) || !filled(c.titleEn) || !filled(c.bodyEn))) problems.push("briefing_card_incomplete");
  if (
    data.questions.some(
      (q) =>
        !filled(q.stemTr) ||
        !filled(q.stemEn) ||
        q.optionsTr.length !== q.optionsEn.length ||
        q.optionsTr.some((o) => !filled(o)) ||
        q.optionsEn.some((o) => !filled(o)) ||
        q.correctIndex >= q.optionsTr.length,
    )
  )
    problems.push("briefing_question_incomplete");
  if (data.questions.length < requiredQuestions) problems.push("briefing_not_enough_questions");
  return problems;
}
