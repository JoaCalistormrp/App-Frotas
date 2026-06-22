/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
precacheAndRoute((self as any).__WB_MANIFEST ?? []);

registerRoute(
  /^https:\/\/.*\.supabase\.co\/.*/i,
  new NetworkFirst({ cacheName: "supabase-cache", networkTimeoutSeconds: 10 })
);

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;
  const { title, body, url } = event.data.json() as {
    title: string;
    body: string;
    url?: string;
  };
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "os-aprovacao",
      requireInteraction: true,
      data: { url: url ?? "/admin/maintenance" },
    })
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) ?? "/admin/maintenance";
  event.waitUntil(self.clients.openWindow(url));
});
