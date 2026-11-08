import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { placeholdersIn, splitPlaceholders } from "@/lib/legal";

/**
 * Düz metni paragraflara böler (HTML yorumlanmaz). Paragrafın "1. Veri sorumlusu" gibi kısa, numaralı ilk satırı
 * başlık; "• " ya da "- " ile başlayan satırlar madde listesi olarak gösterilir (iş paketi 3.8). Metin değişmez,
 * yalnızca görünüm okunaklı olur.
 * Doldurulmamış `[[...]]` alanı olan metin (örnek olarak yayınlanmış ya da taslak) üstte "Örnek metin" uyarısıyla,
 * alanlar işaretli gösterilir (karar #275). `sampleNotice={false}` uyarıyı gizler (yönetim listesinde ayrıca yazar).
 */
export function LegalTextBody({ body, sampleNotice = true }: { body: string; sampleNotice?: boolean }) {
  const t = useTranslations("legalText");
  const isSample = placeholdersIn(body).length > 0;
  return (
    <div className="flex flex-col gap-3 leading-relaxed">
      {isSample && sampleNotice && (
        <p role="note" className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{t("sampleNotice")}</span>
        </p>
      )}
      {body
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <Paragraph key={i} text={p} />
        ))}
    </div>
  );
}

const HEADING = /^\d{1,2}\.\s+\S.{0,78}$/;
const BULLET = /^[•\-–]\s+/;

type Block = { kind: "text"; lines: string[] } | { kind: "list"; items: string[] };

/** Satır içindeki `[[...]]` alanlarını işaretler; geri kalan metin olduğu gibi yazılır. */
function Inline({ text }: { text: string }) {
  const parts = splitPlaceholders(text);
  if (parts.length === 1 && !parts[0]!.placeholder) return text;
  return parts.map((part, i) =>
    part.placeholder ? (
      <mark key={i} className="rounded bg-amber-200 px-1 text-foreground dark:bg-amber-500/30">
        {part.text}
      </mark>
    ) : (
      part.text
    ),
  );
}

function Paragraph({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim());
  const heading = HEADING.test(lines[0]!) && !/[.:;,]$/.test(lines[0]!) ? lines.shift() : undefined;
  const blocks: Block[] = [];
  for (const line of lines) {
    if (!line) continue;
    const bullet = BULLET.exec(line);
    const last = blocks.at(-1);
    if (bullet) {
      const item = line.slice(bullet[0].length);
      if (last?.kind === "list") last.items.push(item);
      else blocks.push({ kind: "list", items: [item] });
    } else if (last?.kind === "text") last.lines.push(line);
    else blocks.push({ kind: "text", lines: [line] });
  }
  if (!heading && blocks.length === 1 && blocks[0]!.kind === "text") {
    return (
      <p className="whitespace-pre-line">
        <Inline text={text} />
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {heading && (
        <p className="font-semibold">
          <Inline text={heading} />
        </p>
      )}
      {blocks.map((block, i) =>
        block.kind === "list" ? (
          <ul key={i} className="flex list-disc flex-col gap-1 ps-5">
            {block.items.map((item, j) => (
              <li key={j}>
                <Inline text={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-line">
            <Inline text={block.lines.join("\n")} />
          </p>
        ),
      )}
    </div>
  );
}
