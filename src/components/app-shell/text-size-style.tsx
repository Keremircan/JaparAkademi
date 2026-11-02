"use client";

import { useLayoutEffect, useRef } from "react";
import type { TextSize } from "@/lib/text-size";

/**
 * "Büyük yazı" tercihi (iş paketi 3.6, karar #244): kök yazı boyutunu bir kademe büyütür (dokunmatikte
 * 16 → 18px, fareyle 14 → 16px); rem ile tanımlı bütün ölçüler birlikte büyür. Katmansız `<style>` belgede
 * globals.css'ten sonra geldiği için yoğunluk kuralını ezer. Tercih hesaptadır; girişten önceki ekranlar normaldir.
 */
const LARGE_TEXT_CSS = "html{font-size:112.5%}@media (pointer: fine){html{font-size:100%}}";

export function TextSizeStyle({ size }: { size: TextSize }) {
  const ref = useRef<HTMLStyleElement>(null);

  // Next önceki sayfaları gizli <Activity> içinde tutar; gizli ağaçtaki <style> yine de uygulanır
  // (ör. çıkıştan sonra giriş ekranı büyük kalırdı). Gizlenince efekt temizlenir ve stil kapanır,
  // sayfa yeniden görününce açılır. İlk yüklemede stil sunucudan açık gelir; kayma olmaz.
  useLayoutEffect(() => {
    const style = ref.current;
    if (!style) return;
    style.disabled = false;
    return () => {
      style.disabled = true;
    };
  }, [size]);

  return size === "large" ? <style ref={ref}>{LARGE_TEXT_CSS}</style> : null;
}
