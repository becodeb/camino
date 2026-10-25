// T43: 1ro's own route (character → the guided monster games → the arcade),
// and that every other grade's route is untouched by it.
import { describe, expect, it } from 'vitest';
import { BUDGET_1RO_MS, ROUTE, ROUTE_1RO, ROUTE_4TO, classicRouteFromUrl, freePlayEndless, initialFlow, is1ro, reduce, routeOf, wrapPending, wrapTarget, type FlowAction, type FlowState } from './flow';
import { menuFor } from './freePlay';

const start = (grade: number, nameOn = false) => reduce(initialFlow(0), { type: 'next', grade, nameOn }, 1000).state;
const to = (s: FlowState, a: FlowAction, t = 5000) => reduce(s, a, t);
const next = (s: FlowState, t = 5000) => to(s, { type: 'next' }, t);

describe('T43: 1ro\'s route', () => {
  it('only grade 1 gets it; 2do, 3ro and 5to keep the default route and 4to its own', () => {
    expect(start(1).route).toBe('1ro');
    expect(is1ro(start(1))).toBe(true);
    expect(routeOf(start(1))).toBe(ROUTE_1RO);
    for (const g of [2, 3, 5]) {
      expect(start(g).route).toBeUndefined();
      expect(routeOf(start(g))).toBe(ROUTE);
    }
    expect(routeOf(start(4))).toBe(ROUTE_4TO);
  });

  it('character → the guided games → the arcade (the green flag), never the tool check, the ladder or the typing step', () => {
    let s = start(1);
    expect(s.step).toBe('character');
    s = next(s).state;
    expect(s.step).toBe('games');
    const t = next(s, 9000);
    expect(t.state.step).toBe('free_play');
    expect(t.routeDoneNow).toBe(true);
    expect(t.state.routeDone).toBe(true);
    expect(t.change).toMatchObject({ from: 'games', to: 'free_play', reason: 'next', budget_ms: BUDGET_1RO_MS.games });
    // the arcade has no end
    expect(next(t.state).state).toBe(t.state);
    expect(freePlayEndless(t.state)).toBe(true);
    // the visits never touched the old route's steps
    expect(t.state.visits.map((v) => v.step)).toEqual(['setup', 'character', 'games', 'free_play']);
  });

  it('with the name screen on, the name comes first', () => {
    const s = start(1, true);
    expect(s.step).toBe('name');
    expect(next(s).state.step).toBe('character');
  });

  it('the arcade\'s wardrobe card goes to the wardrobe and back; 2do never moves that way', () => {
    const arcade = next(next(start(1)).state).state;
    const w = to(arcade, { type: 'arcade', to: 'wardrobe' }).state;
    expect(w.step).toBe('wardrobe');
    expect(next(w).state.step).toBe('free_play');
    expect(to(w, { type: 'arcade', to: 'free_play' }).state.step).toBe('free_play');
    // no Workshop in 1ro
    expect(to(arcade, { type: 'arcade', to: 'workshop' }).state).toBe(arcade);
    const second = start(2);
    expect(to(second, { type: 'arcade', to: 'wardrobe' }).state).toBe(second);
  });

  it('the adult corner menu opens the ladder from the arcade and comes back; only for 1ro', () => {
    const arcade = next(next(start(1)).state).state;
    const l = to(arcade, { type: 'adult_goto', to: 'ladder' });
    expect(l.state.step).toBe('ladder');
    expect(l.change?.reason).toBe('adult');
    // the ladder ending by itself goes back to the arcade
    expect(next(l.state).state.step).toBe('free_play');
    expect(to(l.state, { type: 'adult_goto', to: 'free_play' }).state.step).toBe('free_play');
    const third = next(next(start(3)).state).state;
    expect(to(third, { type: 'adult_goto', to: 'ladder' }).state).toBe(third);
  });

  it('"Juegos para todos" moves a child in the guided pass to the arcade; a child already there does not move', () => {
    const games = next(start(1)).state;
    const t = to(games, { type: 'games_all' });
    expect(t.state.step).toBe('free_play');
    expect(t.change?.reason).toBe('games_all');
    expect(t.state.routeDone).toBeUndefined();
    expect(freePlayEndless(t.state)).toBe(true);
    expect(to(t.state, { type: 'games_all' }).state).toBe(t.state);
    expect(to(start(1), { type: 'games_all' }).state.step).toBe('character');
  });

  it('"quedan 5 minutos": the guided pass ends for the survey, then the arcade', () => {
    let s = to(next(start(1)).state, { type: 'wrap_up', on: true }).state;
    expect(wrapPending(s)).toBe(true);
    expect(wrapTarget(s)).toBe('survey');
    const t = next(s);
    expect(t.state.step).toBe('survey');
    expect(t.routeDoneNow).toBe(true);
    s = next(t.state).state;
    expect(s.step).toBe('free_play');
    expect(s.surveyDone).toBe(true);
    expect(wrapPending(s)).toBe(false);
  });
});

describe('T43: `?ruta=clasica` keeps 1ro on the default route', () => {
  it('reads the link', () => {
    expect(classicRouteFromUrl('?grado=1&ruta=clasica')).toBe(true);
    expect(classicRouteFromUrl('?ruta=clasica&grado=1')).toBe(true);
    expect(classicRouteFromUrl('?grado=1')).toBe(false);
    expect(classicRouteFromUrl('?ruta=clasicas')).toBe(false);
  });

  it('a classic 1ro session has no route of its own (the tool check comes after the character); 4to ignores it', () => {
    const s = reduce(initialFlow(0), { type: 'next', grade: 1, classic: true }, 1000).state;
    expect(s.route).toBeUndefined();
    expect(next(s).state.step).toBe('tool_check');
    expect(reduce(initialFlow(0), { type: 'next', grade: 4, classic: true, nameOn: true }, 1000).state.route).toBe('4to');
  });

  it('its menu is the 2026-10-20 one', () => {
    expect(menuFor(1, () => false, false, true).map((a) => a.id)).toEqual(['race', 'typing_race', 'sheet', 'recess', 'guardas', 'editor']);
    expect(menuFor(1, () => false, true, true).map((a) => a.id)).not.toContain('recess');
    expect(menuFor(2, () => false, false, true).map((a) => a.id)).toEqual(menuFor(2, () => false).map((a) => a.id));
  });
});
