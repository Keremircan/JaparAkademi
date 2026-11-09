import type { RichNode } from "@/server/services/content/body";

/** Örnek içerik metinleri için kısa TipTap yardımcıları (yalnızca izinli düğümler ve işaretler). */

export type Inline = string | { b: string } | { i: string };

function text(x: Inline): RichNode {
  if (typeof x === "string") return { type: "text", text: x };
  if ("b" in x) return { type: "text", text: x.b, marks: [{ type: "bold" }] };
  return { type: "text", text: x.i, marks: [{ type: "italic" }] };
}

export const p = (...parts: Inline[]): RichNode => ({ type: "paragraph", content: parts.map(text) });
export const h2 = (t: string): RichNode => ({ type: "heading", attrs: { level: 2 }, content: [text(t)] });
export const h3 = (t: string): RichNode => ({ type: "heading", attrs: { level: 3 }, content: [text(t)] });

type Item = Inline | Inline[];
const item = (it: Item): RichNode => ({ type: "listItem", content: [p(...(Array.isArray(it) ? it : [it]))] });

export const ul = (...items: Item[]): RichNode => ({ type: "bulletList", content: items.map(item) });
export const ol = (...items: Item[]): RichNode => ({ type: "orderedList", content: items.map(item) });
export const quote = (...parts: Inline[]): RichNode => ({ type: "blockquote", content: [p(...parts)] });

/** Metin içeriğinin gövdesi. */
export const doc = (...nodes: RichNode[]) => ({ doc: { type: "doc", content: nodes } });
