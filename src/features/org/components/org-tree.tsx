import { Briefcase, Building2, FolderTree, Pencil, Plus, Users, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/forms/action-button";
import { Button } from "@/components/ui/button";
import { DeleteControl } from "@/features/deletion/components/delete-control";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { OrgNode, PositionSummary } from "@/server/services/org";
import { setOrgUnitActiveAction, setPositionStatusAction } from "../actions";
import { departmentHues, HUE_CLASSES } from "../hues";
import { UnitActions, UnitBody, UnitToggle } from "./org-collapse";

/**
 * Organizasyonda pasif birim ve pozisyonları gizler (iş paketi 3.14, karar #287): "Pasifleri göster" seçilmedikçe
 * listede yalnızca etkin olanlar görünür. Pasif departmanın altı da pasiftir (pasife alma kuralı).
 */
export function activeOnly(nodes: OrgNode[]): OrgNode[] {
  return nodes
    .filter((n) => n.isActive)
    .map((n) => ({ ...n, positions: n.positions.filter((p) => p.status === "active"), children: activeOnly(n.children) }));
}

/** Pasif birim ve pozisyon sayısı (gösterme düğmesinde). */
export function passiveCount(nodes: OrgNode[]): number {
  return nodes.reduce(
    (sum, n) => sum + (n.isActive ? 0 : 1) + n.positions.filter((p) => p.status === "passive").length + passiveCount(n.children),
    0,
  );
}

/** Ağaçtaki bütün departman ve bölümlerin kimlikleri ("Tümünü aç" düğmesinde). */
export function unitIds(nodes: OrgNode[]): string[] {
  return nodes.flatMap((n) => [n.id, ...unitIds(n.children)]);
}

const people = (positions: PositionSummary[]) => positions.reduce((sum, p) => sum + p.activePersonnel, 0);

type T = Awaited<ReturnType<typeof getTranslations<"admin.org">>>;
type Hue = (typeof HUE_CLASSES)[keyof typeof HUE_CLASSES];

/**
 * Organizasyon ağacı (karar #293): departman → bölüm → pozisyon. Her departmanın kendi rengi vardır (başlık zemini,
 * sol çizgi, bölümlerin kılavuz çizgisi); bölümler departmanın içinde girintili, pozisyonlar en altta sade satırlardır.
 * Departman adı h2, bölüm adı h3: hiyerarşi ekran okuyucuda da anlaşılır. Departman ve bölümler kapalı başlar; adına
 * tıklanınca açılır (karar #294). Başlıktaki sayılar kapalıyken de görünür; düğmeler geniş ekranda her zaman, telefonda
 * birim açılınca görünür.
 */
export async function OrgTree({ nodes }: { nodes: OrgNode[] }) {
  const t = await getTranslations("admin.org");
  const editLabel = (await getTranslations("common"))("edit");
  if (nodes.length === 0) return <p className="rounded-xl border border-dashed p-5 text-muted-foreground">{t("empty")}</p>;
  const hues = departmentHues(nodes);
  return (
    <ul className="flex flex-col gap-6">
      {nodes.map((dept, i) => {
        const hue = HUE_CLASSES[hues[i]!];
        const all = [...dept.positions, ...dept.children.flatMap((s) => s.positions)];
        const hasSections = dept.children.length > 0;
        return (
          <li key={dept.id} className="relative overflow-hidden rounded-xl border bg-card shadow-xs">
            <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1.5", hue.bar)} />
            <UnitHeader
              node={dept}
              hue={hue}
              t={t}
              editLabel={editLabel}
              stats={[
                ...(hasSections ? [{ icon: FolderTree, text: t("summary.sections", { count: dept.children.length }) }] : []),
                { icon: Briefcase, text: t("summary.positions", { count: all.length }) },
                { icon: Users, text: t("activePersonnel", { count: people(all) }) },
              ]}
            />
            <UnitBody id={dept.id}>
              <div className="flex flex-col gap-4 border-t py-4 pr-3 pl-5 sm:pr-6 sm:pl-7">
                {(dept.positions.length > 0 || !hasSections) && (
                  <div>
                    {hasSections && <p className="mb-1 text-sm font-medium text-muted-foreground">{t("directPositions")}</p>}
                    <Positions positions={dept.positions} t={t} />
                  </div>
                )}
                {hasSections && (
                  <ul className={cn("flex flex-col gap-3 border-l-2 pl-3 sm:pl-5", hue.guide)}>
                    {dept.children.map((section) => (
                      <li key={section.id} className="overflow-hidden rounded-lg border bg-card">
                        <UnitHeader
                          node={section}
                          hue={hue}
                          t={t}
                          editLabel={editLabel}
                          stats={[
                            { icon: Briefcase, text: t("summary.positions", { count: section.positions.length }) },
                            { icon: Users, text: t("activePersonnel", { count: people(section.positions) }) },
                          ]}
                        />
                        <UnitBody id={section.id}>
                          <div className="border-t px-3 sm:px-4">
                            <Positions positions={section.positions} t={t} />
                          </div>
                        </UnitBody>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </UnitBody>
          </li>
        );
      })}
    </ul>
  );
}

function UnitHeader({
  node,
  hue,
  t,
  editLabel,
  stats,
}: {
  node: OrgNode;
  hue: Hue;
  t: T;
  editLabel: string;
  stats: { icon: LucideIcon; text: string }[];
}) {
  const isDept = node.kind === "department";
  // Pasife alma düğmesi ve silme penceresindeki "Pasife al" aynı eylemi paylaşır (sayfaya bir kez yazılır)
  const toggle = setOrgUnitActiveAction.bind(null, node.id, !node.isActive);
  const Heading = isDept ? "h2" : "h3";
  return (
    <div
      data-org-unit={node.kind}
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-3",
        isDept ? cn("py-4 pr-3 pl-5 sm:pr-6 sm:pl-7", hue.header) : "bg-muted/40 px-3 py-3 sm:px-4",
      )}
    >
      <div className="relative flex min-w-0 flex-1 basis-64 items-center gap-3">
        {isDept ? (
          <span aria-hidden="true" className={cn("grid size-10 shrink-0 place-items-center rounded-lg", hue.icon)}>
            <Building2 className="size-5" />
          </span>
        ) : (
          <FolderTree aria-hidden="true" className={cn("size-5 shrink-0", hue.sectionIcon)} />
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Heading className={cn("leading-snug font-semibold", isDept ? "text-xl" : "text-lg")}>
              <UnitToggle id={node.id} name={node.name} />
            </Heading>
            <span className="rounded-full border bg-background/70 px-2 py-0.5 text-xs font-medium">{t(`kind.${node.kind}`)}</span>
            {!node.isActive && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{t("inactive")}</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>
              {t("code")}: {node.code}
            </span>
            {stats.map(({ icon: Icon, text }) => (
              <span key={text} className="inline-flex items-center gap-1">
                <Icon aria-hidden="true" className="size-3.5" />
                {text}
              </span>
            ))}
          </div>
        </div>
      </div>
      <UnitActions id={node.id}>
        {node.isActive && isDept && (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/admin/org/units/new?kind=section&parentId=${node.id}`} />}>
            <Plus aria-hidden="true" />
            {t("addSection")}
          </Button>
        )}
        {node.isActive && (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/admin/org/positions/new?orgUnitId=${node.id}`} />}>
            <Plus aria-hidden="true" />
            {t("addPosition")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={`/admin/org/units/${node.id}`} aria-label={`${editLabel}: ${node.name}`} />}
        >
          <Pencil aria-hidden="true" />
          {editLabel}
        </Button>
        <ActionButton variant="ghost" action={toggle}>
          {node.isActive ? t("deactivate") : t("activate")}
        </ActionButton>
        <DeleteControl
          kind="org_unit"
          id={node.id}
          subject={node.kind}
          name={node.name}
          archive={node.isActive ? { action: toggle, label: t("deactivate") } : undefined}
        />
      </UnitActions>
    </div>
  );
}

const COLLAR_CHIP = {
  blue: "bg-blue-50 text-blue-800 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:ring-blue-900",
  white: "bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700",
} as const;

function Positions({ positions, t }: { positions: PositionSummary[]; t: T }) {
  if (positions.length === 0) return <p className="py-3 text-sm text-muted-foreground">{t("noPositions")}</p>;
  return (
    <ul className="divide-y">
      {positions.map((p) => {
        const toggle = setPositionStatusAction.bind(null, p.id, p.status === "active" ? "passive" : "active");
        return (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 py-1">
            <Link
              href={`/admin/org/positions/${p.id}`}
              className="group flex min-h-12 min-w-0 flex-1 basis-56 flex-wrap items-center gap-x-2 gap-y-1 py-1 pointer-fine:min-h-10"
            >
              <Briefcase aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span className="font-medium group-hover:underline">{p.name}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{p.code}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", COLLAR_CHIP[p.collarType])}>
                {t(`collar.${p.collarType}`)}
              </span>
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <Users aria-hidden="true" className="size-3.5" />
                {t("activePersonnel", { count: p.activePersonnel })}
              </span>
              {p.status === "passive" && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{t("positionStatus.passive")}</span>}
            </Link>
            <div className="flex items-center gap-1">
              <ActionButton variant="ghost" action={toggle}>
                {p.status === "active" ? t("deactivate") : t("activate")}
              </ActionButton>
              <DeleteControl
                kind="position"
                id={p.id}
                subject="position"
                name={p.name}
                archive={p.status === "active" ? { action: toggle, label: t("deactivate") } : undefined}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
