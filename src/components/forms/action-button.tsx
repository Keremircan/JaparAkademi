"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/features/shared/action-result";
import { FormError } from "./form-error";

/**
 * Tek tıklık eylem butonu (ör. pasife al, yayınla). İsteğe bağlı onay sorusu sorar,
 * hatayı butonun altında gösterir. Başarıda sayfa sunucu tarafında refresh() ile yenilenir.
 */
export function ActionButton<T>({
  action,
  confirmText,
  children,
  variant = "outline",
  onSuccess,
}: {
  action: () => Promise<ActionResult<T>>;
  confirmText?: string;
  children: ReactNode;
  variant?: "default" | "outline" | "destructive" | "ghost" | "secondary";
  onSuccess?: (data: T) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ code: string; details?: unknown } | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={variant}
        disabled={pending}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          setError(null);
          startTransition(async () => {
            const result = await action();
            if (result.ok) onSuccess?.(result.data);
            else setError({ code: result.error, details: result.details });
          });
        }}
      >
        {children}
      </Button>
      <FormError error={error?.code} details={error?.details} />
    </div>
  );
}
