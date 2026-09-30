import { describe, expect, it } from 'vitest';
import { parseRoute } from '../curriculum/route';
import { routeFor } from './mode';

describe('the playtest entry', () => {
  it('#/piloto opens the playtest in any build', () => {
    expect(routeFor('#/piloto', parseRoute, false)).toEqual({ screen: 'piloto' });
    expect(routeFor('#/piloto/', parseRoute, true)).toEqual({ screen: 'piloto' });
  });

  it('a playtest build opens it at the root; the demo stays reachable by hash', () => {
    for (const h of ['', '#', '#/']) expect(routeFor(h, parseRoute, true)).toEqual({ screen: 'piloto' });
    expect(routeFor('#/', parseRoute, false)).toEqual({ screen: 'home' });
    expect(routeFor('#/demo', parseRoute, true)).toEqual({ screen: 'home' });
    expect(routeFor('#/1ro', parseRoute, true)).toEqual({ screen: 'map' });
    expect(routeFor('#/nivel/2do-1', parseRoute, true)).toEqual({ screen: 'level', id: '2do-1' });
  });
});
