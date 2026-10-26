import "server-only";
import { getTranslations } from "next-intl/server";
import type { DiffSection } from "@/features/positions/components/diff-view";
import type { VersionView } from "@/server/services/content";
import { bodyAssetIds, richText, type RichNode } from "@/server/services/content/body";
import { assetsInfo } from "@/server/services/media";

/** Zengin metni blok satırlarına böler (paragraf, başlık, liste maddesi). */
function richLines(node: RichNode | undefined): string[] {
  if (!node) return [];
  if (node.type === "doc" || node.type === "bulletList" || node.type === "orderedList" || node.type === "blockquote") {
    return (node.content ?? []).flatMap(richLines);
  }
  const text = richText(node).trim();
  return text ? [node.type === "listItem" ? `• ${text}` : text] : [];
}

type Body = {
  doc?: RichNode;
  assetId?: string;
  description?: string;
  items?: { assetId?: string; caption?: string; text?: string; critical?: boolean }[];
  steps?: { title?: string; text?: string; assetId?: string }[];
};

/** İçerik sürümlerini karşılaştırma bölümlerine çevirir (başlık + gövde + dosyalar). */
export async function contentDiffSections(a: VersionView, b: VersionView): Promise<DiffSection[]> {
  const t = await getTranslations("compare.content");
  const tv = await getTranslations("content.viewer");
  const assets = await assetsInfo([...new Set([...bodyAssetIds(a.type, a.body), ...bodyAssetIds(b.type, b.body)])]);
  const file = (id: string | undefined) => (id ? (assets.get(id)?.originalName ?? id.slice(-8)) : "");

  const lines = (v: VersionView): { body: string[]; files: string[] } => {
    const x = v.body as Body;
    switch (v.type) {
      case "text":
        return { body: richLines(x.doc), files: [] };
      case "checklist":
        return { body: (x.items ?? []).map((i) => `${i.text ?? ""}${i.critical ? ` (${tv("critical")})` : ""}`), files: [] };
      case "instruction":
        return {
          body: (x.steps ?? []).map((s, i) => `${i + 1}. ${s.title ?? ""}${s.text ? ` — ${s.text}` : ""}`),
          files: (x.steps ?? []).filter((s) => s.assetId).map((s) => file(s.assetId)),
        };
      case "gallery":
        return { body: (x.items ?? []).map((i) => i.caption ?? "").filter(Boolean), files: (x.items ?? []).map((i) => file(i.assetId)) };
      default:
        return { body: x.description ? [x.description] : [], files: x.assetId ? [file(x.assetId)] : [] };
    }
  };
  const la = lines(a);
  const lb = lines(b);
  return [
    { key: "title", title: t("title"), before: [a.title], after: [b.title], text: true },
    { key: "body", title: t("body"), before: la.body, after: lb.body },
    ...(la.files.length || lb.files.length ? [{ key: "files", title: t("files"), before: la.files, after: lb.files }] : []),
  ];
}
