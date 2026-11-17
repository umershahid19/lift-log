// Lift Log service worker: keeps the app working with no internet connection.
// When you change any app file, bump VERSION here AND APP_VERSION in index.html.
const VERSION = "lift-log-v5";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];
const FONTS = "lift-log-fonts";
const PAGE_TIMEOUT_MS = 3000;   // weak gym signal: fall back to the saved copy after this long

self.addEventListener("install", event => {
  // cache: "reload" skips the browser's own HTTP cache, so a new version never saves an old file
  event.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Google Fonts: serve from cache, refresh in the background
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(caches.open(FONTS).then(async cache => {
      const hit = await cache.match(req);
      const net = fetch(req).then(res => { if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // The app page: newest copy from the internet when online, saved copy when offline or slow
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const res = await Promise.race([
          fetch(url.origin + url.pathname, { cache: "no-cache" }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), PAGE_TIMEOUT_MS)),
        ]);
        if (res.ok) { cache.put("./index.html", res.clone()); return res; }
      } catch (e) { /* offline or too slow */ }
      return (await cache.match("./index.html")) || fetch(req);
    })());
    return;
  }

  // Icons and other files: saved copy first, refreshed in the background
  event.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(url.href, { cache: "no-cache" }).then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
