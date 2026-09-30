// Which app a build is: the pilot playtest deploy is built with
// VITE_PLAYTEST=1 (Dockerfile.prueba); there the empty hash opens the
// playtest instead of the demo's home (still at #/demo), and the dev drawer
// stays hidden unless ?debug. In a normal build #/piloto opens the playtest.

import type { Route } from '../curriculum/route';

export const PLAYTEST_BUILD = import.meta.env.VITE_PLAYTEST === '1';

/** The route of a hash, with a playtest build's root going to the playtest. */
export function routeFor(hash: string, parse: (h: string) => Route, playtest = PLAYTEST_BUILD): Route {
  if (playtest && /^#?\/?$/.test(hash)) return { screen: 'piloto' };
  return parse(hash);
}
