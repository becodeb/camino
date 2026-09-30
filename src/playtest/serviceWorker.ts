// The playtest build's service worker, so a child's tab that reloads while
// the classroom's internet is down still opens (the event queue in
// localStorage then syncs when the network is back). Only a VITE_PLAYTEST=1
// build emits `sw.js` (vite.config.ts) and registers it (registerServiceWorker).
//
// - Install: precaches the app shell (`./`, index.html) and every hashed file
//   of the build under `assets/` (the one JS bundle, the CSS, the fonts), in a
//   cache named after the build, so an offline reload has everything.
// - Activate: deletes the caches of earlier builds and takes the open pages.
// - Navigations (the shell): network first, so a deploy is seen at once; the
//   cached shell when the network fails or does not answer in NAV_TIMEOUT_MS.
// - `assets/*`: cache first (hashed names never change content).
// - Never touched: `api/*` (the sync must reach the server or fail, so the
//   queue keeps the events), `admin`, anything not GET, other origins.
//
// The worker's code is a plain string (it runs in the browser as it is);
// serviceWorker.test.ts runs it against fake caches and fetch.

/** How long a navigation waits for the network before the cached shell answers. */
export const NAV_TIMEOUT_MS = 4000;

export const CACHE_PREFIX = 'camino-piloto-';

export function serviceWorkerSource(version: string, assets: readonly string[]): string {
  const files = assets.filter((a) => /^assets\/[\w.\-]+$/.test(a));
  return `// Camino pilot playtest: offline shell (generated at build time; src/playtest/serviceWorker.ts).
const CACHE = ${JSON.stringify(CACHE_PREFIX + version)};
const PREFIX = ${JSON.stringify(CACHE_PREFIX)};
const ASSETS = ${JSON.stringify(files)};
const NAV_TIMEOUT_MS = ${NAV_TIMEOUT_MS};
const SCOPE = new URL(self.registration.scope);
const SHELL = new URL('./', SCOPE).href;

/** What the worker does with a request: 'shell' | 'asset' | null (the network, untouched). */
function routeOf(request) {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return null;
  const path = url.pathname.slice(SCOPE.pathname.length);
  if (path === 'api' || path.startsWith('api/') || path === 'admin' || path.startsWith('admin/')) return null;
  if (request.mode === 'navigate') return path === '' || path === 'index.html' ? 'shell' : null;
  if (path.startsWith('assets/')) return 'asset';
  return null;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([new Request(SHELL, { cache: 'reload' }), ...ASSETS.map((a) => new URL(a, SCOPE).href)]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function shell(request) {
  const cache = await caches.open(CACHE);
  const network = fetch(request).then((res) => {
    if (res.ok) cache.put(SHELL, res.clone()).catch(() => {});
    return res;
  });
  const cached = await cache.match(SHELL);
  if (!cached) return network;
  let timer;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve(cached), NAV_TIMEOUT_MS); });
  try {
    return await Promise.race([network, late]);
  } catch {
    return cached;
  } finally {
    clearTimeout(timer);
  }
}

async function asset(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone()).catch(() => {});
  return res;
}

self.addEventListener('fetch', (event) => {
  const route = routeOf(event.request);
  if (route === 'shell') event.respondWith(shell(event.request));
  else if (route === 'asset') event.respondWith(asset(event.request));
});
`;
}
