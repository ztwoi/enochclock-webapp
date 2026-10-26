// Enoch service worker. Hand-written, no dependencies. scripts/stage-pwa.mjs copies it to dist/sw.js, replacing the version.
// It never fills a cache itself: the page installs the verified offline pack (src/pwa) into the cache named below.
// With nothing installed every request passes straight to the network, so server mode is untouched.
const VERSION = '__VERSION__', CACHE = 'enoch-pack-' + VERSION;
// The pack this worker serves: its own once that is completely installed (the installer writes STORED last). If the user has not yet
// updated to this build, keep serving the newest complete older pack, whole, so an un-updated device stays consistent and offline-capable.
const STORED = '/installed-manifest.json';
async function servingCache() {
  const own = await caches.open(CACHE);
  if (await own.match(STORED)) return own;
  for (const name of await caches.keys()) {
    if (!name.startsWith('enoch-pack-') || name === CACHE) continue;
    const other = await caches.open(name);
    if (await other.match(STORED)) return other;
  }
  return own;
}
self.addEventListener('install', () => { /* no skipWaiting: a new version takes over on the next full load */ });
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
// The installer asks which cache this worker serves, so it never fills another version's.
self.addEventListener('message', (event) => {
  if (event.data === 'version') event.ports[0]?.postMessage(VERSION);
  // Sent by the page only after this version's pack is fully installed (or when nothing is installed): takes over from the old worker.
  else if (event.data === 'activate') self.skipWaiting();
});
self.addEventListener('fetch', (event) => {
  const req = event.request, url = new URL(req.url);
  // 'no-store' is the installer asking the network itself (an update must not be answered from the old pack).
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || req.cache === 'no-store') return;
  const path = req.mode === 'navigate' && url.pathname === '/' ? '/index.html' : url.pathname;
  event.respondWith((async () => {
    const cache = await servingCache();
    // The query string (?lat&lon&at…) never selects a different file; only the path does.
    return (await cache.match(path)) ?? fetch(req);
  })());
});
