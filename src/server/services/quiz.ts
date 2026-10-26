import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertUser } from "@/server/authz/policy";
import { db } from "@/server/db/client";
import { quizQuestions } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { canDraftContent } from "./content/access";
import { loadModule } from "./modules";

/**
 * Ara değerlendirme soruları (FG-4.3, karar #53): teorik modülü düzenleyebilen kişi yazar; 0 ya da 3–5 soru.
 * Not etkisi olmadığı için onaya gitmez. Cevaplar soru metninin kopyasıyla saklandığından soru düzenlenebilir.
 */

export const QUIZ_MIN = 3;
export const QUIZ_MAX = 5;

export type QuizQuestionInput = {
  id?: string;
  type: "single_choice" | "true_false";
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
};

export async function listQuizQuestions(actor: Actor, moduleId: string) {
  await loadModule(actor, moduleId);
  return db()
    .select({
      id: quizQuestions.id,
      type: quizQuestions.type,
      stem: quizQuestions.stem,
      options: quizQuestions.options,
      correctIndex: quizQuestions.correctIndex,
      explanation: quizQuestions.explanation,
    })
    .from(quizQuestions)
    .where(and(eq(quizQuestions.moduleId, moduleId), isNull(quizQuestions.archivedAt)))
    .orderBy(asc(quizQuestions.sortOrder));
}

function normalize(q: QuizQuestionInput): QuizQuestionInput {
  const stem = q.stem.trim();
  if (stem.length < 5 || stem.length > 1000) throw new ValidationError("quiz_stem_invalid");
  // Doğru/yanlış sorusunda şık metinleri arayüzden gelir (iki şık)
  const options = q.options.map((o) => o.trim());
  if ((q.type === "true_false" && options.length !== 2) || options.length < 2 || options.length > 6 || options.some((o) => o.length < 1 || o.length > 300)) throw new ValidationError("quiz_options_invalid");
  if (new Set(options.map((o) => o.toLocaleLowerCase("tr-TR"))).size !== options.length) throw new ValidationError("quiz_options_invalid");
  if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= options.length) throw new ValidationError("quiz_correct_invalid");
  return { ...q, stem, options, explanation: q.explanation?.trim() || null };
}

/** Soruları kaydeder (listeden çıkan soru arşivlenir; verilmiş cevaplar korunur). */
export async function saveQuizQuestions(actor: Actor, moduleId: string, input: QuizQuestionInput[]): Promise<void> {
  assertUser(actor);
  const questions = input.map(normalize);
  if (questions.length !== 0 && (questions.length < QUIZ_MIN || questions.length > QUIZ_MAX)) throw new ValidationError("quiz_count_invalid");
  await withActor(actor, async (tx) => {
    const { module: m, access } = await loadModule(actor, moduleId, tx);
    if (m.archivedAt || !canDraftContent(access, m)) throw new ForbiddenError("modules.edit");
    if (m.kind !== "theory") throw new ValidationError("module_kind_invalid");
    const current = await tx.select({ id: quizQuestions.id }).from(quizQuestions).where(and(eq(quizQuestions.moduleId, m.id), isNull(quizQuestions.archivedAt)));
    const currentIds = new Set(current.map((c) => c.id));
    const keep = new Set(questions.filter((q) => q.id).map((q) => q.id!));
    if ([...keep].some((id) => !currentIds.has(id))) throw new ValidationError("quiz_question_invalid");
    const removed = [...currentIds].filter((id) => !keep.has(id));
    if (removed.length) await tx.update(quizQuestions).set({ archivedAt: new Date() }).where(inArray(quizQuestions.id, removed));
    for (const [i, q] of questions.entries()) {
      const values = { type: q.type, stem: q.stem, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation, sortOrder: i };
      if (q.id) await tx.update(quizQuestions).set(values).where(eq(quizQuestions.id, q.id));
      else await tx.insert(quizQuestions).values({ ...values, moduleId: m.id, createdBy: actor.userId });
    }
  });
}
