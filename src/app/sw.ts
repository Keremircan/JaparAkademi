/// <reference lib="webworker" />
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";

/**
 * Service worker (SPEC 11.1): yalnızca uygulama kabuğu ve statik dosyalar önbelleğe alınır.
 * Sayfalar, RSC yanıtları ve API çağrıları önbelleğe ALINMAZ: ortak cihazlarda kişisel veri
 * cihazda kalmamalı ve çevrimdışı yazma yoktur. Bağlantı yoksa /~offline sayfası gösterilir.
 */
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const runtimeCaching: RuntimeCaching[] = [
  {
    // Derlenmiş JS/CSS (dosya adında içerik özeti var, değişmez)
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/_next/static/"),
    handler: new CacheFirst({
      cacheName: "static-assets",
      plugins: [new ExpirationPlugin({ maxEntries: 256, maxAgeSeconds: 60 * 60 * 24 * 30 })],
    }),
  },
  {
    // Marka görselleri, ikonlar, fontlar
    matcher: ({ url, sameOrigin }) =>
      sameOrigin && /^\/(brand|icons)\/|\.(woff2?|ttf|otf)$/.test(url.pathname),
    handler: new StaleWhileRevalidate({
      cacheName: "brand-assets",
      plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 })],
    }),
  },
  {
    // Next görsel optimizasyonu (yalnızca kamuya açık marka görselleri için kullanılır)
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname === "/_next/image",
    handler: new StaleWhileRevalidate({
      cacheName: "next-image",
      plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 7 })],
    }),
  },
  {
    // Diğer her şey (sayfalar, RSC, server action, API): her zaman ağdan
    matcher: () => true,
    handler: new NetworkOnly(),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Yeni sürüm kullanıcı onayıyla devreye girer ("Yeni sürüm hazır" bildirimi)
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

/**
 * Web push (iş paketi 2.6, karar #176, #184): push yalnızca bildirim kimliğini ve genel bir metni taşır.
 * Dokununca /api/notifications/<kimlik> açılır; sunucu oturumu ve sahipliği kontrol edip ilgili ekrana yönlendirir.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

self.addEventListener("push", (event) => {
  let data: { id?: unknown; title?: unknown; body?: unknown } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = {};
  }
  const id = typeof data.id === "string" && UUID.test(data.id) ? data.id : null;
  const title = typeof data.title === "string" && data.title ? data.title.slice(0, 80) : "JAPAR Akademi";
  const body = typeof data.body === "string" ? data.body.slice(0, 200) : "";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      // Aynı bildirim tazelenirse tek kart kalır
      tag: id ?? "japar-akademi",
      data: { url: id ? `/api/notifications/${id}` : "/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data as { url?: unknown } | null)?.url;
  const path = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/notifications";
  const url = new URL(path, self.location.origin).href;
  // Açık sekme yönlendirilmez (kişi o sırada sınavda ya da formda olabilir); yeni pencere açılır
  event.waitUntil(self.clients.openWindow(url).then(() => undefined));
});
