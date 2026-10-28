import { ShieldAlert } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

type Row = {
  id: string;
  plannedDate: string;
  status: "planned" | "briefed" | "checked_in" | "checked_out" | "cancelled";
  visitorType: "office" | "site" | "contractor";
  fullName: string;
  companyName: string | null;
  hostName: string;
  selfRegistered: boolean;
  nationalIdMasked: string | null;
  blacklisted: boolean;
};

/** Ziyaret listesi (ev sahibi ve güvenlik görünümü). Kara liste işareti yalnızca güvenlik/İSG verisinde gelir. */
export async function VisitList({ rows, base, showHost }: { rows: Row[]; base: string; showHost: boolean }) {
  const [t, format] = await Promise.all([getTranslations("visitors"), getFormatter()]);
  if (rows.length === 0) return <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("list.empty")}</p>;
  return (
    <ul className="divide-y rounded-2xl border">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`${base}/${r.id}`} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-muted">
            <span className="w-28 shrink-0 text-sm text-muted-foreground">{format.dateTime(new Date(`${r.plannedDate}T12:00:00`), { dateStyle: "medium" })}</span>
            <span className="min-w-48 flex-1">
              <span className="flex items-center gap-2 font-medium">
                {r.blacklisted && <ShieldAlert aria-hidden="true" className="size-5 text-destructive" />}
                {r.fullName}
                {r.blacklisted && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">{t("blacklisted")}</span>}
                {r.selfRegistered && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t("selfRegistered")}</span>}
              </span>
              <span className="block text-sm text-muted-foreground">
                {t(`types.${r.visitorType}`)}
                {r.companyName && ` · ${r.companyName}`}
                {showHost && ` · ${t("list.host", { name: r.hostName })}`}
                {r.nationalIdMasked && ` · ${r.nationalIdMasked}`}
              </span>
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t(`status.${r.status}`)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
