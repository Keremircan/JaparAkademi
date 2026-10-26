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

/** "yok" | "tr" | "diğer": tarayıcıda konuşma desteği ve Türkçe ses durumu. */
function voiceState(): "none" | "tr" | "other" {
  if (!("speechSynthesis" in window)) return "none";
  return speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith("tr")) ? "tr" : "other";
}

/**
 * Sesli okuma (tarayıcının Web Speech API'si; veri dışarı çıkmaz). Verilen öğenin metnini Türkçe okur.
 * Cihazda Türkçe ses yoksa uyarı gösterir.
 */
export function ReadAloud({ targetId }: { targetId: string }) {
  const t = useTranslations("learn.readAloud");
  const voices = useSyncExternalStore(subscribeVoices, voiceState, () => "none" as const);
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
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "tr-TR";
    const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("tr"));
    if (voice) u.voice = voice;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    speechSynthesis.speak(u);
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
