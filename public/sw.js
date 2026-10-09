const CACHE = "prism-v1.0.2";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon.svg",
  "/mp4-audio.js", "/vendor/mp4box/mp4box.all.mjs",
  "/vendor/mp4box/styp-9TIZZDLN.mjs", "/vendor/mp4box/rolldown-runtime-w6R9maHv.mjs",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png", "/vendor/lame.min.js"];
const ALLOWED = new Set(SHELL);
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL.map(url => new Request(url, { cache:"reload" })));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("prism-") && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const req = event.request, url = new URL(req.url);
  // Le cache conserve uniquement l'application : aucun média ni réponse API.
  if(req.method !== "GET" || url.origin !== self.location.origin || !ALLOWED.has(url.pathname)) return;
  if(req.mode === "navigate"){
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try{
        const response = await fetch(req);
        if(response.ok) await cache.put("/index.html", response.clone());
        return response;
      }catch{
        return (await cache.match("/index.html")) || Response.error();
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(url.pathname)) || fetch(req);
  })());
});
