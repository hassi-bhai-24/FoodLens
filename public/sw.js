// App-shell service worker. Caches the shell only; chat data lives in
// IndexedDB and AI/barcode calls always go to the network.
const CACHE = "foodlens-shell-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/manifest.webmanifest"])).catch(() => undefined));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(event.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => undefined);
      return res;
    }).catch(() => caches.match(event.request)),
  );
});
