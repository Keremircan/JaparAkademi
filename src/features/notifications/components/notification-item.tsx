"use client";

import { ChevronRight, Circle } from "lucide-react";
import { useTransition } from "react";
import { openNotificationAction } from "../actions";

/** Bildirim satırı: tıklanınca okundu işaretlenir ve ilgili ekrana gidilir. */
export function NotificationItem({ id, title, time, read, unreadLabel }: { id: string; title: string; time: string; read: boolean; unreadLabel: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => void (await openNotificationAction(id)))}
      className={`flex min-h-16 w-full items-center gap-3 px-4 py-3 text-start hover:bg-muted disabled:opacity-60 ${read ? "" : "bg-primary/5"}`}
    >
      {read ? <span className="size-3 shrink-0" /> : <Circle aria-label={unreadLabel} className="size-3 shrink-0 fill-primary text-primary" />}
      <span className="min-w-0 flex-1">
        <span className={`block ${read ? "" : "font-semibold"}`}>{title}</span>
        <span className="block text-sm text-muted-foreground">{time}</span>
      </span>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
    </button>
  );
}
