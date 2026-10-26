"use client";

import { ChevronLeft, ChevronRight, Send, Timer, Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import type { AttemptQuestion } from "@/server/services/exams";
import { answerExamAction, examEventAction, submitExamAction } from "../actions";

/**
 * Teorik sınav ekranı (Ekran 4). Süre sunucu saatine göre gösterilir; her seçim anında kaydedilir;
 * süre dolunca otomatik teslim edilir. Sekmeden çıkış kaydedilir (sınavı bitirmez). Sesli okuma kullanılırsa işaretlenir.
 */
export function ExamRunner({
  attemptId,
  title,
  deadlineAt,
  serverNow,
  questions,
}: {
  attemptId: string;
  title: string;
  deadlineAt: string;
  serverNow: string;
  questions: AttemptQuestion[];
}) {
  const t = useTranslations("exams.runner");
  const router = useRouter();
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map((q) => q.answer));
  const [index, setIndex] = useState(() => Math.max(0, questions.findIndex((q) => q.answer === null)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  // Sunucu ile cihaz saati arasındaki fark: süre sunucu saatine göre gösterilir
  const [offset] = useState(() => new Date(serverNow).getTime() - Date.now());
  const deadline = new Date(deadlineAt).getTime();
  const [left, setLeft] = useState(() => deadline - new Date(serverNow).getTime());
  const submitted = useRef(false);
  const ttsReported = useRef(false);

  const submit = useCallback(() => {
    if (submitted.current) return;
    submitted.current = true;
    startSubmit(async () => {
      const r = await submitExamAction(attemptId);
      if (!r.ok) {
        submitted.current = false;
        setError(r.error);
      }
      router.refresh();
    });
  }, [attemptId, router]);

  useEffect(() => {
    const timer = setInterval(() => {
      const ms = deadline - (Date.now() + offset);
      setLeft(ms);
      if (ms <= 0) submit();
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline, offset, submit]);

  // Kopya önlemi: sekmeden/uygulamadan çıkış kaydedilir
  useEffect(() => {
    const onVisibility = () => void examEventAction(attemptId, document.visibilityState === "hidden" ? "tab_hidden" : "tab_visible");
    const onBlur = () => void examEventAction(attemptId, "blur");
    const onOnline = () => void examEventAction(attemptId, "reconnect");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("online", onOnline);
    };
  }, [attemptId]);

  async function choose(qi: number, option: number) {
    const prev = answers[qi];
    setAnswers((a) => a.map((x, i) => (i === qi ? option : x)));
    setSaving(true);
    setError(null);
    const r = await answerExamAction(attemptId, questions[qi]!.itemId, option);
    setSaving(false);
    if (!r.ok) {
      setAnswers((a) => a.map((x, i) => (i === qi ? prev! : x)));
      setError(r.error);
      if (r.error === "exam_time_over" || r.error === "exam_submitted") router.refresh();
    }
  }

  function readAloud() {
    if (!("speechSynthesis" in window)) return;
    const q = questions[index]!;
    const text = [q.stem, ...q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`)].join(". ");
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "tr-TR";
    const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("tr"));
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
    if (!ttsReported.current) {
      ttsReported.current = true;
      void examEventAction(attemptId, "tts");
    }
  }

  const q = questions[index]!;
  const unanswered = answers.filter((a) => a === null).length;
  const secs = Math.max(0, Math.floor(left / 1000));
  const clock = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-background/95 p-3 backdrop-blur">
        <span className="font-semibold">{title}</span>
        <span className={`flex items-center gap-2 font-mono text-xl ${secs < 60 ? "text-destructive" : ""}`} role="timer" aria-label={t("timeLeft", { time: clock })}>
          <Timer aria-hidden="true" className="size-5" />
          {clock}
        </span>
      </div>

      <nav aria-label={t("questionsNav")}>
        <ol className="flex flex-wrap gap-2">
          {questions.map((x, i) => (
            <li key={x.itemId}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-current={i === index ? "step" : undefined}
                aria-label={t("goTo", { n: i + 1, state: answers[i] === null ? t("unanswered") : t("answered") })}
                className={`flex size-12 items-center justify-center rounded-lg border font-medium aria-[current=step]:ring-3 aria-[current=step]:ring-ring/50 ${
                  answers[i] === null ? "" : "border-primary bg-primary text-primary-foreground"
                }`}
              >
                {i + 1}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <fieldset className="flex flex-col gap-3 rounded-2xl border p-4 sm:p-5">
        <legend className="sr-only">{t("questionN", { n: index + 1, total: questions.length })}</legend>
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t("questionN", { n: index + 1, total: questions.length })}</p>
          <Button type="button" variant="outline" size="sm" onClick={readAloud}>
            <Volume2 aria-hidden="true" />
            {t("readAloud")}
          </Button>
        </div>
        <p className="text-lg font-medium">{q.stem}</p>
        {q.mediaAssetId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/media/${q.mediaAssetId}/image`} alt="" className="max-h-80 w-full rounded-xl border object-contain" />
        )}
        {q.options.map((o, i) => (
          <label
            key={i}
            className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 py-2 has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
          >
            <input type="radio" name={`q-${q.itemId}`} className="size-5 accent-primary" checked={answers[index] === i} onChange={() => void choose(index, i)} />
            <span className="font-mono">{String.fromCharCode(65 + i)}</span>
            <span className="flex-1">{o}</span>
          </label>
        ))}
        <p className="text-sm text-muted-foreground" role="status">
          {saving ? t("saving") : answers[index] !== null ? t("saved") : ""}
        </p>
      </fieldset>

      <FormError error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="lg" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          <ChevronLeft aria-hidden="true" />
          {t("prev")}
        </Button>
        {index < questions.length - 1 ? (
          <Button size="lg" onClick={() => setIndex(index + 1)}>
            {t("next")}
            <ChevronRight aria-hidden="true" />
          </Button>
        ) : (
          <Button
            size="lg"
            disabled={submitting}
            onClick={() => {
              if (window.confirm(unanswered ? t("confirmUnanswered", { count: unanswered }) : t("confirm"))) submit();
            }}
          >
            <Send aria-hidden="true" />
            {t("submit")}
          </Button>
        )}
      </div>
    </div>
  );
}
