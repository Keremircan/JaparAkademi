import { Download, FileBadge } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { CertificateSummary } from "@/server/services/certificates";
import { RevokeButton } from "./revoke-button";

/** Belge listesi: kursiyerin "Sertifikalarım"ı ve yönetici görünümü (iptal İK'da). */
export async function CertificateList({ items, canRevoke = false }: { items: CertificateSummary[]; canRevoke?: boolean }) {
  const [t, format] = await Promise.all([getTranslations("certificates.list"), getFormatter()]);
  const date = (d: Date) => format.dateTime(d, { dateStyle: "medium" });
  if (items.length === 0) return <p className="rounded-2xl border border-dashed p-5 text-muted-foreground">{t("empty")}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {items.map((c) => (
        <li key={c.id} className="flex flex-col gap-3 rounded-2xl border p-4">
          <div className="flex items-start gap-3">
            <FileBadge aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{c.title}</p>
              <p className="text-sm text-muted-foreground">
                {t(`kinds.${c.kind}`)} · {c.documentNo} · {t("issued", { date: date(c.issuedAt) })}
                {` · ${c.expiresAt ? t("expires", { date: date(c.expiresAt) }) : t("unlimited")}`}
              </p>
              {c.revokedReason && <p className="text-sm text-destructive">{t("revokedReason", { reason: c.revokedReason })}</p>}
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${c.state === "valid" ? "bg-emerald-500/15" : c.state === "expired" ? "bg-amber-500/15" : "bg-destructive/15"}`}
            >
              {t(`state.${c.state}`)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {c.ready ? (
              <a href={`/api/certificates/${c.id}`} className="inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 font-medium hover:bg-muted">
                <Download aria-hidden="true" className="size-5" />
                {t("download")}
              </a>
            ) : (
              <span className="inline-flex min-h-12 items-center text-sm text-muted-foreground" role="status">
                {t("preparing")}
              </span>
            )}
            {canRevoke && c.state !== "revoked" && <RevokeButton id={c.id} />}
          </div>
        </li>
      ))}
    </ul>
  );
}
