// Afritask service worker (SRS SR15).
// Policy — keep it boring and safe:
// - Cache ONLY static, versioned assets (Next's hashed /_next/static files, app icons) and
//   the offline page. These contain no account data.
// - NEVER cache /api/*, /uploads/* or page HTML. Workspace data always comes from the
//   network, so one account's content can't be served to whoever signs in next on this
//   device, and nothing stale is shown as current.
// - No offline writes: when the network is gone, navigations show /offline.html and the app
//   itself tells people what needs a connection.
// - A new worker waits until the page asks it to take over (the "Reload to update" prompt),
//   so an update never interrupts someone mid-edit.

// Bump when this file's caching rules change; old caches are deleted on activate.
const CACHE_NAME = "afritask-static-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

const isStaticAsset = (url) => url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // NOTE: never intercept private or dynamic data — let the browser handle it normally.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) return;

  if (isStaticAsset(url)) {
    // Hashed file names never change content, so cache-first is safe.
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  if (request.mode === "navigate") {
    // Always the network; the offline page only when there is none.
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});

// ─── Web push ─────────────────────
// The server sends { title, body, url, tag } (ids and a short line only — never task
// content beyond the title it already showed in-app). Clicking opens the app at `url`,
// reusing an open Afritask tab when there is one.
self.addEventListener("push", (event) => {
  let payload = { title: "Afritask", body: "", url: "/notifications", tag: "afritask" };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    // An empty or unreadable push still shows something rather than nothing.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // NOTE: only ever open a page on our own origin. A path like "//evil.example" would leave
  // it, so the resolved URL's origin is checked, not just the leading slash.
  const requested = typeof event.notification.data?.url === "string" ? new URL(event.notification.data.url, self.location.origin) : null;
  const target = requested && requested.origin === self.location.origin ? requested.href : new URL("/notifications", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = tabs.find((tab) => new URL(tab.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        return existing.navigate(target);
      }
      return self.clients.openWindow(target);
    })()
  );
});
