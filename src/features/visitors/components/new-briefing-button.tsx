"use client";

import { useState, useTransition, type ReactNode } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { createBriefingDraftAction } from "../actions";

/** Yeni taslak açar (güncel yayının kopyası) ve editöre gider. */
export function NewBriefingButton({ type, children }: { type: string; children: ReactNode }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await createBriefingDraftAction(type);
            if (!r.ok) return setError(r.error);
            router.push(`/security/briefings/${r.data.id}`);
          })
        }
      >
        {children}
      </Button>
      <FormError error={error} />
    </div>
  );
}
