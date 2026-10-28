"use client";

import { ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LegalTextBody } from "@/features/legal/components/legal-text-body";
import { SignaturePad } from "@/features/practice/components/signature-pad";
import { useRouter } from "@/i18n/navigation";
import { completeBriefingAction, drawQuizAction, startBriefingAction, submitQuizAction } from "../actions";

type Card = { id: string; title: string; body: string; media: { id: string; kind: "image" | "video" } | null };
type Legal = { id: string; title: string; body: string };
type Quiz = { attemptId: string | null; questions: { stem: string; options: string[] }[] };

/**
 * Ziyaretçi bilgilendirme akışı (SPEC 8.2/3–5, iş paketi 2.3a): giriş → kartlar (en az süre, video sonuna kadar)
 * → kontrol soruları → kurallar + KVKK onayı + imza → bitti. Sunucu süreyi ve sırayı ayrıca doğrular.
 */
export function VisitorFlow({
  token,
  locale,
  code,
  firstName,
  cards,
  cardMinSeconds,
  questionCount,
  quizPassed,
  rules,
  kvkk,
  kiosk,
  resetSeconds,
}: {
  token: string;
  locale: "tr" | "en";
  code: string;
  firstName: string;
  cards: Card[];
  cardMinSeconds: number;
  questionCount: number;
  quizPassed: boolean;
  rules: Legal;
  kvkk: Legal;
  kiosk: boolean;
  resetSeconds: number;
}) {
  const t = useTranslations("visitorFlow");
  const [step, setStep] = useState<"intro" | "cards" | "quiz" | "consent" | "done">("intro");
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const needsQuiz = questionCount > 0 && !quizPassed;

  const call = (fn: () => Promise<void>) =>
    startTransition(async () => {
      setError(null);
      await fn();
    });

  if (step === "intro")
    return (
      <div className="flex flex-col gap-6">
        <p className="text-xl font-medium">{t("greeting", { name: firstName })}</p>
        <p className="text-lg">{t("intro.text")}</p>
        <FormError error={error} />
        <Button
          size="lg"
          className="self-start"
          disabled={pending}
          onClick={() =>
            call(async () => {
              const r = await startBriefingAction(token, locale);
              if (!r.ok) return setError(r.error);
              setIndex(0);
              setStep("cards");
            })
          }
        >
          {t("intro.start")}
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    );

  if (step === "cards") {
    const card = cards[index]!;
    const last = index === cards.length - 1;
    return (
      <CardStep
        key={card.id}
        token={token}
        card={card}
        progress={t("cards.progress", { n: index + 1, total: cards.length })}
        minSeconds={cardMinSeconds}
        nextLabel={last ? (needsQuiz ? t("cards.toQuiz") : t("cards.toConsent")) : t("cards.next")}
        onNext={() => (last ? setStep(needsQuiz ? "quiz" : "consent") : setIndex((i) => i + 1))}
      />
    );
  }

  if (step === "quiz") return <QuizStep token={token} locale={locale} onPassed={() => setStep("consent")} />;

  if (step === "consent")
    return <ConsentStep token={token} locale={locale} rules={rules} kvkk={kvkk} onDone={() => setStep("done")} />;

  return <DoneStep code={code} kiosk={kiosk} resetSeconds={resetSeconds} />;
}

function CardStep({
  token,
  card,
  progress,
  minSeconds,
  nextLabel,
  onNext,
}: {
  token: string;
  card: Card;
  progress: string;
  minSeconds: number;
  nextLabel: string;
  onNext: () => void;
}) {
  const t = useTranslations("visitorFlow");
  const [left, setLeft] = useState(minSeconds);
  const [videoDone, setVideoDone] = useState(card.media?.kind !== "video");
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  const ready = left <= 0 && videoDone;
  return (
    <article className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{progress}</p>
      <h2 className="text-2xl font-semibold">{card.title}</h2>
      {card.media?.kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/visit-media/${token}/${card.media.id}/image`} alt="" className="max-h-96 w-full rounded-xl object-contain" />
      )}
      {card.media?.kind === "video" && (
        <video
          src={`/api/visit-media/${token}/${card.media.id}/file`}
          poster={`/api/visit-media/${token}/${card.media.id}/poster`}
          controls
          playsInline
          controlsList="nodownload noplaybackrate"
          className="w-full rounded-xl bg-black"
          onEnded={() => setVideoDone(true)}
        />
      )}
      <p className="whitespace-pre-line text-lg">{card.body}</p>
      {!videoDone && <p className="text-muted-foreground">{t("cards.watchVideo")}</p>}
      <Button size="lg" className="self-start" disabled={!ready} onClick={onNext}>
        {ready ? nextLabel : t("cards.wait", { seconds: Math.max(left, 0) })}
        {ready && <ArrowRight aria-hidden="true" />}
      </Button>
    </article>
  );
}

function QuizStep({ token, locale, onPassed }: { token: string; locale: "tr" | "en"; onPassed: () => void }) {
  const t = useTranslations("visitorFlow.quiz");
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [failedScore, setFailedScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = () =>
    startTransition(async () => {
      setError(null);
      setFailedScore(null);
      const r = await drawQuizAction(token, locale);
      if (!r.ok) return setError(r.error);
      if (!r.data.attemptId) return onPassed();
      setQuiz(r.data);
      setAnswers(r.data.questions.map(() => null));
    });
  // İlk açılışta sorular çekilir
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!quiz) return <FormError error={error} />;
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-semibold">{t("title")}</h2>
      <p>{t("intro")}</p>
      {quiz.questions.map((q, i) => (
        <fieldset key={i} className="flex flex-col gap-2 rounded-2xl border p-4">
          <legend className="px-1 text-sm text-muted-foreground">{t("question", { n: i + 1 })}</legend>
          <p className="text-lg font-medium">{q.stem}</p>
          {q.options.map((o, k) => (
            <label key={k} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-muted">
              <input
                type="radio"
                name={`q${i}`}
                className="size-6"
                checked={answers[i] === k}
                onChange={() => setAnswers((a) => a.map((x, j) => (j === i ? k : x)))}
              />
              <span className="text-lg">{o}</span>
            </label>
          ))}
        </fieldset>
      ))}
      <FormError error={error} />
      {failedScore !== null ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className="text-lg text-destructive">
            {t("failed", { score: failedScore })}
          </p>
          <Button size="lg" variant="outline" className="self-start" disabled={pending} onClick={load}>
            <RotateCcw aria-hidden="true" />
            {t("retry")}
          </Button>
        </div>
      ) : (
        <Button
          size="lg"
          className="self-start"
          disabled={pending || answers.some((a) => a === null)}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await submitQuizAction(token, quiz.attemptId!, answers as number[]);
              if (!r.ok) return setError(r.error);
              if (r.data.passed) onPassed();
              else setFailedScore(r.data.score);
            })
          }
        >
          {t("submit")}
        </Button>
      )}
    </div>
  );
}

function ConsentStep({ token, locale, rules, kvkk, onDone }: { token: string; locale: "tr" | "en"; rules: Legal; kvkk: Legal; onDone: () => void }) {
  const t = useTranslations("visitorFlow.consent");
  const [acceptRules, setAcceptRules] = useState(false);
  const [acceptKvkk, setAcceptKvkk] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const box = (id: string, checked: boolean, set: (v: boolean) => void, label: string, text: Legal) => (
    <div className="flex flex-col gap-2 rounded-2xl border p-4">
      <details>
        <summary className="min-h-12 cursor-pointer content-center font-medium">{text.title}</summary>
        <div className="max-h-80 overflow-y-auto pt-2">
          <LegalTextBody body={text.body} />
        </div>
      </details>
      <label htmlFor={id} className="flex min-h-12 cursor-pointer items-center gap-3">
        <Checkbox id={id} className="size-6" checked={checked} onCheckedChange={(v) => set(v === true)} />
        <span className="text-lg">{label}</span>
      </label>
    </div>
  );
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-2xl font-semibold">{t("title")}</h2>
      {box("accept-rules", acceptRules, setAcceptRules, t("acceptRules"), rules)}
      {box("accept-kvkk", acceptKvkk, setAcceptKvkk, t("acceptKvkk"), kvkk)}
      <SignaturePad label={t("signature")} onChange={setSignature} />
      <FormError error={error} />
      <Button
        size="lg"
        className="self-start"
        disabled={pending || !acceptRules || !acceptKvkk || !signature}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await completeBriefingAction(token, { locale, rulesId: rules.id, kvkkId: kvkk.id, signature: signature! });
            if (!r.ok) return setError(r.error);
            onDone();
          })
        }
      >
        <CheckCircle2 aria-hidden="true" />
        {t("submit")}
      </Button>
    </div>
  );
}

/** Bitti: ziyaret kodu. Kioskta süre sonunda başa döner; tablette hiçbir şey kalmaz (karar #146). */
export function DoneStep({ code, kiosk, resetSeconds }: { code: string; kiosk: boolean; resetSeconds: number }) {
  const t = useTranslations("visitorFlow");
  const router = useRouter();
  const [left, setLeft] = useState(resetSeconds);
  useEffect(() => {
    if (!kiosk) return;
    if (left <= 0) {
      router.replace("/kiosk");
      return;
    }
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [kiosk, left, router]);
  return (
    <div className="flex flex-col items-start gap-5" role="status">
      <p className="flex items-center gap-3 text-2xl font-semibold text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 aria-hidden="true" className="size-8" />
        {t("done.title")}
      </p>
      <p className="text-lg">{t("done.text")}</p>
      <p className="text-lg">
        {t("codeLabel")}: <span className="font-mono text-3xl font-bold tracking-widest">{code}</span>
      </p>
      {kiosk && (
        <>
          <p className="text-muted-foreground">{t("done.kioskReset", { seconds: Math.max(left, 0) })}</p>
          <Button size="lg" onClick={() => router.replace("/kiosk")}>
            {t("done.newVisitor")}
          </Button>
        </>
      )}
    </div>
  );
}
