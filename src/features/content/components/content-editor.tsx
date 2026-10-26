"use client";

import { ArrowDown, ArrowUp, Plus, Save, Send, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TagGroup } from "@/server/services/content";
import type { ContentType, RichNode } from "@/server/services/content/body";
import type { AssetInfo, MediaKind } from "@/server/services/media";
import { saveDraftAction, submitContentAction } from "../actions";
import { MediaField } from "./media-upload";
import { RichTextEditor } from "./rich-text-editor";
import { TagPicker } from "./tag-picker";

type Item = { key: string; assetId?: string; caption?: string; text?: string; critical?: boolean; title?: string };
type EditorBody = { doc?: RichNode; assetId?: string; description?: string; items: Item[]; steps: Item[] };

let keySeq = 0;
const newKey = () => `k${++keySeq}`;

function toEditorBody(body: Record<string, unknown>): EditorBody {
  const b = body as { doc?: RichNode; assetId?: string; description?: string; items?: Item[]; steps?: Item[] };
  return {
    doc: b.doc,
    assetId: b.assetId,
    description: b.description,
    items: (b.items ?? []).map((i) => ({ ...i, key: newKey() })),
    steps: (b.steps ?? []).map((s) => ({ ...s, key: newKey() })),
  };
}

const strip = (o: Item) => Object.fromEntries(Object.entries(o).filter(([k, v]) => k !== "key" && v !== undefined && v !== ""));

function toPayload(type: ContentType, b: EditorBody): Record<string, unknown> {
  switch (type) {
    case "text":
      return b.doc ? { doc: b.doc } : {};
    case "pdf":
    case "video":
    case "form_template":
      return { ...(b.assetId ? { assetId: b.assetId } : {}), ...(b.description ? { description: b.description } : {}) };
    case "gallery":
      return { items: b.items.filter((i) => i.assetId).map((i) => strip({ key: "", assetId: i.assetId, caption: i.caption })) };
    case "instruction":
      return { steps: b.steps.map((s) => strip({ key: "", title: s.title ?? "", text: s.text, assetId: s.assetId })) };
    case "checklist":
      return { items: b.items.map((i) => ({ text: i.text ?? "", critical: !!i.critical })) };
  }
}

const FILE_KINDS: Partial<Record<ContentType, MediaKind[]>> = {
  pdf: ["pdf"],
  video: ["video"],
  form_template: ["pdf", "document"],
};

export function ContentEditor({
  contentId,
  type,
  version,
  isOhs,
  initial,
  assets: initialAssets,
  tagGroups,
  submitHint,
}: {
  contentId: string;
  type: ContentType;
  version: number;
  isOhs: boolean;
  initial: { title: string; body: Record<string, unknown>; tagIds: string[] };
  assets: AssetInfo[];
  tagGroups: TagGroup[];
  submitHint: string;
}) {
  const t = useTranslations("content.editor");
  const tc = useTranslations("common");
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(() => toEditorBody(initial.body));
  const [tagIds, setTagIds] = useState(initial.tagIds);
  const [assets, setAssets] = useState(() => new Map(initialAssets.map((a) => [a.id, a])));
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<{ code: string; details?: unknown } | null>(null);
  const [changeNote, setChangeNote] = useState("");
  const [requireReread, setRequireReread] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const touch = () => {
    setDirty(true);
    setSaved(false);
  };
  const update = (patch: Partial<EditorBody>) => {
    setBody((b) => ({ ...b, ...patch }));
    touch();
  };
  const assetOf = (id: string | undefined) => (id ? (assets.get(id) ?? null) : null);
  const setAsset = (a: AssetInfo | null) => {
    if (a) setAssets((m) => new Map(m).set(a.id, a));
  };

  async function save(): Promise<boolean> {
    setError(null);
    const r = await saveDraftAction(contentId, { title, body: toPayload(type, body), tagIds });
    if (!r.ok) {
      setError({ code: r.error, details: r.details });
      return false;
    }
    setDirty(false);
    setSaved(true);
    return true;
  }

  function onSave() {
    startTransition(async () => {
      await save();
    });
  }

  function onSubmit() {
    startTransition(async () => {
      if (!(await save())) return;
      const r = await submitContentAction(contentId, { changeNote: changeNote.trim() || null, requireReread });
      if (r && !r.ok) setError({ code: r.error, details: r.details });
    });
  }

  const listEditor = (key: "items" | "steps", render: (item: Item, i: number, change: (p: Partial<Item>) => void) => React.ReactNode, addLabel: string, blank: () => Item) => {
    const list = body[key];
    const set = (next: Item[]) => update({ [key]: next } as Partial<EditorBody>);
    return (
      <div className="flex flex-col gap-3">
        <ol className="flex flex-col gap-3">
          {list.map((item, i) => (
            <li key={item.key} className="flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex items-center gap-2">
                <span className="flex-1 font-medium">{t(`${key}.n`, { n: i + 1 })}</span>
                <Button type="button" variant="ghost" size="icon" disabled={i === 0} onClick={() => set(move(list, i, -1))} aria-label={t("moveUp")}>
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="icon" disabled={i === list.length - 1} onClick={() => set(move(list, i, 1))} aria-label={t("moveDown")}>
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => set(list.filter((_, j) => j !== i))} aria-label={t("remove")}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
              {render(item, i, (p) => set(list.map((x, j) => (j === i ? { ...x, ...p } : x))))}
            </li>
          ))}
        </ol>
        <Button type="button" variant="outline" className="self-start" onClick={() => set([...list, blank()])}>
          <Plus aria-hidden="true" />
          {addLabel}
        </Button>
      </div>
    );
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Field id="title" label={t("title")}>
        <Input id="title" value={title} maxLength={200} onChange={(e) => (setTitle(e.target.value), touch())} />
      </Field>

      <section className="flex flex-col gap-3" aria-labelledby="body-label">
        <h2 id="body-label" className="text-lg font-semibold">
          {t(`bodyLabel.${type}`)}
        </h2>
        {type === "text" && <RichTextEditor id="body" labelledBy="body-label" value={body.doc} onChange={(doc) => update({ doc })} />}

        {FILE_KINDS[type] && (
          <>
            <MediaField
              label={t(`fileLabel.${type as "pdf" | "video" | "form_template"}`)}
              kinds={FILE_KINDS[type]!}
              asset={assetOf(body.assetId)}
              onChange={(a) => (setAsset(a), update({ assetId: a?.id }))}
            />
            <Field id="description" label={t("description")} optional={tc("optional")}>
              <Textarea id="description" rows={4} maxLength={2000} value={body.description ?? ""} onChange={(e) => update({ description: e.target.value })} />
            </Field>
          </>
        )}

        {type === "gallery" &&
          listEditor(
            "items",
            (item, i, change) => (
              <>
                <MediaField label={t("image")} kinds={["image"]} asset={assetOf(item.assetId)} onChange={(a) => (setAsset(a), change({ assetId: a?.id }))} />
                <Field id={`caption-${item.key}`} label={t("caption")} optional={tc("optional")}>
                  <Input id={`caption-${item.key}`} maxLength={500} value={item.caption ?? ""} onChange={(e) => change({ caption: e.target.value })} aria-label={t("captionN", { n: i + 1 })} />
                </Field>
              </>
            ),
            t("addImage"),
            () => ({ key: newKey() }),
          )}

        {type === "instruction" &&
          listEditor(
            "steps",
            (item, _i, change) => (
              <>
                <Field id={`step-title-${item.key}`} label={t("stepTitle")}>
                  <Input id={`step-title-${item.key}`} maxLength={200} value={item.title ?? ""} onChange={(e) => change({ title: e.target.value })} />
                </Field>
                <Field id={`step-text-${item.key}`} label={t("stepText")} optional={tc("optional")}>
                  <Textarea id={`step-text-${item.key}`} rows={3} maxLength={5000} value={item.text ?? ""} onChange={(e) => change({ text: e.target.value })} />
                </Field>
                <MediaField label={t("image")} optional kinds={["image"]} asset={assetOf(item.assetId)} onChange={(a) => (setAsset(a), change({ assetId: a?.id }))} />
              </>
            ),
            t("addStep"),
            () => ({ key: newKey(), title: "" }),
          )}

        {type === "checklist" &&
          listEditor(
            "items",
            (item, _i, change) => (
              <>
                <Field id={`item-${item.key}`} label={t("checkItem")}>
                  <Input id={`item-${item.key}`} maxLength={500} value={item.text ?? ""} onChange={(e) => change({ text: e.target.value })} />
                </Field>
                <label className="flex min-h-12 items-center gap-3">
                  <Checkbox checked={!!item.critical} onCheckedChange={(v) => change({ critical: v === true })} />
                  <span>{t("critical")}</span>
                </label>
              </>
            ),
            t("addItem"),
            () => ({ key: newKey(), text: "", critical: false }),
          )}
      </section>

      <TagPicker groups={tagGroups} value={tagIds} onChange={(ids) => (setTagIds(ids), touch())} />

      <FormError error={error?.code} details={error?.details} />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="lg" disabled={pending} onClick={onSave}>
          <Save aria-hidden="true" />
          {pending ? tc("saving") : t("saveDraft")}
        </Button>
        <span role="status" className="text-sm text-muted-foreground">
          {saved ? tc("saved") : dirty ? t("unsaved") : ""}
        </span>
      </div>

      <section aria-labelledby="submit-heading" className="flex flex-col gap-4 rounded-2xl border bg-muted/40 p-5">
        <h2 id="submit-heading" className="text-lg font-semibold">
          {t("submitHeading")}
        </h2>
        <p className="text-muted-foreground">{submitHint}</p>
        {isOhs && <p className="text-sm text-muted-foreground">{t("ohsNote")}</p>}
        {version > 1 && (
          <>
            <Field id="changeNote" label={t("changeNote")} hint={t("changeNoteHint")}>
              <Textarea id="changeNote" rows={3} maxLength={2000} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} aria-describedby="changeNote-hint" />
            </Field>
            <label className="flex min-h-12 items-start gap-3">
              <Checkbox checked={requireReread} onCheckedChange={(v) => setRequireReread(v === true)} className="mt-1" />
              <span>
                <span className="block font-medium">{t("requireReread")}</span>
                <span className="block text-sm text-muted-foreground">{t("requireRereadHint")}</span>
              </span>
            </label>
          </>
        )}
        <Button type="button" size="lg" disabled={pending} onClick={onSubmit} className="self-start">
          <Send aria-hidden="true" />
          {t("submit")}
        </Button>
      </section>
    </div>
  );
}

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const next = [...list];
  const [item] = next.splice(i, 1);
  next.splice(i + dir, 0, item!);
  return next;
}
