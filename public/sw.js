const CACHE = "prism-v1";

const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon.svg"
];

const LAME = [
  "/vendor/lame.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.0/lame.min.js"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map(u => cache.add(new Request(u, { cache: "reload" }))));
    await Promise.allSettled(LAME.map(u => cache.add(new Request(u, { mode: "no-cors" }))));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if(req.method !== "GET") return;

  const url = new URL(req.url);
  if(url.pathname.startsWith("/api/")) return;

  if(req.mode === "navigate"){
    event.respondWith((async () => {
      try{
        const res = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put("/index.html", res.clone());
        return res;
      }catch(err){
        return (await caches.match("/index.html")) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if(cached) return cached;
    const res = await fetch(req);
    if(res && (res.ok || res.type === "opaque")){
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone());
    }
    return res;
  })());
});
