import type { UserActor } from "@/server/authz/actor";
import { createContent, saveDraft, submitForApproval } from "@/server/services/content";
import { createModule, saveTasks, setModuleContents } from "@/server/services/modules";
import { approveCard, cardApprovalQueue, createCard, getEditableCard, saveCardSections, savePlan, submitCard } from "@/server/services/positions";
import { fullCardSections, seedContentPeople, textBody } from "./content";

type People = Awaited<ReturnType<typeof seedContentPeople>>;

export const moduleInput = (unit: string | null, kind: "theory" | "practice" | "theory_exam" | "practice_exam", title: string, extra: object = {}) => ({
  kind,
  title,
  description: null,
  durationMin: 60,
  isOhs: false,
  remoteAllowed: true,
  validityMonths: null,
  ownerOrgUnitId: unit,
  commonTarget: unit ? null : ("all" as const),
  commonSortOrder: unit ? null : 1,
  ...extra,
});

export async function publishedText(actor: UserActor, unit: string | null, title: string, text: string, isOhs = false) {
  const { id } = await createContent(actor, { type: "text", title, ownerOrgUnitId: unit, commonTarget: unit ? null : "all", isOhs });
  await saveDraft(actor, id, { title, body: textBody(text), tagIds: [] });
  await submitForApproval(actor, id, { changeNote: null, requireReread: false });
  return id;
}

/** Pozisyonun kartını verilen modüllerle (sırayla, her biri öncekine bağlı) yayınlar. */
export async function publishCard(p: People, positionId: string, moduleIds: string[], manager: UserActor = p.smUretim.actor) {
  await createCard(manager, positionId);
  await saveCardSections(manager, positionId, fullCardSections());
  const card = await getEditableCard(manager, positionId);
  const cm = card.plan.items.find((i) => i.isCardModule)!.moduleId;
  const ids = [cm, ...moduleIds];
  await savePlan(manager, positionId, {
    overrides: {},
    items: ids.map((moduleId, i) => ({ moduleId, isRequired: true, prerequisiteModuleIds: i ? [ids[i - 1]!] : [], settings: {} })),
  });
  await submitCard(manager, positionId, { changeNote: null });
  const [q] = await cardApprovalQueue(p.ohs.actor);
  if (q) await approveCard(p.ohs.actor, q.versionId);
  return { cardModuleId: cm };
}

/** Pres Operatörü: teorik (2 içerik) + pratik modül; kart yayında. */
export async function presTraining(p: People) {
  const sm = p.smUretim.actor;
  const c1 = await publishedText(sm, p.org.units.pres, "Pres temelleri", "Pres nasıl çalışır");
  const c2 = await publishedText(sm, p.org.units.pres, "Pres güvenliği", "İki el kumandası");
  const theory = (await createModule(sm, moduleInput(p.org.units.pres, "theory", "Pres teorisi"))).id;
  await setModuleContents(sm, theory, [c1, c2]);
  const practice = (await createModule(sm, moduleInput(p.org.units.pres, "practice", "Pres pratiği"))).id;
  await saveTasks(sm, practice, [{ title: "Kalıp bağlama", description: null, isCritical: true }]);
  const { cardModuleId } = await publishCard(p, p.org.positions.presOp, [theory, practice]);
  return { c1, c2, theory, practice, cardModuleId };
}
