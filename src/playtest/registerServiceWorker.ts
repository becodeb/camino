// Registers the playtest build's service worker (serviceWorker.ts): only in a
// VITE_PLAYTEST=1 build, only where the browser has one (a secure context:
// https, or localhost). A failure changes nothing: the app works online.

import { PLAYTEST_BUILD } from './mode';

export function registerServiceWorker(): void {
  if (!PLAYTEST_BUILD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const go = () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* no offline reload; everything else works */ }); };
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}
