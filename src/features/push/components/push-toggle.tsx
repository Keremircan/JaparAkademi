"use client";

import { BellOff, BellRing } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { pushStatusAction, subscribePushAction, unsubscribePushAction } from "../actions";

type State = "loading" | "unsupported" | "ios_install" | "denied" | "on" | "off";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  // İlk ziyarette kayıt sayfa açıldıktan sonra tamamlanır; geliştirmede service worker kapalıdır (beklemez)
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 5000))]);
}

function detect(): State | null {
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  // iOS 16.4 ve sonrası yalnızca ana ekrana eklenmiş uygulamada push alır (karar #181)
  if (isIos && !standalone) return "ios_install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return null;
}

/** Bu cihazın durumu: engel varsa nedeni, yoksa aboneliğin bu kişiye kayıtlı olup olmadığı. */
async function currentState(): Promise<State> {
  const blocked = detect();
  if (blocked) return blocked;
  const reg = await registration();
  if (!reg) return "unsupported";
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return "off";
  const r = await pushStatusAction(sub.endpoint);
  return r.ok && r.data ? "on" : "off";
}

/**
 * "Bu cihazda bildirimler" (karar #177): tercih cihaz bazındadır. Açınca tarayıcı izni istenir ve abonelik
 * sunucuya kaydedilir; kapatınca hem tarayıcıda hem sunucuda silinir.
 */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const t = useTranslations("push");
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void currentState().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = () =>
    startTransition(async () => {
      setError(null);
      const reg = await registration();
      if (!reg) return setState("unsupported");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const options = { userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) };
      let sub: PushSubscription;
      try {
        sub = await reg.pushManager.subscribe(options);
      } catch {
        // Sunucu anahtarı değiştiyse eski abonelik kaldırılıp yeniden denenir
        await (await reg.pushManager.getSubscription())?.unsubscribe();
        try {
          sub = await reg.pushManager.subscribe(options);
        } catch {
          return setError("push_failed");
        }
      }
      const r = await subscribePushAction(JSON.parse(JSON.stringify(sub.toJSON())));
      if (!r.ok) {
        await sub.unsubscribe();
        return setError(r.error);
      }
      setState("on");
    });

  const disable = () =>
    startTransition(async () => {
      setError(null);
      const sub = await (await registration())?.pushManager.getSubscription();
      if (sub) {
        const r = await unsubscribePushAction(sub.endpoint);
        if (!r.ok) return setError(r.error);
        await sub.unsubscribe();
      }
      setState("off");
    });

  return (
    <section aria-labelledby="push-title" className="mt-6 flex flex-col gap-3 rounded-2xl border p-5">
      <h2 id="push-title" className="text-lg font-semibold">
        {t("title")}
      </h2>
      {state === "loading" ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : state === "on" || state === "off" ? (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            {t(state === "on" ? "onHint" : "offHint")}
          </p>
          <FormError error={error} />
          {state === "on" ? (
            <Button variant="outline" size="lg" className="justify-start" disabled={pending} onClick={disable}>
              <BellOff aria-hidden="true" />
              {t("disable")}
            </Button>
          ) : (
            <Button size="lg" className="justify-start" disabled={pending} onClick={enable}>
              <BellRing aria-hidden="true" />
              {t("enable")}
            </Button>
          )}
        </>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          {t(`blocked.${state}`)}
        </p>
      )}
    </section>
  );
}
