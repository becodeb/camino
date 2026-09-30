import { describe, expect, it } from 'vitest';
import { CACHE_PREFIX, NAV_TIMEOUT_MS, serviceWorkerSource } from './serviceWorker';

type Handler = (event: { request?: FakeRequest; waitUntil(p: Promise<unknown>): void; respondWith(p: Promise<Response>): void }) => void;
interface FakeRequest { url: string; method: string; mode: string }

const ORIGIN = 'https://camino-prueba.example';
const ASSETS = ['assets/index-abc.js', 'assets/index-def.css', 'assets/andika-400-latin-x1.woff2'];

/** Runs the generated worker against fake caches and a fake network. */
function boot(opts: { version?: string; oldCaches?: string[] } = {}) {
  const stores = new Map<string, Map<string, Response>>();
  for (const k of opts.oldCaches ?? []) stores.set(k, new Map());
  const key = (r: string | FakeRequest | Request) => (typeof r === 'string' ? r : r.url);
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name)!;
      return {
        async match(r: string | FakeRequest) { return m.get(key(r))?.clone(); },
        async put(r: string | FakeRequest, res: Response) { m.set(key(r), res); },
        async addAll(list: (string | Request)[]) {
          for (const r of list) { const res = await net.fetch(key(r)); if (!res.ok) throw new Error('addAll'); m.set(key(r), res); }
        },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name: string) { return stores.delete(name); },
  };
  const net = {
    down: false,
    hang: false,
    body: 'shell v1',
    calls: [] as string[],
    async fetch(r: string | FakeRequest): Promise<Response> {
      net.calls.push(key(r));
      if (net.hang) return new Promise(() => {});
      if (net.down) throw new TypeError('Failed to fetch');
      const path = new URL(key(r)).pathname;
      if (path === '/' || path === '/index.html') return new Response(net.body, { status: 200 });
      if (path.startsWith('/assets/')) return new Response(`file ${path}`, { status: 200 });
      return new Response('nope', { status: 404 });
    },
  };
  const handlers: Record<string, Handler> = {};
  let claimed = false;
  const self = {
    registration: { scope: `${ORIGIN}/` },
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type: string, fn: Handler) => { handlers[type] = fn; },
    skipWaiting: async () => {},
    clients: { claim: async () => { claimed = true; } },
  };
  new Function('self', 'caches', 'fetch', serviceWorkerSource(opts.version ?? 'v1', ASSETS))(self, caches, (r: string | FakeRequest) => net.fetch(r));

  const lifecycle = async (type: 'install' | 'activate') => {
    let p: Promise<unknown> = Promise.resolve();
    handlers[type]({ waitUntil: (x) => { p = x; }, respondWith: () => {} });
    await p;
  };
  /** The worker's answer, or null when it leaves the request to the network. */
  const request = async (path: string, init: Partial<FakeRequest> = {}): Promise<Response | null> => {
    let answer: Promise<Response> | null = null;
    handlers.fetch({ request: { url: `${ORIGIN}${path}`, method: 'GET', mode: 'cors', ...init }, waitUntil: () => {}, respondWith: (x) => { answer = x; } });
    return answer;
  };
  return { stores, net, lifecycle, request, claimed: () => claimed };
}

describe('the playtest service worker', () => {
  it('precaches the shell and the build\'s assets under a versioned cache', async () => {
    const w = boot({ version: 'b42' });
    await w.lifecycle('install');
    const cache = w.stores.get(`${CACHE_PREFIX}b42`)!;
    expect([...cache.keys()].sort()).toEqual([`${ORIGIN}/`, ...ASSETS.map((a) => `${ORIGIN}/${a}`)].sort());
  });

  it('only lists hashed files under assets/', () => {
    const src = serviceWorkerSource('v', ['assets/a-1.js', 'index.html', 'sw.js', '../x', 'assets/sub/../../etc']);
    expect(src).toContain('["assets/a-1.js"]');
  });

  it('deletes older builds\' caches on activate and takes the open pages', async () => {
    const w = boot({ version: 'new', oldCaches: [`${CACHE_PREFIX}old`, 'somebody-else'] });
    await w.lifecycle('install');
    await w.lifecycle('activate');
    expect([...w.stores.keys()].sort()).toEqual([`${CACHE_PREFIX}new`, 'somebody-else']);
    expect(w.claimed()).toBe(true);
  });

  it('navigations go to the network first and refresh the cached shell', async () => {
    const w = boot();
    await w.lifecycle('install');
    w.net.body = 'shell v2';
    const res = await w.request('/?debug', { mode: 'navigate' });
    expect(await res!.text()).toBe('shell v2');
    await new Promise((r) => setTimeout(r, 0));
    expect(await w.stores.get(`${CACHE_PREFIX}v1`)!.get(`${ORIGIN}/`)!.clone().text()).toBe('shell v2');
  });

  it('an offline reload gets the cached shell', async () => {
    const w = boot();
    await w.lifecycle('install');
    w.net.down = true;
    const res = await w.request('/', { mode: 'navigate' });
    expect(await res!.text()).toBe('shell v1');
  });

  it('a network that does not answer gives way to the cached shell', async () => {
    const w = boot();
    await w.lifecycle('install');
    w.net.hang = true;
    const t0 = Date.now();
    const res = await w.request('/', { mode: 'navigate' });
    expect(await res!.text()).toBe('shell v1');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(NAV_TIMEOUT_MS - 50);
  }, NAV_TIMEOUT_MS + 3000);

  it('assets come from the cache without the network', async () => {
    const w = boot();
    await w.lifecycle('install');
    w.net.down = true;
    w.net.calls = [];
    const res = await w.request('/assets/index-abc.js', { mode: 'no-cors' });
    expect(await res!.text()).toBe('file /assets/index-abc.js');
    expect(w.net.calls).toEqual([]);
  });

  it('never touches the API, the admin page, other paths, writes or other origins', async () => {
    const w = boot();
    await w.lifecycle('install');
    expect(await w.request('/api/sync', { method: 'POST' })).toBeNull();
    expect(await w.request('/api/export?format=csv')).toBeNull();
    expect(await w.request('/api/health')).toBeNull();
    expect(await w.request('/admin', { mode: 'navigate' })).toBeNull();
    expect(await w.request('/other', { mode: 'navigate' })).toBeNull();
    expect(await w.request('/sw.js')).toBeNull();
    expect(await w.request('/assets/index-abc.js', { method: 'HEAD' })).toBeNull();
    expect(await w.request('/assets/index-abc.js', { url: 'https://elsewhere.example/assets/index-abc.js' })).toBeNull();
  });
});
