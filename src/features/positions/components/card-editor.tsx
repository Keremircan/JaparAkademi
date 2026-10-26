"use client";

import { Link2, Save, Send, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { MediaField } from "@/features/content/components/media-upload";
import { ContentPicker } from "@/features/modules/components/content-picker";
import {
  CRITICAL_KINDS,
  EQUIPMENT_KINDS,
  FREQUENCIES,
  SECTION_NUMBER,
  WEEKDAYS,
  type CardIdentity,
  type CardSectionKey,
  type CardSections,
} from "@/server/services/positions/card-schema";
import type { AssetInfo } from "@/server/services/media";
import { saveCardSectionsAction, submitCardAction } from "../actions";
import { IdentityView } from "./identity-view";
import { ListEditor } from "./list-editor";

function Section({ id, title, hint, optional, children, disabled }: { id: CardSectionKey; title: string; hint: string; optional?: string; children: ReactNode; disabled?: boolean }) {
  return (
    <section id={`section-${id}`} aria-labelledby={`h-${id}`} className="scroll-mt-20 rounded-2xl border p-4 sm:p-5">
      <h2 id={`h-${id}`} className="text-lg font-semibold">
        {SECTION_NUMBER[id]}. {title}
        {optional && <span className="ms-2 text-sm font-normal text-muted-foreground">({optional})</span>}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">{hint}</p>
      <fieldset disabled={disabled} className="flex flex-col gap-3 disabled:opacity-70">
        {children}
      </fieldset>
    </section>
  );
}

function TextField({ label, value, onChange, max, multiline }: { label: string; value: string; onChange: (v: string) => void; max: number; multiline?: boolean }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      {multiline ? (
        <Textarea rows={3} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

export function CardEditor({
  positionId,
  version,
  mode,
  identity,
  initial,
  diagram,
  linkedContents,
}: {
  positionId: string;
  version: number;
  mode: "full" | "ohs";
  identity: CardIdentity;
  initial: CardSections;
  diagram: AssetInfo | null;
  linkedContents: { id: string; title: string; type: string }[];
}) {
  const t = useTranslations("cards");
  const tc = useTranslations("common");
  const [s, setS] = useState<CardSections>(initial);
  const [titles, setTitles] = useState(() => new Map(linkedContents.map((c) => [c.id, c.title])));
  const [diagramAsset, setDiagramAsset] = useState<AssetInfo | null>(diagram);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<{ code: string; details?: unknown } | null>(null);
  const [changeNote, setChangeNote] = useState("");
  const [pending, startTransition] = useTransition();
  const locked = mode === "ohs";

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof CardSections>(key: K, value: CardSections[K]) => {
    setS((x) => ({ ...x, [key]: value }));
    setDirty(true);
    setSaved(false);
  };
  const setOhs = (patch: Partial<CardSections["ohs"]>) => set("ohs", { ...s.ohs, ...patch });

  async function save() {
    setError(null);
    const r = await saveCardSectionsAction(positionId, JSON.parse(JSON.stringify(s)));
    if (!r.ok) {
      setError({ code: r.error, details: r.details });
      return false;
    }
    setDirty(false);
    setSaved(true);
    return true;
  }

  const missing = error?.code === "card_incomplete" && Array.isArray(error.details) ? (error.details as CardSectionKey[]) : [];
  const n = (key: CardSectionKey) => t(`sections.${key}.title`);
  const textList = (key: "risks" | "ppe" | "instructions", label: string, add: string) => (
    <div className="flex flex-col gap-2">
      <span className="font-medium">{label}</span>
      <ListEditor
        items={s.ohs[key]}
        onChange={(items) => setOhs({ [key]: items })}
        blank={() => ({ text: "" })}
        itemLabel={(i) => `${label} ${i + 1}`}
        addLabel={add}
        render={(item, change, i) => <Input aria-label={`${label} ${i + 1}`} maxLength={500} value={item.text} onChange={(e) => change({ text: e.target.value })} />}
      />
    </div>
  );

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      {locked && (
        <p role="status" className="rounded-xl border bg-muted/50 p-4">
          {t("editor.ohsMode")}
        </p>
      )}

      <section aria-labelledby="h-identity" className="rounded-2xl border p-4 sm:p-5">
        <h2 id="h-identity" className="text-lg font-semibold">
          1. {t("sections.identity.title")}
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">{t("sections.identity.hint")}</p>
        <IdentityView identity={identity} />
      </section>

      <Section id="purpose" title={n("purpose")} hint={t("sections.purpose.hint")} disabled={locked}>
        <Textarea aria-labelledby="h-purpose" rows={3} maxLength={500} value={s.purpose} onChange={(e) => set("purpose", e.target.value)} />
        <span className="text-sm text-muted-foreground">{t("editor.chars", { n: s.purpose.length, max: 500 })}</span>
      </Section>

      <Section id="duties" title={n("duties")} hint={t("sections.duties.hint")} disabled={locked}>
        <ListEditor
          disabled={locked}
          items={s.duties}
          onChange={(v) => set("duties", v)}
          blank={() => ({ text: "", frequency: "daily" as const })}
          itemLabel={(i) => t("editor.itemN", { n: i + 1 })}
          addLabel={t("editor.addDuty")}
          render={(d, change) => (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem]">
              <TextField label={t("editor.duty")} value={d.text} max={500} onChange={(text) => change({ text })} />
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">{t("editor.frequency")}</span>
                <NativeSelect value={d.frequency} onChange={(e) => change({ frequency: e.target.value as (typeof FREQUENCIES)[number] })}>
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {t(`frequency.${f}`)}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            </div>
          )}
        />
      </Section>

      <Section id="workflow" title={n("workflow")} hint={t("sections.workflow.hint")} disabled={locked}>
        <ListEditor
          disabled={locked}
          items={s.workflow.steps}
          onChange={(steps) => set("workflow", { ...s.workflow, steps })}
          blank={() => ({ input: "", process: "", output: "" })}
          itemLabel={(i) => t("editor.stepN", { n: i + 1 })}
          addLabel={t("editor.addStep")}
          render={(st, change, i) => (
            <>
              <span className="font-medium">{t("editor.stepN", { n: i + 1 })}</span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <TextField label={t("editor.input")} value={st.input} max={300} onChange={(input) => change({ input })} />
                <TextField label={t("editor.process")} value={st.process} max={1000} onChange={(process) => change({ process })} />
                <TextField label={t("editor.output")} value={st.output} max={300} onChange={(output) => change({ output })} />
              </div>
            </>
          )}
        />
        {!locked && (
          <MediaField
            label={t("editor.diagram")}
            optional
            kinds={["image"]}
            asset={diagramAsset}
            onChange={(a) => {
              setDiagramAsset(a);
              set("workflow", { ...s.workflow, diagramAssetId: a?.id });
            }}
          />
        )}
      </Section>

      <Section id="routines" title={n("routines")} hint={t("sections.routines.hint")} disabled={locked}>
        <ListEditor
          disabled={locked}
          items={s.routines}
          onChange={(v) => set("routines", v)}
          blank={() => ({ time: "", days: [] as (typeof WEEKDAYS)[number][], text: "" })}
          itemLabel={(i) => t("editor.itemN", { n: i + 1 })}
          addLabel={t("editor.addRoutine")}
          render={(r, change) => (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[9rem_1fr]">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">{t("editor.time")}</span>
                  <Input type="time" value={r.time} onChange={(e) => change({ time: e.target.value })} />
                </label>
                <TextField label={t("editor.routine")} value={r.text} max={500} onChange={(text) => change({ text })} />
              </div>
              <fieldset className="flex flex-wrap gap-1">
                <legend className="mb-1 text-sm font-medium">{t("editor.days")}</legend>
                {WEEKDAYS.map((d) => (
                  <label key={d} className="flex min-h-12 min-w-12 cursor-pointer items-center justify-center rounded-lg border px-2 has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={r.days.includes(d)}
                      onChange={(e) => change({ days: e.target.checked ? WEEKDAYS.filter((x) => x === d || r.days.includes(x)) : r.days.filter((x) => x !== d) })}
                    />
                    <span aria-hidden="true">{t(`days.${d}.short`)}</span>
                    <span className="sr-only">{t(`days.${d}.long`)}</span>
                  </label>
                ))}
              </fieldset>
            </>
          )}
        />
      </Section>

      <Section id="reporting" title={n("reporting")} hint={t("sections.reporting.hint")} disabled={locked}>
        <ListEditor
          disabled={locked}
          items={s.reporting}
          onChange={(v) => set("reporting", v)}
          blank={(): CardSections["reporting"][number] => ({ report: "", recipient: "", frequency: "", format: "" })}
          itemLabel={(i) => t("editor.itemN", { n: i + 1 })}
          addLabel={t("editor.addReport")}
          render={(r, change) => (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField label={t("editor.report")} value={r.report} max={200} onChange={(report) => change({ report })} />
                <TextField label={t("editor.recipient")} value={r.recipient} max={200} onChange={(recipient) => change({ recipient })} />
                <TextField label={t("editor.reportFrequency")} value={r.frequency} max={100} onChange={(frequency) => change({ frequency })} />
                <TextField label={t("editor.format")} value={r.format} max={200} onChange={(format) => change({ format })} />
              </div>
              {r.sampleContentId ? (
                <p className="flex items-center gap-2 text-sm">
                  <Link2 aria-hidden="true" className="size-4" />
                  {t("editor.sample")}: {titles.get(r.sampleContentId) ?? "—"}
                  {!locked && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => change({ sampleContentId: undefined })}>
                      <X aria-hidden="true" />
                      {t("editor.unlink")}
                    </Button>
                  )}
                </p>
              ) : (
                !locked && (
                  <details>
                    <summary className="min-h-12 cursor-pointer content-center text-sm">{t("editor.linkSample")}</summary>
                    <ContentPicker
                      exclude={[]}
                      filterType="form_template"
                      onPick={(c) => {
                        setTitles((m) => new Map(m).set(c.id, c.title));
                        change({ sampleContentId: c.id });
                      }}
                    />
                  </details>
                )
              )}
            </>
          )}
        />
      </Section>

      <Section id="equipment" title={n("equipment")} hint={t("sections.equipment.hint")} disabled={locked}>
        <ListEditor
          disabled={locked}
          items={s.equipment}
          onChange={(v) => set("equipment", v)}
          blank={() => ({ name: "", kind: "machine" as const })}
          itemLabel={(i) => t("editor.itemN", { n: i + 1 })}
          addLabel={t("editor.addEquipment")}
          render={(e, change) => (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem]">
              <TextField label={t("editor.equipmentName")} value={e.name} max={200} onChange={(name) => change({ name })} />
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">{t("editor.kind")}</span>
                <NativeSelect value={e.kind} onChange={(ev) => change({ kind: ev.target.value as (typeof EQUIPMENT_KINDS)[number] })}>
                  {EQUIPMENT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`equipmentKinds.${k}`)}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            </div>
          )}
        />
      </Section>

      <Section id="critical" title={n("critical")} hint={t("sections.critical.hint")} disabled={locked}>
        <ListEditor
          disabled={locked}
          items={s.critical}
          onChange={(v) => set("critical", v)}
          blank={() => ({ kind: "error" as const, text: "" })}
          itemLabel={(i) => t("editor.itemN", { n: i + 1 })}
          addLabel={t("editor.addCritical")}
          render={(c, change) => (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_1fr]">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">{t("editor.kind")}</span>
                <NativeSelect value={c.kind} onChange={(ev) => change({ kind: ev.target.value as (typeof CRITICAL_KINDS)[number] })}>
                  {CRITICAL_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`criticalKinds.${k}`)}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <TextField label={t("editor.description")} value={c.text} max={500} onChange={(text) => change({ text })} />
            </div>
          )}
        />
      </Section>

      <Section id="ohs" title={n("ohs")} hint={t("sections.ohs.hint")}>
        {textList("risks", t("editor.risks"), t("editor.addRisk"))}
        {textList("ppe", t("editor.ppe"), t("editor.addPpe"))}
        {textList("instructions", t("editor.instructions"), t("editor.addInstruction"))}
        <TextField label={t("editor.loto")} value={s.ohs.loto} max={2000} multiline onChange={(loto) => setOhs({ loto })} />
        <TextField label={t("editor.emergency")} value={s.ohs.emergency} max={2000} multiline onChange={(emergency) => setOhs({ emergency })} />
        <div className="flex flex-col gap-2">
          <span className="font-medium">{t("editor.ohsContents")}</span>
          {s.ohs.contentIds.length > 0 && (
            <ul className="flex flex-col divide-y rounded-xl border">
              {s.ohs.contentIds.map((id) => (
                <li key={id} className="flex min-h-12 items-center gap-2 px-3">
                  <span className="flex-1">{titles.get(id) ?? "—"}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setOhs({ contentIds: s.ohs.contentIds.filter((x) => x !== id) })}>
                    <X aria-hidden="true" />
                    {t("editor.unlink")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <ContentPicker
            exclude={s.ohs.contentIds}
            onPick={(c) => {
              setTitles((m) => new Map(m).set(c.id, c.title));
              setOhs({ contentIds: [...s.ohs.contentIds, c.id] });
            }}
          />
        </div>
      </Section>

      {(["competencies", "kpis"] as const).map((key) => (
        <Section key={key} id={key} title={n(key)} hint={t(`sections.${key}.hint`)} optional={tc("optional")} disabled={locked}>
          <ListEditor
            disabled={locked}
            items={s[key]}
            onChange={(v) => set(key, v)}
            blank={() => ({ text: "" })}
            itemLabel={(i) => t("editor.itemN", { n: i + 1 })}
            addLabel={t("editor.addItem")}
            render={(x, change, i) => <Input aria-label={t("editor.itemN", { n: i + 1 })} maxLength={500} value={x.text} onChange={(e) => change({ text: e.target.value })} />}
          />
        </Section>
      ))}

      <Section id="contacts" title={n("contacts")} hint={t("sections.contacts.hint")} disabled={locked}>
        <ListEditor
          disabled={locked}
          items={s.contacts}
          onChange={(v) => set("contacts", v)}
          blank={() => ({ situation: "", contact: "" })}
          itemLabel={(i) => t("editor.itemN", { n: i + 1 })}
          addLabel={t("editor.addContact")}
          render={(c, change) => (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField label={t("editor.situation")} value={c.situation} max={300} onChange={(situation) => change({ situation })} />
              <TextField label={t("editor.contact")} value={c.contact} max={200} onChange={(contact) => change({ contact })} />
            </div>
          )}
        />
      </Section>

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-10 flex flex-wrap items-center gap-3 rounded-2xl border bg-background/95 p-3 shadow-sm backdrop-blur lg:bottom-4">
        <Button type="button" size="lg" variant="outline" disabled={pending} onClick={() => startTransition(async () => void (await save()))}>
          <Save aria-hidden="true" />
          {pending ? tc("saving") : t("editor.save")}
        </Button>
        <span role="status" className="text-sm text-muted-foreground">
          {saved ? tc("saved") : dirty ? t("editor.unsaved") : ""}
        </span>
      </div>

      <section aria-labelledby="submit-heading" className="flex flex-col gap-4 rounded-2xl border bg-muted/40 p-5">
        <h2 id="submit-heading" className="text-lg font-semibold">
          {t("editor.submitHeading")}
        </h2>
        <p className="text-muted-foreground">{t("editor.submitHint")}</p>
        {version > 1 && (
          <label className="flex flex-col gap-1">
            <span className="font-medium">{t("editor.changeNote")}</span>
            <Textarea rows={3} maxLength={2000} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
          </label>
        )}
        <FormError error={error?.code} />
        {missing.length > 0 && (
          <ul className="flex flex-col gap-1">
            {missing.map((k) => (
              <li key={k}>
                <a href={`#section-${k}`} className="inline-flex min-h-12 items-center text-destructive underline underline-offset-4">
                  {SECTION_NUMBER[k]}. {n(k)}
                </a>
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          size="lg"
          disabled={pending}
          className="self-start"
          onClick={() =>
            startTransition(async () => {
              if (!(await save())) return;
              const r = await submitCardAction(positionId, changeNote.trim() || null);
              if (r && !r.ok) setError({ code: r.error, details: r.details });
            })
          }
        >
          <Send aria-hidden="true" />
          {t("editor.submit")}
        </Button>
      </section>
    </div>
  );
}
