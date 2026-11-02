/**
 * Düz metni paragraflara böler (HTML yorumlanmaz). Paragrafın "1. Veri sorumlusu" gibi kısa, numaralı ilk satırı
 * başlık; "• " ya da "- " ile başlayan satırlar madde listesi olarak gösterilir (iş paketi 3.8). Metin değişmez,
 * yalnızca görünüm okunaklı olur.
 */
export function LegalTextBody({ body }: { body: string }) {
  return (
    <div className="flex flex-col gap-3 leading-relaxed">
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
  if (!heading && blocks.length === 1 && blocks[0]!.kind === "text") return <p className="whitespace-pre-line">{text}</p>;
  return (
    <div className="flex flex-col gap-1.5">
      {heading && <p className="font-semibold">{heading}</p>}
      {blocks.map((block, i) =>
        block.kind === "list" ? (
          <ul key={i} className="flex list-disc flex-col gap-1 ps-5">
            {block.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-line">
            {block.lines.join("\n")}
          </p>
        ),
      )}
    </div>
  );
}
