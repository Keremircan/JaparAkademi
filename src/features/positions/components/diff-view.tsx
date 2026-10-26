import { getTranslations } from "next-intl/server";
import { diffSeq, diffWords, hasChanges } from "@/lib/diff";

/** Satır listesi farkı: eklenen yeşil, çıkarılan kırmızı (renk + metin etiketi). */
export async function LineDiff({ before, after }: { before: string[]; after: string[] }) {
  const t = await getTranslations("compare");
  const ops = diffSeq(before, after);
  if (ops.length === 0) return <p className="text-muted-foreground">{t("empty")}</p>;
  return (
    <ul className="flex flex-col gap-1">
      {ops.map((o, i) => (
        <li
          key={i}
          className={
            o.op === "add"
              ? "rounded-md bg-emerald-500/15 px-2 py-1 text-emerald-900 dark:text-emerald-200"
              : o.op === "del"
                ? "rounded-md bg-destructive/10 px-2 py-1 text-destructive line-through"
                : "px-2 py-1"
          }
        >
          {o.op !== "eq" && <span className="sr-only">{t(o.op === "add" ? "added" : "removed")}: </span>}
          <span aria-hidden="true" className="me-2 font-mono text-xs">
            {o.op === "add" ? "+" : o.op === "del" ? "−" : " "}
          </span>
          {o.value}
        </li>
      ))}
    </ul>
  );
}

/** Metin farkı (kelime bazında). */
export async function TextDiff({ before, after }: { before: string; after: string }) {
  const t = await getTranslations("compare");
  const ops = diffWords(before, after);
  return (
    <p className="whitespace-pre-line">
      {ops.map((o, i) =>
        o.op === "eq" ? (
          <span key={i}>{o.value}</span>
        ) : o.op === "add" ? (
          <ins key={i} className="rounded bg-emerald-500/15 text-emerald-900 no-underline dark:text-emerald-200">
            <span className="sr-only">{t("added")}: </span>
            {o.value}
          </ins>
        ) : (
          <del key={i} className="rounded bg-destructive/10 text-destructive">
            <span className="sr-only">{t("removed")}: </span>
            {o.value}
          </del>
        ),
      )}
    </p>
  );
}

export type DiffSection = { key: string; title: string; before: string[]; after: string[]; text?: boolean };

/** Bölüm bölüm karşılaştırma; değişmeyen bölümler kapalı gösterilir. */
export async function SectionsDiff({ sections }: { sections: DiffSection[] }) {
  const t = await getTranslations("compare");
  const changed = sections.filter((s) => hasChanges(diffSeq(s.before, s.after)));
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-muted-foreground">
        {changed.length ? t("changedCount", { count: changed.length }) : t("noChanges")}
      </p>
      {sections.map((s) => {
        const isChanged = changed.includes(s);
        return (
          <details key={s.key} open={isChanged} className="rounded-2xl border">
            <summary className="flex min-h-12 cursor-pointer items-center gap-3 px-4">
              <span className="flex-1 font-semibold">{s.title}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${isChanged ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-muted"}`}>
                {isChanged ? t("changed") : t("unchanged")}
              </span>
            </summary>
            <div className="border-t p-4">
              {s.text ? <TextDiff before={s.before.join("\n")} after={s.after.join("\n")} /> : <LineDiff before={s.before} after={s.after} />}
            </div>
          </details>
        );
      })}
    </div>
  );
}
