// Lift Log service worker: keeps the app working with no internet connection.
// When you change any app file, bump VERSION so phones pick up the new copy.
const VERSION = "lift-log-v3";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];
const FONTS = "lift-log-fonts";

self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
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

  // App files: cached copy first (instant, works offline), then update the cache from the network
  event.respondWith(caches.open(VERSION).then(async cache => {
    const isPage = req.mode === "navigate";
    const hit = await cache.match(isPage ? "./index.html" : req, { ignoreSearch: true });
    const net = fetch(req).then(res => {
      if (res.ok) cache.put(isPage ? "./index.html" : req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
