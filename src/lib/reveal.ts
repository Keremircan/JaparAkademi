/**
 * Hata/uyarı mesajını görünür alana getirme (karar #270).
 * Mesaj zaten tamamen görünüyorsa sayfa kıpırdamaz; değilse telefonda üst çubuğun ve
 * alt menünün arkasında kalmayacak biçimde kaydırılır.
 */

/** Ekranda görünen dikey bölge (piksel): sabit çubukların payı düşülmüş. */
export type VisibleArea = { top: number; bottom: number };

/** Öğe bölgenin içinde tamamen görünüyor mu? */
export function isFullyVisible(rect: { top: number; bottom: number }, area: VisibleArea): boolean {
  return rect.top >= area.top && rect.bottom <= area.bottom;
}

/** Sabit çubuk (sticky) ya da açılır pencere (fixed) içindeki öğe zaten ekrana iğnelidir. */
function isPinned(el: HTMLElement) {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const position = getComputedStyle(node).position;
    if (position === "sticky" || position === "fixed") return true;
  }
  return false;
}

/**
 * Paylar öğenin `scroll-margin` değerlerinden okunur (scrollIntoView de aynı payları kullanır).
 * "Hareketi azalt" açıksa animasyonsuz kayar. Gizli öğeye (boyutu sıfır) ve iğneli öğeye dokunulmaz:
 * arkadaki sayfa boşuna kaydırılmaz.
 */
export function revealElement(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;
  if (isPinned(el)) return;
  const style = getComputedStyle(el);
  const area = {
    top: parseFloat(style.scrollMarginTop) || 0,
    bottom: window.innerHeight - (parseFloat(style.scrollMarginBottom) || 0),
  };
  if (isFullyVisible(rect, area)) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
}
