"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import type { QuizItem } from "@/server/services/assignments/learner";
import { answerQuizAction } from "../actions";

/** Ara değerlendirme (FG-4.3): her soru bir kez cevaplanır; not etkisi yoktur. */
export function QuizPanel({ assignmentModuleId, questions }: { assignmentModuleId: string; questions: QuizItem[] }) {
  const t = useTranslations("learn.quiz");
  return (
    <section aria-labelledby="quiz-heading" className="flex flex-col gap-4 rounded-2xl border p-4 sm:p-5">
      <h2 id="quiz-heading" className="text-xl font-semibold">
        {t("heading")}
      </h2>
      <p className="text-muted-foreground">{t("intro")}</p>
      <ol className="flex flex-col gap-6">
        {questions.map((q, i) => (
          <QuizQuestion key={q.id} assignmentModuleId={assignmentModuleId} question={q} n={i + 1} />
        ))}
      </ol>
    </section>
  );
}

function QuizQuestion({ assignmentModuleId, question, n }: { assignmentModuleId: string; question: QuizItem; n: number }) {
  const t = useTranslations("learn.quiz");
  const router = useRouter();
  const name = useId();
  const [selected, setSelected] = useState<number | null>(question.answer?.answerIndex ?? null);
  const [answer, setAnswer] = useState(question.answer);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (selected === null) return;
    setError(null);
    startTransition(async () => {
      const r = await answerQuizAction(assignmentModuleId, question.id, selected);
      if (!r.ok) return setError(r.error);
      setAnswer({ answerIndex: selected, isCorrect: r.data.isCorrect, correctIndex: r.data.correctIndex, explanation: r.data.explanation });
      if (r.data.moduleCompleted) router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-3">
      <fieldset disabled={!!answer || pending} className="flex flex-col gap-2">
        <legend className="mb-2 text-lg font-medium">
          {n}. {question.stem}
        </legend>
        {question.options.map((o, i) => {
          const isCorrect = answer && i === answer.correctIndex;
          const isWrongPick = answer && i === answer.answerIndex && !answer.isCorrect;
          return (
            <label
              key={i}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 has-checked:border-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50 ${
                isCorrect ? "border-emerald-600 bg-emerald-500/10" : isWrongPick ? "border-destructive bg-destructive/10" : ""
              }`}
            >
              <input type="radio" name={name} className="size-5 accent-primary" checked={selected === i} onChange={() => setSelected(i)} />
              <span className="flex-1">{o}</span>
              {isCorrect && <CheckCircle2 aria-label={t("correctOption")} className="size-5 text-emerald-600" />}
              {isWrongPick && <XCircle aria-label={t("yourAnswer")} className="size-5 text-destructive" />}
            </label>
          );
        })}
      </fieldset>
      {answer ? (
        <div role="status" className={`rounded-xl p-3 ${answer.isCorrect ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
          <p className="font-medium">{answer.isCorrect ? t("correct") : t("wrong")}</p>
          {answer.explanation && <p className="mt-1">{answer.explanation}</p>}
        </div>
      ) : (
        <Button className="self-start" disabled={selected === null || pending} onClick={submit}>
          {t("answer")}
        </Button>
      )}
      <FormError error={error} />
    </li>
  );
}
