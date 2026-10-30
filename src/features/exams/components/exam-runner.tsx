"use client";

import { ChevronLeft, ChevronRight, Send, Timer, Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { HotspotAnswer } from "@/features/questions/components/hotspot-image";
import type { HotspotPoint } from "@/lib/questions";
import type { AttemptQuestion } from "@/server/services/exams";
import { answerExamAction, examEventAction, submitExamAction } from "../actions";

/** Ekrandaki cevap: çoktan seçmelide gösterilen şık, eşleştirmede her sol için gösterilen sağ, işaretlemede nokta. */
type Answer = number | (number | null)[] | HotspotPoint | null;

function initialAnswer(q: AttemptQuestion): Answer {
  return q.answer;
}

/** Soru cevaplandı mı: eşleştirmede bütün sol öğeler eşlenmiş olmalı. */
function isAnswered(q: AttemptQuestion, a: Answer): boolean {
  if (q.type === "matching") return Array.isArray(a) && a.every((x) => x !== null);
  return a !== null;
}

function toPayload(q: AttemptQuestion, a: Answer) {
  if (q.type === "matching") return { kind: "matching" as const, pairs: a as (number | null)[] };
  if (q.type === "hotspot") return { kind: "hotspot" as const, point: a as HotspotPoint | null };
  return { kind: "choice" as const, shownIndex: a as number | null };
}

/**
 * Teorik sınav ekranı (Ekran 4). Süre sunucu saatine göre gösterilir; her seçim anında kaydedilir;
 * süre dolunca otomatik teslim edilir. Sekmeden çıkış kaydedilir (sınavı bitirmez). Sesli okuma kullanılırsa işaretlenir.
 * Soru tipleri: çoktan seçmeli / doğru-yanlış, eşleştirme (açılır liste), görselde işaretleme (karar #203, #204).
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
  const [answers, setAnswers] = useState<Answer[]>(() => questions.map(initialAnswer));
  const [index, setIndex] = useState(() => Math.max(0, questions.findIndex((q, i) => !isAnswered(q, questions.map(initialAnswer)[i]!))));
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

  async function save(qi: number, value: Answer) {
    const prev = answers[qi]!;
    setAnswers((a) => a.map((x, i) => (i === qi ? value : x)));
    setSaving(true);
    setError(null);
    const q = questions[qi]!;
    const r = await answerExamAction(attemptId, q.itemId, toPayload(q, value));
    setSaving(false);
    if (!r.ok) {
      setAnswers((a) => a.map((x, i) => (i === qi ? prev : x)));
      setError(r.error);
      if (r.error === "exam_time_over" || r.error === "exam_submitted") router.refresh();
    }
  }

  /** Eşleştirme: bir sağ öğe tek sol öğeye verilir; başka solda seçiliyse oradan kaldırılır. */
  function matchPair(qi: number, leftIndex: number, rightShown: number | null) {
    const current = (answers[qi] as (number | null)[]).map((x) => (rightShown !== null && x === rightShown ? null : x));
    current[leftIndex] = rightShown;
    void save(qi, current);
  }

  function readAloud() {
    if (!("speechSynthesis" in window)) return;
    const q = questions[index]!;
    const parts =
      q.type === "choice"
        ? [q.stem, ...q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`)]
        : q.type === "matching"
          ? [q.stem, ...q.left.map((l, i) => `${i + 1}. ${l}`), t("matchingChoices"), ...q.right.map((r, i) => `${String.fromCharCode(65 + i)}. ${r}`)]
          : [q.stem];
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(parts.join(". "));
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
  const answer = answers[index]!;
  const answeredFlags = questions.map((x, i) => isAnswered(x, answers[i]!));
  const unanswered = answeredFlags.filter((a) => !a).length;
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
                aria-label={t("goTo", { n: i + 1, state: answeredFlags[i] ? t("answered") : t("unanswered") })}
                className={`flex size-12 items-center justify-center rounded-lg border font-medium aria-[current=step]:ring-3 aria-[current=step]:ring-ring/50 ${
                  answeredFlags[i] ? "border-primary bg-primary text-primary-foreground" : ""
                }`}
              >
                {i + 1}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <fieldset key={q.itemId} className="flex flex-col gap-3 rounded-2xl border p-4 sm:p-5">
        <legend className="sr-only">{t("questionN", { n: index + 1, total: questions.length })}</legend>
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t("questionN", { n: index + 1, total: questions.length })}</p>
          <Button type="button" variant="outline" size="sm" onClick={readAloud}>
            <Volume2 aria-hidden="true" />
            {t("readAloud")}
          </Button>
        </div>
        <p className="text-lg font-medium">{q.stem}</p>

        {q.type === "hotspot" ? (
          <>
            <p className="text-sm text-muted-foreground">{t("hotspotHint")}</p>
            <HotspotAnswer
              src={`/api/media/${q.mediaAssetId}/image`}
              value={answer as HotspotPoint | null}
              label={t("hotspotLabel")}
              onChange={(p) => void save(index, p)}
            />
          </>
        ) : (
          q.mediaAssetId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/media/${q.mediaAssetId}/image`} alt="" className="max-h-80 w-full rounded-xl border object-contain" />
          )
        )}

        {q.type === "choice" &&
          q.options.map((o, i) => (
            <label
              key={i}
              className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 py-2 has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <input type="radio" name={`q-${q.itemId}`} className="size-5 accent-primary" checked={answer === i} onChange={() => void save(index, i)} />
              <span className="font-mono">{String.fromCharCode(65 + i)}</span>
              <span className="flex-1">{o}</span>
            </label>
          ))}

        {q.type === "matching" && (
          <>
            <p className="text-sm text-muted-foreground">{t("matchingHint")}</p>
            <ol className="flex flex-col gap-3">
              {q.left.map((l, li) => {
                const id = `m-${q.itemId}-${li}`;
                const value = (answer as (number | null)[])[li];
                return (
                  <li key={li} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center">
                    <label htmlFor={id} className="flex-1 font-medium">
                      {li + 1}. {l}
                    </label>
                    <NativeSelect
                      id={id}
                      className="min-h-12 sm:w-64"
                      value={value === null || value === undefined ? "" : String(value)}
                      onChange={(e) => matchPair(index, li, e.target.value === "" ? null : Number(e.target.value))}
                    >
                      <option value="">{t("matchingChoose")}</option>
                      {q.right.map((r, ri) => (
                        <option key={ri} value={ri}>
                          {String.fromCharCode(65 + ri)}. {r}
                        </option>
                      ))}
                    </NativeSelect>
                  </li>
                );
              })}
            </ol>
          </>
        )}

        <p className="text-sm text-muted-foreground" role="status">
          {saving ? t("saving") : answeredFlags[index] ? t("saved") : ""}
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
