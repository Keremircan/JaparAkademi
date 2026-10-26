import { useTranslations } from "next-intl";
import type { CardIdentity } from "@/server/services/positions/card-schema";

/** 1. bölüm (künye): pozisyondan okunur (karar #42). */
export function IdentityView({ identity }: { identity: CardIdentity }) {
  const t = useTranslations("cards.identity");
  const rows: [string, string | null][] = [
    [t("position"), `${identity.positionName} (${identity.positionCode})`],
    [t("department"), identity.departmentName],
    [t("unit"), identity.unitName !== identity.departmentName ? identity.unitName : null],
    [t("supervisor"), identity.supervisorName],
    [t("deputy"), identity.deputyName],
    [t("collar"), t(`collars.${identity.collarType}`)],
    [t("shift"), identity.shiftPattern],
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k}>
            <dt className="text-sm text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
    </dl>
  );
}
