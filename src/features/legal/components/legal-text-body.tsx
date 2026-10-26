/** Düz metni paragraflara böler (HTML yorumlanmaz). */
export function LegalTextBody({ body }: { body: string }) {
  return (
    <div className="flex flex-col gap-3 leading-relaxed">
      {body
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
    </div>
  );
}
