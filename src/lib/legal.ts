/**
 * Hukuki metinlerde doldurulacak alanlar (iş paketi 3.8, karar #246): örnek metinlerde kurum bilgileri
 * `[[Adres]]` gibi yazılır. Metinde böyle bir alan kaldıkça yayınlanamaz. Sunucu ve form ortak kullanır.
 */
const PLACEHOLDER = /\[\[([^[\]\n]{1,80})\]\]/g;

/** Metinlerdeki doldurulmamış alanların adları (ilk görünme sırasıyla, tekrarsız). */
export function placeholdersIn(...texts: string[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(PLACEHOLDER)) found.add(match[1]!.trim() || match[0]);
  }
  return [...found];
}

/** Metni düz parçalar ve `[[...]]` alanları olarak böler (görünümde alanlar işaretlenir — karar #275). */
export function splitPlaceholders(text: string): { text: string; placeholder: boolean }[] {
  const parts: { text: string; placeholder: boolean }[] = [];
  let last = 0;
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index), placeholder: false });
    parts.push({ text: match[0], placeholder: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), placeholder: false });
  return parts;
}

/** Alan adını metinde yazıldığı biçimde gösterir. */
export function placeholderLabel(name: string): string {
  return name.startsWith("[[") ? name : `[[${name}]]`;
}
