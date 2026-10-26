import type { ReactNode } from "react";
import type { RichNode } from "@/server/services/content/body";

/**
 * TipTap JSON'unu güvenli biçimde React'e çevirir (HTML enjekte edilmez; yalnızca izinli düğümler).
 * Sunucu ve istemci bileşenlerinde kullanılabilir.
 */
export function RichText({ doc }: { doc: RichNode | undefined }) {
  if (!doc?.content?.length) return null;
  return <div className="rich-text flex flex-col gap-3 text-base leading-relaxed">{doc.content.map(renderNode)}</div>;
}

function renderChildren(node: RichNode): ReactNode[] {
  return (node.content ?? []).map(renderNode);
}

function renderNode(node: RichNode, key: number): ReactNode {
  switch (node.type) {
    case "paragraph":
      return <p key={key}>{renderChildren(node)}</p>;
    case "heading":
      return node.attrs?.level === 3 ? (
        <h4 key={key} className="mt-2 text-lg font-semibold">
          {renderChildren(node)}
        </h4>
      ) : (
        <h3 key={key} className="mt-3 text-xl font-semibold">
          {renderChildren(node)}
        </h3>
      );
    case "bulletList":
      return (
        <ul key={key} className="list-disc ps-6">
          {renderChildren(node)}
        </ul>
      );
    case "orderedList":
      return (
        <ol key={key} className="list-decimal ps-6">
          {renderChildren(node)}
        </ol>
      );
    case "listItem":
      return (
        <li key={key} className="[&>p]:inline">
          {renderChildren(node)}
        </li>
      );
    case "blockquote":
      return (
        <blockquote key={key} className="border-s-4 border-primary/40 bg-muted/50 px-4 py-2">
          {renderChildren(node)}
        </blockquote>
      );
    case "hardBreak":
      return <br key={key} />;
    case "text": {
      let el: ReactNode = node.text ?? "";
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") el = <strong>{el}</strong>;
        if (mark.type === "italic") el = <em>{el}</em>;
      }
      return <span key={key}>{el}</span>;
    }
    default:
      return null;
  }
}
