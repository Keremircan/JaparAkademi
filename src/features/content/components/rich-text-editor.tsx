"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Heading3, Italic, List, ListOrdered, Quote, Redo2, Undo2, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { RichNode } from "@/server/services/content/body";

/**
 * Zengin metin düzenleyici (TipTap). Yalnızca kalın, italik, H2/H3, listeler ve alıntı;
 * sunucu aynı izin listesini Zod ile ayrıca doğrular.
 */
export function RichTextEditor({
  id,
  value,
  onChange,
  labelledBy,
}: {
  id: string;
  value: RichNode | undefined;
  onChange: (doc: RichNode) => void;
  labelledBy?: string;
}) {
  const t = useTranslations("content.editor.toolbar");
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        strike: false,
        horizontalRule: false,
        link: false,
        underline: false,
      }),
    ],
    content: value?.content?.length ? value : undefined,
    editorProps: {
      attributes: {
        id,
        class: "rich-text min-h-60 px-4 py-3 text-base leading-relaxed outline-none flex flex-col gap-3",
        role: "textbox",
        "aria-multiline": "true",
        ...(labelledBy ? { "aria-labelledby": labelledBy } : {}),
      },
    },
    // getJSON() bazı nesneleri prototipsiz üretir; Server Action serileştirmesi bunları düz nesne
    // olarak göndermez. JSON üzerinden düz nesneye çevrilir.
    onUpdate: ({ editor }) => onChange(JSON.parse(JSON.stringify(editor.getJSON())) as RichNode),
  });

  const state = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? {
            bold: editor.isActive("bold"),
            italic: editor.isActive("italic"),
            h2: editor.isActive("heading", { level: 2 }),
            h3: editor.isActive("heading", { level: 3 }),
            bullet: editor.isActive("bulletList"),
            ordered: editor.isActive("orderedList"),
            quote: editor.isActive("blockquote"),
          }
        : null,
  });

  type ToolKey = "bold" | "italic" | "h2" | "h3" | "bulletList" | "orderedList" | "quote" | "undo" | "redo";
  const buttons: { key: ToolKey; icon: LucideIcon; active?: boolean; run: () => void }[] = editor
    ? [
        { key: "bold", icon: Bold, active: state?.bold, run: () => editor.chain().focus().toggleBold().run() },
        { key: "italic", icon: Italic, active: state?.italic, run: () => editor.chain().focus().toggleItalic().run() },
        { key: "h2", icon: Heading2, active: state?.h2, run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
        { key: "h3", icon: Heading3, active: state?.h3, run: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
        { key: "bulletList", icon: List, active: state?.bullet, run: () => editor.chain().focus().toggleBulletList().run() },
        { key: "orderedList", icon: ListOrdered, active: state?.ordered, run: () => editor.chain().focus().toggleOrderedList().run() },
        { key: "quote", icon: Quote, active: state?.quote, run: () => editor.chain().focus().toggleBlockquote().run() },
        { key: "undo", icon: Undo2, run: () => editor.chain().focus().undo().run() },
        { key: "redo", icon: Redo2, run: () => editor.chain().focus().redo().run() },
      ]
    : [];

  return (
    <div className="rounded-xl border focus-within:ring-3 focus-within:ring-ring/50">
      <div role="toolbar" aria-label={t("label")} aria-controls={id} className="flex flex-wrap gap-1 border-b p-1">
        {buttons.map(({ key, icon: Icon, active, run }) => (
          <button
            key={key}
            type="button"
            onClick={run}
            aria-pressed={active === undefined ? undefined : active}
            title={t(key)}
            className="flex size-12 items-center justify-center rounded-lg hover:bg-muted aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          >
            <Icon aria-hidden="true" className="size-5" />
            <span className="sr-only">{t(key)}</span>
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
