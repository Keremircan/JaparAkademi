import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

/** Etiket + kontrol + açıklama. Kontrolün id'si `htmlFor` ile, açıklama `${id}-hint` ile bağlanır. */
export function Field({
  id,
  label,
  hint,
  optional,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  optional?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-base">
        {label}
        {optional && <span className="font-normal text-muted-foreground"> ({optional})</span>}
      </Label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
