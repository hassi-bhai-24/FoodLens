// App-shell service worker. Caches the shell only; chat data lives in
// IndexedDB and AI/barcode calls always go to the network.
// Bump the CACHE name whenever this file's caching behaviour changes:
// the activate handler deletes every cache whose name is not CACHE, so
// a stale name is the only thing that ever purges old entries. The
// previous name (foodlens-shell-v1) never changed, so old shell entries
// were never purged. Fetch is network-first, so a stale shell is only
// served when the network fails — but a failed fetch must not silently
// serve an old build forever, which is what an unpurged cache did.
// v4 (preview v9): bumped again so every phone that ever cached an
// older shell (v1/v3) drops it and picks up the v9 app code — a stale
// cached shell was one suspect in the hang-then-fail report.
// v5 (preview v10): bumped again so the new Hugging Face provider
// option in Settings reaches every phone on the next load.
const CACHE = "foodlens-shell-v5";
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
