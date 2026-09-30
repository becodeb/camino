import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { serviceWorkerSource } from './src/playtest/serviceWorker';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Dev only: the pilot playtest's /api goes to a local API (node server/index.ts), 8810 by default.
const API = process.env.CAMINO_API ?? 'http://127.0.0.1:8810';

/** A VITE_PLAYTEST=1 build also writes dist/sw.js: the offline shell (src/playtest/serviceWorker.ts), its cache named after this build's files. */
function playtestServiceWorker(): Plugin {
  return {
    name: 'camino-playtest-sw',
    apply: 'build',
    writeBundle(options, bundle) {
      if (process.env.VITE_PLAYTEST !== '1') return;
      const assets = Object.keys(bundle).filter((f) => f.startsWith('assets/')).sort();
      const version = createHash('sha256').update(`${pkg.version}\n${assets.join('\n')}`).digest('hex').slice(0, 12);
      writeFileSync(path.join(options.dir ?? 'dist', 'sw.js'), serviceWorkerSource(version, assets));
    },
  };
}

export default defineConfig({
  plugins: [react(), playtestServiceWorker()],
  base: './',
  define: { __CAMINO_VERSION__: JSON.stringify(pkg.version) },
  server: { host: '0.0.0.0', port: 8797, strictPort: true, proxy: { '/api': { target: API, changeOrigin: true } } },
  preview: { host: '0.0.0.0', port: 8797, strictPort: true },
});
