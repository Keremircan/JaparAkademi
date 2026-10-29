"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/features/shared/action-result";
import type { Role } from "@/server/authz/roles";
import { setRolesAction, setScopesAction } from "../actions";

const ASSIGNABLE: Role[] = ["trainer", "section_manager", "ohs_specialist", "hr", "security", "sysadmin"];

function CheckRow({ name, value, label, checked }: { name: string; value: string; label: string; checked: boolean }) {
  const id = `${name}-${value}`;
  return (
    <Label htmlFor={id} className="flex min-h-12 cursor-pointer items-center gap-3 text-base font-normal">
      <Checkbox id={id} name={name} value={value} defaultChecked={checked} className="size-6" aria-labelledby={`${id}-label`} />
      <span id={`${id}-label`}>{label}</span>
    </Label>
  );
}

export function RolesForm({ userId, roles, canGrantOwner }: { userId: string; roles: Role[]; canGrantOwner: boolean }) {
  const t = useTranslations();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(setRolesAction.bind(null, userId), null);
  return (
    <form action={action} className="flex flex-col gap-2">
      {state && !state.ok && <FormError error={state.error} />}
      {state?.ok && <p role="status" className="text-sm">{t("common.saved")}</p>}
      <p className="flex min-h-12 items-center text-muted-foreground">{t("roles.personnel")} ✓</p>
      {ASSIGNABLE.map((role) => (
        <CheckRow key={role} name="roles" value={role} label={t(`roles.${role}`)} checked={roles.includes(role)} />
      ))}
      {/* Üst yönetici rolünü yalnızca üst yönetici verir (karar #193) */}
      {canGrantOwner ? (
        <CheckRow name="roles" value="owner" label={t("roles.owner")} checked={roles.includes("owner")} />
      ) : (
        roles.includes("owner") && <p className="flex min-h-12 items-center text-muted-foreground">{t("roles.owner")} ✓</p>
      )}
      <Button type="submit" disabled={pending} className="mt-2 self-start">
        {t("admin.roles.saveRoles")}
      </Button>
    </form>
  );
}

export function ScopesForm({
  userId,
  units,
  selected,
}: {
  userId: string;
  units: { id: string; label: string }[];
  selected: string[];
}) {
  const t = useTranslations();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(setScopesAction.bind(null, userId), null);
  return (
    <form action={action} className="flex flex-col gap-2">
      {state && !state.ok && <FormError error={state.error} />}
      {state?.ok && <p role="status" className="text-sm">{t("common.saved")}</p>}
      <p className="text-sm text-muted-foreground">{t("admin.roles.scopesHint")}</p>
      {units.map((u) => (
        <CheckRow key={u.id} name="orgUnitIds" value={u.id} label={u.label} checked={selected.includes(u.id)} />
      ))}
      <Button type="submit" disabled={pending} className="mt-2 self-start">
        {t("admin.roles.saveScopes")}
      </Button>
    </form>
  );
}
