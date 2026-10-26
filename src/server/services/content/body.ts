import { z } from "zod";

/**
 * İçerik gövdeleri (FG-2.1). Taslak kaydedilirken eksik olabilir ("draft"), onaya gönderilirken
 * tam olmalıdır ("strict"). Medya alanları media_assets kimlikleridir.
 */

export const CONTENT_TYPES = ["text", "pdf", "video", "gallery", "instruction", "checklist", "form_template"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

// ---- Zengin metin (TipTap JSON). Yalnızca izin verilen düğüm ve işaretler kabul edilir. ----

const ALLOWED_NODES = new Set([
  "doc",
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "hardBreak",
  "text",
]);
const ALLOWED_MARKS = new Set(["bold", "italic"]);

export type RichNode = {
  type: string;
  text?: string;
  attrs?: { level?: number };
  marks?: { type: string }[];
  content?: RichNode[];
};

const richNode: z.ZodType<RichNode> = z.lazy(() =>
  z
    .object({
      type: z.string().refine((t) => ALLOWED_NODES.has(t), "node_not_allowed"),
      text: z.string().max(20_000).optional(),
      attrs: z.object({ level: z.number().int().min(2).max(3).optional() }).optional(),
      marks: z.array(z.object({ type: z.string().refine((m) => ALLOWED_MARKS.has(m), "mark_not_allowed") })).optional(),
      content: z.array(richNode).max(2000).optional(),
    })
    .strip(),
);

export const richDoc = z
  .object({ type: z.literal("doc"), content: z.array(richNode).max(2000).default([]) })
  .refine((d) => JSON.stringify(d).length <= 300_000, "too_large");

export function richText(node: RichNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  const inner = (node.content ?? []).map(richText).join(node.type === "doc" ? "\n" : " ");
  return inner;
}

// ---- Tip bazlı gövdeler ----

const assetId = z.uuid();
const shortText = (max: number) => z.string().trim().max(max);

const bodies = {
  text: {
    draft: z.object({ doc: richDoc.optional() }),
    strict: z.object({ doc: richDoc.refine((d) => richText(d as RichNode).trim().length > 0, "empty") }),
  },
  pdf: {
    draft: z.object({ assetId: assetId.optional(), description: shortText(2000).optional() }),
    strict: z.object({ assetId, description: shortText(2000).optional() }),
  },
  video: {
    draft: z.object({ assetId: assetId.optional(), description: shortText(2000).optional() }),
    strict: z.object({ assetId, description: shortText(2000).optional() }),
  },
  gallery: {
    draft: z.object({ items: z.array(z.object({ assetId, caption: shortText(500).optional() })).max(50).default([]) }),
    strict: z.object({ items: z.array(z.object({ assetId, caption: shortText(500).optional() })).min(1).max(50) }),
  },
  instruction: {
    draft: z.object({
      steps: z
        .array(z.object({ title: shortText(200).default(""), text: shortText(5000).optional(), assetId: assetId.optional() }))
        .max(100)
        .default([]),
    }),
    strict: z.object({
      steps: z
        .array(z.object({ title: shortText(200).min(1), text: shortText(5000).optional(), assetId: assetId.optional() }))
        .min(1)
        .max(100),
    }),
  },
  checklist: {
    draft: z.object({
      items: z.array(z.object({ text: shortText(500).default(""), critical: z.boolean().default(false) })).max(200).default([]),
    }),
    strict: z.object({
      items: z.array(z.object({ text: shortText(500).min(1), critical: z.boolean().default(false) })).min(1).max(200),
    }),
  },
  form_template: {
    draft: z.object({ assetId: assetId.optional(), description: shortText(2000).optional() }),
    strict: z.object({ assetId, description: shortText(2000).optional() }),
  },
} satisfies Record<ContentType, { draft: z.ZodType; strict: z.ZodType }>;

export type ContentBody = Record<string, unknown>;

export function parseBody(type: ContentType, body: unknown, mode: "draft" | "strict") {
  return bodies[type][mode].safeParse(body ?? {});
}

/** Gövdenin kullandığı medya kimlikleri. */
export function bodyAssetIds(type: ContentType, body: ContentBody): string[] {
  const b = body as {
    assetId?: string;
    items?: { assetId?: string }[];
    steps?: { assetId?: string }[];
  };
  const ids = [b.assetId, ...(b.items ?? []).map((i) => i.assetId), ...(b.steps ?? []).map((s) => s.assetId)];
  return [...new Set(ids.filter((v): v is string => typeof v === "string"))];
}

/** Tam metin araması için düz metin. */
export function bodyText(type: ContentType, body: ContentBody): string {
  const b = body as {
    doc?: RichNode;
    description?: string;
    items?: { caption?: string; text?: string }[];
    steps?: { title?: string; text?: string }[];
  };
  switch (type) {
    case "text":
      return richText(b.doc);
    case "gallery":
      return (b.items ?? []).map((i) => i.caption ?? "").join(" ");
    case "instruction":
      return (b.steps ?? []).map((s) => `${s.title ?? ""} ${s.text ?? ""}`).join(" ");
    case "checklist":
      return (b.items ?? []).map((i) => i.text ?? "").join(" ");
    default:
      return b.description ?? "";
  }
}

/** Her içerik tipinin kabul ettiği medya türü. */
export const ASSET_KIND_FOR_TYPE: Record<ContentType, ("image" | "pdf" | "video" | "document")[]> = {
  text: [],
  pdf: ["pdf"],
  video: ["video"],
  gallery: ["image"],
  instruction: ["image"],
  checklist: [],
  form_template: ["pdf", "document"],
};
