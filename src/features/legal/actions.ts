"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, formText, runAction, type ActionResult } from "@/features/shared/action-result";
import { redirect } from "@/i18n/navigation";
import { getRequestMeta } from "@/server/auth/request";
import { acceptConsent, createDraft, createSampleDrafts, isLegalKind, publishText, updateDraft } from "@/server/services/legal";
import { SAMPLE_KINDS } from "@/server/services/legal-samples";
import { decideExplicitConsent } from "@/server/services/profile";

const uuid = z.uuid();

const consentSchema = z.object({
  kvkkTextId: uuid.nullable(),
  explicit: z.object({ legalTextId: uuid, granted: z.boolean() }).nullable(),
});

/**
 * Onay ekranı: bekleyen aydınlatma onayı (zorunlu) ve açık rıza kararı (isteğe bağlı, iş paketi 3.4).
 * Aydınlatma metni kabul edilmeden açık rıza kararı yazılmaz.
 */
export async function submitConsentAction(input: unknown): Promise<ActionResult> {
  const parsed = consentSchema.safeParse(input);
  if (!parsed.success || (!parsed.data.kvkkTextId && !parsed.data.explicit)) return { ok: false, error: "invalid_input" };
  const { kvkkTextId, explicit } = parsed.data;
  const { actor } = await actionUser();
  const meta = await getRequestMeta();
  const result = await runAction(async () => {
    if (kvkkTextId) await acceptConsent(actor, kvkkTextId, meta);
    if (explicit) await decideExplicitConsent(actor, { ...explicit, source: "consent_screen" }, meta);
  });
  if (!result.ok) return result;
  return redirect({ href: "/", locale: await getLocale() });
}

const textSchema = z.object({ title: z.string().min(1).max(200), body: z.string().min(1).max(50_000) });

const targetSchema = z.object({ id: uuid.nullable(), kind: z.string().refine(isLegalKind), locale: z.enum(["tr", "en"]) });

export async function saveLegalDraftAction(
  target: { id: string | null; kind: string; locale: string },
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = textSchema.safeParse({ title: formText(formData, "title") ?? "", body: formText(formData, "body") ?? "" });
  const t = targetSchema.safeParse(target);
  if (!parsed.success || !t.success || !isLegalKind(t.data.kind)) return { ok: false, error: "invalid_input" };
  const { id, kind, locale } = t.data;
  const { actor } = await actionUser();
  const result = await runAction(async () => {
    if (id) await updateDraft(actor, id, parsed.data);
    else await createDraft(actor, parsed.data, kind, locale);
  });
  if (!result.ok) return result;
  return redirect({ href: `/admin/legal?kind=${kind}`, locale: await getLocale() });
}

/** Yayınla; `asSample` doldurulmamış alanı kalan metni "örnek olarak" yayınlar (karar #275). */
export async function publishLegalTextAction(id: string, asSample: boolean = false): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || typeof asSample !== "boolean") return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => publishText(actor, id, { asSample }));
  if (result.ok) refresh();
  return result;
}

const sampleKindSchema = z.enum(SAMPLE_KINDS);

/**
 * "Örnek metinle başla" (iş paketi 3.8): türün TR + EN taslağını örnek metinle açar. `replace`: "Örnek metinle
 * yeniden başla" (karar #276) — var olan taslak güncel örnek metinle değiştirilir.
 */
export async function createLegalSampleAction(kind: string, replace: boolean = false): Promise<ActionResult> {
  const parsed = sampleKindSchema.safeParse(kind);
  if (!parsed.success || typeof replace !== "boolean") return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(async () => {
    await createSampleDrafts(actor, parsed.data, { replace });
  });
  if (result.ok) refresh();
  return result;
}
