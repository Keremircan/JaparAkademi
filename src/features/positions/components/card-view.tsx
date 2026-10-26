import { AlertTriangle, Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { CardVersionView } from "@/server/services/positions";
import { SECTION_NUMBER, type CardSectionKey } from "@/server/services/positions/card-schema";
import { IdentityView } from "./identity-view";

function Block({ id, title, children }: { id: CardSectionKey | "identity" | "plan"; title: string; children: ReactNode }) {
  return (
    <section id={`section-${id}`} aria-labelledby={`v-${id}`} className="scroll-mt-20 border-t pt-4 first:border-t-0 first:pt-0">
      <h3 id={`v-${id}`} className="mb-2 text-lg font-semibold">
        {SECTION_NUMBER[id]}. {title}
      </h3>
      {children}
    </section>
  );
}

/** Kart sürümünün okunur görünümü (1–13. bölümler). */
export async function CardView({ card, showPlan = true }: { card: CardVersionView; showPlan?: boolean }) {
  const t = await getTranslations("cards");
  const s = card.sections;
  const title = (k: CardSectionKey) => t(`sections.${k}.title`);
  const contentTitle = new Map(card.linkedContents.map((c) => [c.id, c.title]));
  const empty = <p className="text-muted-foreground">{t("view.empty")}</p>;
  const bullets = (items: string[]) =>
    items.length ? (
      <ul className="list-disc ps-6">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    ) : (
      empty
    );

  return (
    <div className="flex flex-col gap-6">
      <Block id="identity" title={t("sections.identity.title")}>
        <IdentityView identity={card.identity} />
      </Block>
      <Block id="purpose" title={title("purpose")}>
        {s.purpose ? <p className="whitespace-pre-line">{s.purpose}</p> : empty}
      </Block>
      <Block id="duties" title={title("duties")}>
        {bullets(s.duties.map((d) => `${d.text} — ${t(`frequency.${d.frequency}`)}`))}
      </Block>
      <Block id="workflow" title={title("workflow")}>
        {s.workflow.steps.length ? (
          <ol className="flex flex-col gap-2">
            {s.workflow.steps.map((st, i) => (
              <li key={i} className="rounded-xl border p-3">
                <span className="font-medium">{t("editor.stepN", { n: i + 1 })}: </span>
                {st.process}
                {(st.input || st.output) && (
                  <span className="block text-sm text-muted-foreground">
                    {st.input && `${t("editor.input")}: ${st.input}`} {st.output && ` → ${t("editor.output")}: ${st.output}`}
                  </span>
                )}
              </li>
            ))}
          </ol>
        ) : (
          empty
        )}
        {s.workflow.diagramAssetId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/media/${s.workflow.diagramAssetId}/image`} alt={t("editor.diagram")} loading="lazy" className="mt-3 max-h-[32rem] w-full rounded-xl border object-contain" />
        )}
      </Block>
      <Block id="routines" title={title("routines")}>
        {bullets(s.routines.map((r) => [r.time, r.days.map((d) => t(`days.${d}.short`)).join(", "), r.text].filter(Boolean).join(" · ")))}
      </Block>
      <Block id="reporting" title={title("reporting")}>
        {s.reporting.length ? (
          <ul className="flex flex-col gap-2">
            {s.reporting.map((r, i) => (
              <li key={i} className="rounded-xl border p-3">
                <span className="font-medium">{r.report}</span> → {r.recipient}
                <span className="block text-sm text-muted-foreground">{[r.frequency, r.format].filter(Boolean).join(" · ")}</span>
                {r.sampleContentId && (
                  <Link href={`/manage/library/${r.sampleContentId}`} className="inline-flex min-h-10 items-center text-sm underline underline-offset-4">
                    {t("editor.sample")}: {contentTitle.get(r.sampleContentId) ?? "—"}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        ) : (
          empty
        )}
      </Block>
      <Block id="equipment" title={title("equipment")}>
        {bullets(s.equipment.map((e) => `${e.name} (${t(`equipmentKinds.${e.kind}`)})`))}
      </Block>
      <Block id="critical" title={title("critical")}>
        {bullets(s.critical.map((c) => `${t(`criticalKinds.${c.kind}`)}: ${c.text}`))}
      </Block>
      <Block id="ohs" title={title("ohs")}>
        <div className="flex flex-col gap-3">
          {(["risks", "ppe", "instructions"] as const).map((k) =>
            s.ohs[k].length ? (
              <div key={k}>
                <p className="font-medium">{t(`editor.${k}`)}</p>
                {bullets(s.ohs[k].map((x) => x.text))}
              </div>
            ) : null,
          )}
          {s.ohs.loto && (
            <div>
              <p className="font-medium">{t("editor.loto")}</p>
              <p className="whitespace-pre-line">{s.ohs.loto}</p>
            </div>
          )}
          {s.ohs.emergency && (
            <div>
              <p className="font-medium">{t("editor.emergency")}</p>
              <p className="whitespace-pre-line">{s.ohs.emergency}</p>
            </div>
          )}
          {s.ohs.contentIds.length > 0 && (
            <ul className="flex flex-col">
              {s.ohs.contentIds.map((id) => (
                <li key={id}>
                  <Link href={`/manage/library/${id}`} className="inline-flex min-h-10 items-center underline underline-offset-4">
                    {contentTitle.get(id) ?? "—"}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Block>
      <Block id="competencies" title={title("competencies")}>
        {bullets(s.competencies.map((x) => x.text))}
      </Block>
      <Block id="kpis" title={title("kpis")}>
        {bullets(s.kpis.map((x) => x.text))}
      </Block>
      <Block id="contacts" title={title("contacts")}>
        {bullets(s.contacts.map((c) => `${c.situation} → ${c.contact}`))}
      </Block>
      {showPlan && (
        <Block id="plan" title={t("sections.plan.title")}>
          <PlanView card={card} />
        </Block>
      )}
    </div>
  );
}

/** Planın okunur görünümü: ortak modüller (otomatik) + plan modülleri. */
export async function PlanView({ card }: { card: CardVersionView }) {
  const t = await getTranslations("plans");
  const tk = await getTranslations("modules.kinds");
  const items = card.plan.items;
  const titleOf = new Map(items.map((i) => [i.moduleId, i.title]));
  const total = [...card.commonModules, ...items].reduce((a, m) => a + m.durationMin, 0);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("total", { hours: Math.floor(total / 60), minutes: total % 60 })}</p>
      <ol className="flex flex-col gap-2">
        {card.commonModules.map((m) => (
          <li key={m.id} className="flex min-h-12 items-center gap-3 rounded-xl border border-dashed px-3 py-2 text-muted-foreground">
            <Lock aria-hidden="true" className="size-4 shrink-0" />
            <span className="flex-1">
              {m.title} <span className="text-sm">· {tk(`${m.kind}.label`)} · {t("minutes", { n: m.durationMin })}</span>
            </span>
            <span className="text-xs">{t("commonAuto")}</span>
          </li>
        ))}
        {items.map((m, i) => (
          <li key={m.moduleId} className="flex flex-col gap-1 rounded-xl border px-3 py-2">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{i + 1}.</span>
              <Link href={`/manage/modules/${m.moduleId}`} className="font-medium underline-offset-4 hover:underline">
                {m.title}
              </Link>
              <span className="text-sm text-muted-foreground">
                {tk(`${m.kind}.label`)} · {t("minutes", { n: m.durationMin })}
              </span>
              {!m.isRequired && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t("optional")}</span>}
              {m.isOhs && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-300">{t("ohs")}</span>}
              {m.archived && (
                <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                  <AlertTriangle aria-hidden="true" className="size-3" />
                  {t("archived")}
                </span>
              )}
            </span>
            {m.prerequisiteModuleIds.length > 0 && (
              <span className="text-sm text-muted-foreground">{t("after", { list: m.prerequisiteModuleIds.map((p) => titleOf.get(p) ?? "—").join(", ") })}</span>
            )}
            {Object.keys(m.settings).length > 0 && (
              <span className="text-sm text-muted-foreground">
                {Object.entries(m.settings)
                  .map(([k, v]) => `${t(`settings.${k as "passScore"}`)}: ${typeof v === "boolean" ? (v ? t("yes") : t("no")) : v}`)
                  .join(" · ")}
              </span>
            )}
          </li>
        ))}
      </ol>
      {card.plan.overrides.videoWatchRatio !== undefined && (
        <p className="text-sm text-muted-foreground">{t("videoRatio", { percent: Math.round(card.plan.overrides.videoWatchRatio * 100) })}</p>
      )}
    </div>
  );
}
