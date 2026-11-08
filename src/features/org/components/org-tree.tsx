import { Briefcase, Building2, FolderTree, Pencil, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/forms/action-button";
import { Button } from "@/components/ui/button";
import { DeleteControl } from "@/features/deletion/components/delete-control";
import { Link } from "@/i18n/navigation";
import type { OrgNode } from "@/server/services/org";
import { setOrgUnitActiveAction, setPositionStatusAction } from "../actions";

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

/** Organizasyon ağacı: departman → bölüm → pozisyon, her düğümde düzenleme, pasife alma ve silme. */
export async function OrgTree({ nodes }: { nodes: OrgNode[] }) {
  const t = await getTranslations("admin.org");
  const editLabel = (await getTranslations("common"))("edit");
  if (nodes.length === 0) return <p className="rounded-xl border border-dashed p-5 text-muted-foreground">{t("empty")}</p>;
  return (
    <ul className="flex flex-col gap-4">
      {nodes.map((dept) => (
        <li key={dept.id} className="rounded-xl border">
          <UnitRow node={dept} t={t} editLabel={editLabel} />
          <div className="border-t px-4 py-3 sm:px-6">
            <Positions node={dept} t={t} />
            {dept.children.length > 0 && (
              <ul className="mt-3 flex flex-col gap-3">
                {dept.children.map((section) => (
                  <li key={section.id} className="rounded-xl border bg-muted/30">
                    <UnitRow node={section} t={t} editLabel={editLabel} />
                    <div className="border-t px-4 py-3">
                      <Positions node={section} t={t} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"admin.org">>>;

function UnitRow({ node, t, editLabel }: { node: OrgNode; t: T; editLabel: string }) {
  const Icon = node.kind === "department" ? Building2 : FolderTree;
  // Pasife alma düğmesi ve silme penceresindeki "Pasife al" aynı eylemi paylaşır (sayfaya bir kez yazılır)
  const toggle = setOrgUnitActiveAction.bind(null, node.id, !node.isActive);
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
      <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {node.name}
          {!node.isActive && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">{t("inactive")}</span>}
        </p>
        <p className="text-sm text-muted-foreground">
          {t(`kind.${node.kind}`)} · {t("code")}: {node.code}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {node.isActive && node.kind === "department" && (
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
      </div>
    </div>
  );
}

function Positions({ node, t }: { node: OrgNode; t: T }) {
  if (node.positions.length === 0) return <p className="text-sm text-muted-foreground">{t("noPositions")}</p>;
  return (
    <ul className="divide-y">
      {node.positions.map((p) => {
        const toggle = setPositionStatusAction.bind(null, p.id, p.status === "active" ? "passive" : "active");
        return (
          <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
            <Briefcase aria-hidden="true" className="size-4 text-muted-foreground" />
            <Link href={`/admin/org/positions/${p.id}`} className="min-h-12 min-w-0 flex-1 content-center hover:underline">
              {p.name}
              <span className="ml-2 text-sm text-muted-foreground">
                {p.code} · {t(`collar.${p.collarType}`)} · {t("activePersonnel", { count: p.activePersonnel })}
              </span>
              {p.status === "passive" && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">{t("positionStatus.passive")}</span>}
            </Link>
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
          </li>
        );
      })}
    </ul>
  );
}
