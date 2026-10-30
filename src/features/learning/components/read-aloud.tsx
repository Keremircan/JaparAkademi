"use client";

import { Square, Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

function subscribeVoices(onChange: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return () => {};
  speechSynthesis.addEventListener("voiceschanged", onChange);
  return () => speechSynthesis.removeEventListener("voiceschanged", onChange);
}

const SPEECH_LANG: Record<string, string> = { tr: "tr-TR", en: "en-GB" };

/** Metnin diline uygun ses (yoksa tarayıcının varsayılanı). */
export function speechVoice(lang: string): SpeechSynthesisVoice | undefined {
  return speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));
}

/** Okunacak metni metnin dilinde seslendirir (karar #207). */
export function speak(text: string, lang: string, handlers?: { onEnd?: () => void }): void {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = SPEECH_LANG[lang] ?? lang;
  const voice = speechVoice(lang);
  if (voice) u.voice = voice;
  u.onend = () => handlers?.onEnd?.();
  u.onerror = () => handlers?.onEnd?.();
  speechSynthesis.speak(u);
}

/**
 * Sesli okuma (tarayıcının Web Speech API'si; veri dışarı çıkmaz). Verilen öğenin metnini içeriğin dilinde okur.
 * Cihazda o dilde ses yoksa uyarı gösterir.
 */
export function ReadAloud({ targetId, lang = "tr" }: { targetId: string; lang?: string }) {
  const t = useTranslations("learn.readAloud");
  const voices = useSyncExternalStore(
    subscribeVoices,
    () => (!("speechSynthesis" in window) ? "none" : speechVoice(lang) ? "match" : "other"),
    () => "none" as const,
  );
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  }, []);

  if (voices === "none") return null;

  function toggle() {
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const text = document.getElementById(targetId)?.innerText ?? "";
    if (!text.trim()) return;
    speak(text, lang, { onEnd: () => setSpeaking(false) });
    setSpeaking(true);
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" onClick={toggle} aria-pressed={speaking} className="self-start">
        {speaking ? <Square aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
        {speaking ? t("stop") : t("start")}
      </Button>
      {voices === "other" && <p className="text-sm text-muted-foreground">{t("noVoice")}</p>}
    </div>
  );
}
