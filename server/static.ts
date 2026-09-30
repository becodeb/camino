// Serves the built front end from dist/, mirroring docker/nginx.conf's
// rules for the existing demo: index.html is never cached (a deploy must be
// noticed immediately), everything under /assets/ is content-hashed by Vite
// and cached for a year, the playtest's /sw.js is never cached either, and an unknown path is a genuine 404 — routes live
// in the URL hash, not in the path, so there is no SPA fallback.

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Context } from 'hono';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

export function serveDist(distDir: string) {
  return async (c: Context): Promise<Response> => {
    const url = new URL(c.req.url);
    let reqPath = decodeURIComponent(url.pathname);
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

    // Prevent escaping distDir via '..' segments.
    const normalized = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(distDir, normalized);
    if (!filePath.startsWith(distDir)) return c.notFound();

    let buf: Buffer;
    try {
      const st = await stat(filePath);
      if (st.isDirectory()) return c.notFound();
      buf = await readFile(filePath);
    } catch {
      return c.notFound();
    }

    const ext = path.extname(filePath);
    const headers = new Headers();
    headers.set('content-type', MIME[ext] ?? 'application/octet-stream');
    if (path.basename(filePath) === 'index.html' || normalized === '/sw.js') {
      // the playtest's service worker must be re-checked on every load too, or a deploy's new one is missed
      headers.set('cache-control', 'no-cache');
    } else if (normalized.startsWith('/assets/')) {
      headers.set('cache-control', 'public, max-age=31536000, immutable');
    } else {
      headers.set('cache-control', 'public, max-age=3600');
    }
    return new Response(new Uint8Array(buf), { headers });
  };
}
