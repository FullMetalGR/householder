/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";
import { defaultCache } from "@serwist/turbopack/worker";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope & WorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});
serwist.addEventListeners();

// Classic push path (Android Chrome). The payload is the Declarative Web Push
// JSON, so Safari 18.4+ handles the same bytes without ever running this code.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  event.waitUntil(
    (async () => {
      let data: { notification?: { title?: string; navigate?: string; lang?: string } };
      try {
        data = event.data!.json();
      } catch {
        return;
      }
      const n = data.notification;
      if (!n?.title) return;
      // The payload's navigate is APP_URL-prefixed; a misconfigured APP_URL
      // (preview deploy, stale env) must never steer outside this origin, so
      // foreign targets collapse to the app root before anything uses them.
      const requested = new URL(n.navigate ?? "/", self.location.origin);
      const navigate =
        requested.origin === self.location.origin ? requested.pathname : "/";
      // Presence is client-side only: suppress when a visible window already
      // shows the target list (it live-updated through Realtime).
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const visible = wins.some(
        (c) => c.visibilityState === "visible" && new URL(c.url).pathname === navigate
      );
      if (visible) return;
      await self.registration.showNotification(n.title, {
        icon: "/icons/icon-192.png",
        lang: n.lang,
        data: { navigate },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const navigate: string = event.notification.data?.navigate ?? "/";
  event.waitUntil(
    (async () => {
      // data.navigate is sanitized to a same-origin path by the push handler;
      // re-checking here covers notifications shown by older worker versions.
      const target = new URL(navigate, self.location.origin);
      const url =
        target.origin === self.location.origin ? target.href : `${self.location.origin}/`;
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Prefer a window already on the target, then the focused one: stealing
      // an arbitrary window away from its view is worse than opening fresh.
      const win =
        wins.find((c) => c.url === url) ?? wins.find((c) => c.focused) ?? wins[0];
      if (win) {
        if (win.url !== url) await win.navigate(url);
        await win.focus();
      } else {
        await self.clients.openWindow(url);
      }
    })()
  );
});
