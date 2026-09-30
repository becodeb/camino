import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Dev only: the pilot playtest's /api goes to a local API (node server/index.ts), 8810 by default.
const API = process.env.CAMINO_API ?? 'http://127.0.0.1:8810';

export default defineConfig({
  plugins: [react()],
  base: './',
  define: { __CAMINO_VERSION__: JSON.stringify(pkg.version) },
  server: { host: '0.0.0.0', port: 8797, strictPort: true, proxy: { '/api': { target: API, changeOrigin: true } } },
  preview: { host: '0.0.0.0', port: 8797, strictPort: true },
});
