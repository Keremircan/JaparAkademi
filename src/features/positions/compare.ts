import "server-only";
import { getTranslations } from "next-intl/server";
import type { CardVersionView } from "@/server/services/positions";
import { SECTION_NUMBER, type CardSectionKey } from "@/server/services/positions/card-schema";
import type { DiffSection } from "./components/diff-view";

/** Kart sürümünü bölüm bölüm satırlara çevirir (karşılaştırma için). */
export async function cardDiffSections(a: CardVersionView, b: CardVersionView): Promise<DiffSection[]> {
  const t = await getTranslations("cards");
  const tp = await getTranslations("plans");
  const tk = await getTranslations("modules.kinds");

  const lines = (c: CardVersionView): Record<CardSectionKey | "identity" | "plan", string[]> => {
    const s = c.sections;
    const id = c.identity;
    const titleOf = new Map(c.plan.items.map((i) => [i.moduleId, i.title]));
    return {
      identity: [
        `${id.positionName} (${id.positionCode})`,
        [id.departmentName, id.unitName].filter(Boolean).join(" / "),
        id.supervisorName ?? "",
        id.deputyName ?? "",
        t(`identity.collars.${id.collarType}`),
        id.shiftPattern ?? "",
      ].filter(Boolean),
      purpose: s.purpose ? [s.purpose] : [],
      duties: s.duties.map((d) => `${d.text} — ${t(`frequency.${d.frequency}`)}`),
      workflow: [
        ...s.workflow.steps.map((st) => [st.input, st.process, st.output].filter(Boolean).join(" → ")),
        ...(s.workflow.diagramAssetId ? [`${t("editor.diagram")}: ${s.workflow.diagramAssetId.slice(-8)}`] : []),
      ],
      routines: s.routines.map((r) => [r.time, r.days.map((d) => t(`days.${d}.short`)).join(", "), r.text].filter(Boolean).join(" · ")),
      reporting: s.reporting.map((r) => [r.report, r.recipient, r.frequency, r.format].filter(Boolean).join(" · ")),
      equipment: s.equipment.map((e) => `${e.name} (${t(`equipmentKinds.${e.kind}`)})`),
      critical: s.critical.map((x) => `${t(`criticalKinds.${x.kind}`)}: ${x.text}`),
      ohs: [
        ...s.ohs.risks.map((x) => `${t("editor.risks")}: ${x.text}`),
        ...s.ohs.ppe.map((x) => `${t("editor.ppe")}: ${x.text}`),
        ...s.ohs.instructions.map((x) => `${t("editor.instructions")}: ${x.text}`),
        ...(s.ohs.loto ? [`${t("editor.loto")}: ${s.ohs.loto}`] : []),
        ...(s.ohs.emergency ? [`${t("editor.emergency")}: ${s.ohs.emergency}`] : []),
        ...s.ohs.contentIds.map((cid) => `${t("editor.ohsContents")}: ${c.linkedContents.find((x) => x.id === cid)?.title ?? cid}`),
      ],
      competencies: s.competencies.map((x) => x.text),
      kpis: s.kpis.map((x) => x.text),
      contacts: s.contacts.map((x) => `${x.situation} → ${x.contact}`),
      plan: [
        ...c.plan.items.map((m) =>
          [
            `${m.title} (${tk(`${m.kind}.label`)}, ${tp("minutes", { n: m.durationMin })})`,
            m.isRequired ? "" : tp("optional"),
            m.prerequisiteModuleIds.length ? tp("after", { list: m.prerequisiteModuleIds.map((p) => titleOf.get(p) ?? "—").join(", ") }) : "",
            Object.entries(m.settings)
              .map(([k, v]) => `${tp(`settings.${k as "passScore"}`)}: ${typeof v === "boolean" ? (v ? tp("yes") : tp("no")) : v}`)
              .join(", "),
          ]
            .filter(Boolean)
            .join(" · "),
        ),
        ...(c.plan.overrides.videoWatchRatio !== undefined ? [tp("videoRatio", { percent: Math.round(c.plan.overrides.videoWatchRatio * 100) })] : []),
      ],
    };
  };

  const la = lines(a);
  const lb = lines(b);
  const keys = Object.keys(SECTION_NUMBER) as (keyof typeof SECTION_NUMBER)[];
  return keys
    .sort((x, y) => SECTION_NUMBER[x] - SECTION_NUMBER[y])
    .map((k) => ({
      key: k,
      title: `${SECTION_NUMBER[k]}. ${t(`sections.${k}.title`)}`,
      before: la[k],
      after: lb[k],
      text: k === "purpose",
    }));
}
