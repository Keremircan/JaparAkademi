"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, formText, runAction, type ActionResult } from "@/features/shared/action-result";
import { redirect } from "@/i18n/navigation";
import {
  approveVersion,
  archiveContent,
  createContent,
  createTag,
  discardDraft,
  rejectVersion,
  saveDraft,
  startNewVersion,
  submitForApproval,
} from "@/server/services/content";
import { CONTENT_TYPES } from "@/server/services/content/body";
import { completeUpload, myAssetStatus, startUpload, type AssetInfo, type UploadPlan } from "@/server/services/media";

const uuid = z.uuid();

const createSchema = z.object({
  type: z.enum(CONTENT_TYPES),
  title: z.string().trim().min(3).max(200),
  owner: z.union([z.literal("common"), z.uuid()]),
  commonTarget: z.enum(["all", "blue", "white"]).optional(),
  isOhs: z.boolean(),
});

export async function createContentAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = createSchema.safeParse({
    type: formText(formData, "type"),
    title: formText(formData, "title") ?? "",
    owner: formText(formData, "owner"),
    commonTarget: formText(formData, "commonTarget") ?? undefined,
    isOhs: formData.get("isOhs") === "on",
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const d = parsed.data;
  const result = await runAction(() =>
    createContent(actor, {
      type: d.type,
      title: d.title,
      ownerOrgUnitId: d.owner === "common" ? null : d.owner,
      commonTarget: d.owner === "common" ? (d.commonTarget ?? "all") : null,
      isOhs: d.isOhs,
    }),
  );
  if (!result.ok) return result;
  return redirect({ href: `/manage/library/${result.data.id}/edit`, locale: await getLocale() });
}

const draftSchema = z.object({
  title: z.string().max(200),
  // Gövde tipine göre serviste doğrulanır
  body: z.record(z.string(), z.unknown()),
  tagIds: z.array(z.uuid()).max(30),
});

export async function saveDraftAction(contentId: string, input: unknown): Promise<ActionResult> {
  const parsed = draftSchema.safeParse(input);
  if (!uuid.safeParse(contentId).success || !parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(() => saveDraft(actor, contentId, parsed.data));
}

const submitSchema = z.object({ changeNote: z.string().max(2000).nullable(), requireReread: z.boolean() });

export async function submitContentAction(contentId: string, input: unknown): Promise<ActionResult> {
  const parsed = submitSchema.safeParse(input);
  if (!uuid.safeParse(contentId).success || !parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => submitForApproval(actor, contentId, parsed.data));
  if (!result.ok) return result;
  return redirect({ href: `/manage/library/${contentId}`, locale: await getLocale() });
}

const commentSchema = z.string().max(2000);

export async function approveVersionAction(versionId: string, comment: string): Promise<ActionResult> {
  if (!uuid.safeParse(versionId).success || !commentSchema.safeParse(comment).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => approveVersion(actor, versionId, comment));
  if (result.ok) refresh();
  return result.ok ? { ok: true, data: undefined } : result;
}

export async function rejectVersionAction(versionId: string, comment: string): Promise<ActionResult> {
  if (!uuid.safeParse(versionId).success || !commentSchema.safeParse(comment).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => rejectVersion(actor, versionId, comment));
  if (result.ok) refresh();
  return result;
}

export async function newVersionAction(contentId: string): Promise<ActionResult> {
  if (!uuid.safeParse(contentId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => startNewVersion(actor, contentId));
  if (!result.ok) return result;
  return redirect({ href: `/manage/library/${contentId}/edit`, locale: await getLocale() });
}

export async function discardDraftAction(contentId: string): Promise<ActionResult> {
  if (!uuid.safeParse(contentId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => discardDraft(actor, contentId));
  if (result.ok) refresh();
  return result;
}

export async function archiveContentAction(contentId: string): Promise<ActionResult> {
  if (!uuid.safeParse(contentId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => archiveContent(actor, contentId));
  if (result.ok) refresh();
  return result;
}

const tagSchema = z.object({ tagTypeId: z.uuid(), name: z.string().max(60) });

export async function createTagAction(input: unknown): Promise<ActionResult<{ id: string; name: string }>> {
  const parsed = tagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(() => createTag(actor, parsed.data));
}

// ---- Medya yükleme ----

const uploadSchema = z.object({
  kind: z.enum(["image", "pdf", "video", "document"]),
  mime: z.string().max(200),
  size: z.number().int().positive(),
  fileName: z.string().max(500),
});

export async function startUploadAction(input: unknown): Promise<ActionResult<UploadPlan>> {
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(() => startUpload(actor, parsed.data));
}

const completeSchema = z.object({
  assetId: z.uuid(),
  parts: z.array(z.object({ partNumber: z.number().int().min(1).max(10_000), etag: z.string().max(200) })).max(10_000).optional(),
});

export async function completeUploadAction(input: unknown): Promise<ActionResult> {
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(() => completeUpload(actor, parsed.data));
}

export async function assetStatusAction(assetId: string): Promise<ActionResult<AssetInfo>> {
  if (!uuid.safeParse(assetId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(() => myAssetStatus(actor, assetId));
}
