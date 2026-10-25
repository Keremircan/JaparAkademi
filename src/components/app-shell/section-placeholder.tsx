import { Construction } from "lucide-react";

/** Henüz içeriği yazılmamış bölümler için ortak yer tutucu. */
export function SectionPlaceholder({
  title,
  description,
  note,
}: {
  title: string;
  description: string;
  note?: string;
}) {
  return (
    <section className="max-w-2xl">
      <h1 className="text-2xl font-semibold lg:text-3xl">{title}</h1>
      <div className="mt-6 flex gap-4 rounded-2xl border border-dashed p-6">
        <Construction aria-hidden="true" className="size-8 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-base">{description}</p>
          {note && <p className="mt-2 text-sm text-muted-foreground">{note}</p>}
        </div>
      </div>
    </section>
  );
}
