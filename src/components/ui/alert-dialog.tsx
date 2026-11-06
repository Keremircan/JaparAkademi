"use client";

import { AlertDialog as Primitive } from "@base-ui/react/alert-dialog";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Onay penceresi (Base UI AlertDialog): kullanıcı yanıt vermeden kapanmaz (dışarı tıklamak kapatmaz). Telefonda alttan
 * açılan tam genişlik panel, fareyle kullanılan ekranda ortada kutu. Uzun içerik pencere içinde kayar. Alt menünün (z-20)
 * üstünde durur.
 */
export const AlertDialog = Primitive.Root;
export const AlertDialogTrigger = Primitive.Trigger;
export const AlertDialogClose = Primitive.Close;

export function AlertDialogContent({ className, children, ...props }: ComponentProps<typeof Primitive.Popup>) {
  return (
    <Primitive.Portal>
      <Primitive.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-black/50 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute" />
      <Primitive.Viewport className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
        <Primitive.Popup
          className={cn(
            "flex max-h-[92dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-2xl border bg-popover p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-popover-foreground shadow-xl outline-none transition-[translate,opacity] duration-150 data-ending-style:translate-y-4 data-ending-style:opacity-0 data-starting-style:translate-y-4 data-starting-style:opacity-0 sm:rounded-xl sm:p-6",
            className,
          )}
          {...props}
        >
          {children}
        </Primitive.Popup>
      </Primitive.Viewport>
    </Primitive.Portal>
  );
}

export function AlertDialogTitle({ className, ...props }: ComponentProps<typeof Primitive.Title>) {
  return <Primitive.Title className={cn("text-lg font-semibold", className)} {...props} />;
}

export function AlertDialogDescription({ className, ...props }: ComponentProps<typeof Primitive.Description>) {
  return <Primitive.Description className={cn("text-base", className)} {...props} />;
}
