"use client";

import { Plus, Save, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { MediaField } from "@/features/content/components/media-upload";
import type { AssetInfo } from "@/server/services/media";
import { saveClassroomAction, searchPeopleAction } from "../actions";

type Person = { userId: string; name: string; sicilNo: string };

/** Sınıf eğitimi kaydı formu (FG-4.4). */
export function ClassroomForm({
  id,
  modules,
  initial,
  form,
}: {
  id: string | null;
  modules: { id: string; title: string; isOhs: boolean; remoteAllowed: boolean; durationMin: number }[];
  initial: {
    moduleId: string;
    trainer: Person;
    sessionDate: string;
    durationMin: number;
    location: string;
    notes: string;
    attendees: Person[];
  };
  form: AssetInfo | null;
}) {
  const t = useTranslations("classroom.form");
  const tc = useTranslations("common");
  const [moduleId, setModuleId] = useState(initial.moduleId);
  const [trainer, setTrainer] = useState<Person>(initial.trainer);
  const [sessionDate, setDate] = useState(initial.sessionDate);
  const [durationMin, setDuration] = useState(String(initial.durationMin));
  const [location, setLocation] = useState(initial.location);
  const [notes, setNotes] = useState(initial.notes);
  const [attendees, setAttendees] = useState<Person[]>(initial.attendees);
  const [asset, setAsset] = useState<AssetInfo | null>(form);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Person[] | null>(null);
  const [pickTrainer, setPickTrainer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const search = () =>
    startTransition(async () => {
      const r = await searchPeopleAction(q);
      setResults(r.ok ? r.data : []);
    });

  function pick(p: Person) {
    if (pickTrainer) {
      setTrainer(p);
      setPickTrainer(false);
    } else if (!attendees.some((a) => a.userId === p.userId)) {
      setAttendees([...attendees, p]);
    }
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await saveClassroomAction(id, {
        moduleId,
        trainerUserId: trainer.userId,
        sessionDate,
        durationMin: Number(durationMin),
        location,
        notes: notes.trim() || null,
        scannedFormAssetId: asset?.id ?? null,
        attendeeIds: attendees.map((a) => a.userId),
      });
      if (r && !r.ok) setError(r.error);
    });
  }

  const selected = modules.find((m) => m.id === moduleId);

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Field id="module" label={t("module")} hint={selected && !selected.remoteAllowed ? t("classroomOnly") : undefined}>
        <NativeSelect id="module" value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
          <option value="" disabled>
            {t("choose")}
          </option>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
              {m.isOhs ? ` (${t("ohs")})` : ""}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Field id="sessionDate" label={t("date")}>
          <Input id="sessionDate" type="date" value={sessionDate} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field id="duration" label={t("duration")}>
          <Input id="duration" type="number" inputMode="numeric" min={1} max={1440} value={durationMin} onChange={(e) => setDuration(e.target.value)} />
        </Field>
        <Field id="location" label={t("location")}>
          <Input id="location" maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-base font-medium">{t("trainer")}:</span>
        <span>
          {trainer.name} ({trainer.sicilNo})
        </span>
        <Button type="button" variant="outline" size="sm" onClick={() => setPickTrainer((x) => !x)} aria-pressed={pickTrainer}>
          {pickTrainer ? tc("cancel") : t("changeTrainer")}
        </Button>
      </div>

      <section aria-labelledby="attendees-heading" className="flex flex-col gap-3 rounded-2xl border p-4">
        <h2 id="attendees-heading" className="font-semibold">
          {pickTrainer ? t("pickTrainer") : t("attendees", { count: attendees.length })}
        </h2>
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium">{t("search")}</span>
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  search();
                }
              }}
              placeholder={t("searchPlaceholder")}
            />
          </label>
          <Button type="button" variant="secondary" disabled={pending} onClick={search}>
            <Search aria-hidden="true" />
            {t("searchButton")}
          </Button>
        </div>
        {results && (
          <ul className="flex max-h-60 flex-col divide-y overflow-y-auto rounded-xl border" aria-live="polite">
            {results.length === 0 && <li className="p-3 text-sm text-muted-foreground">{t("noResults")}</li>}
            {results.map((p) => (
              <li key={p.userId} className="flex min-h-12 items-center gap-2 px-3">
                <span className="flex-1">
                  {p.name} <span className="text-sm text-muted-foreground">{p.sicilNo}</span>
                </span>
                <Button type="button" variant="outline" size="sm" onClick={() => pick(p)} disabled={!pickTrainer && attendees.some((a) => a.userId === p.userId)}>
                  <Plus aria-hidden="true" />
                  {pickTrainer ? t("select") : t("add")}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {!pickTrainer && attendees.length > 0 && (
          <ul className="flex flex-col divide-y rounded-xl border">
            {attendees.map((a) => (
              <li key={a.userId} className="flex min-h-12 items-center gap-2 px-3">
                <span className="flex-1">
                  {a.name} <span className="text-sm text-muted-foreground">{a.sicilNo}</span>
                </span>
                <Button type="button" variant="ghost" size="icon" onClick={() => setAttendees(attendees.filter((x) => x.userId !== a.userId))} aria-label={t("remove", { name: a.name })}>
                  <X aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MediaField label={t("scannedForm")} kinds={["pdf", "image"]} asset={asset} onChange={setAsset} />
      <Field id="notes" label={t("notes")} optional={tc("optional")}>
        <Textarea id="notes" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <FormError error={error} />
      <Button size="lg" className="self-start" disabled={pending || !moduleId} onClick={save}>
        <Save aria-hidden="true" />
        {pending ? tc("saving") : tc("save")}
      </Button>
    </div>
  );
}
