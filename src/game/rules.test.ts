import { describe, expect, it } from 'vitest';
import { shortestMoves } from './engine';
import { levelById } from './levels';
import type { Board, Dir } from './model';
import {
  MAX_QUEUE, MOVE_TICKS, SPAWN_Y, chaseSeed, landingY, nextRandom, rtInit, rtPlay, rtStep,
  type RealtimeDef, type Rule, type RtEvent, type RtState,
} from './rules';

const open = (cols: number, rows: number, start = { c: 0, r: rows - 1 }): Board => ({
  cols, rows, start, goal: { c: cols - 1, r: 0 }, goalKind: 'seed', obstacles: [], pickups: [], deco: [], seed: 1,
});
const GOAL: RealtimeDef = { initial: [], solution: [], win: { kind: 'goal' }, maxActions: 2 };
const RAIN: RealtimeDef = { initial: [], solution: [], win: { kind: 'score', n: 3 }, maxActions: 2, spawner: { every: [20, 30], speed: 0.1, seed: 11, first: 1 } };
const keyRule = (d: Dir): Rule => ({ hat: `key:${d}`, actions: [d] });
const TOUCH: Rule = { hat: 'touch:seed', actions: ['score'] };
const kinds = (ev: RtEvent[]) => ev.map((e) => e.t);

/** Plays a list of presses, each followed by enough idle ticks for the step to finish. */
function playPresses(b: Board, def: RealtimeDef, rules: Rule[], presses: Dir[]) {
  let s = rtInit(b, def);
  const events: RtEvent[] = [];
  for (const k of presses) {
    for (let i = 0; i <= MOVE_TICKS; i++) {
      const r = rtStep(b, def, rules, s, i === 0 ? [k] : []);
      s = r.state;
      events.push(...r.events);
    }
  }
  return { state: s, events };
}

describe('rules: keys', () => {
  it('a key rule fires and moves Brote one cell', () => {
    const b = open(4, 3);
    const { state, events } = rtStep(b, GOAL, [keyRule('right')], rtInit(b, GOAL), ['right']);
    expect(kinds(events)).toEqual(['fire', 'move']);
    expect(events[0]).toMatchObject({ rule: 0, hat: 'key:right' });
    expect(state.robot).toMatchObject({ c: 1, r: 2 });
    expect(state.busy).toBe(MOVE_TICKS);
  });

  it('a key without a rule does nothing: Brote shrugs and stays', () => {
    const b = open(4, 3);
    const { state, events } = rtStep(b, GOAL, [keyRule('right')], rtInit(b, GOAL), ['up']);
    expect(events).toEqual([{ t: 'shrug', key: 'up' }]);
    expect(state.robot).toMatchObject({ c: 0, r: 2 });
    // and with no rules at all, every key is a shrug
    expect(kinds(rtStep(b, GOAL, [], rtInit(b, GOAL), ['left', 'right']).events)).toEqual(['shrug', 'shrug']);
  });

  it('the rule decides what the key does, even the "wrong" way round', () => {
    const b = open(4, 3);
    const { state } = rtStep(b, GOAL, [{ hat: 'key:up', actions: ['right'] }], rtInit(b, GOAL), ['up']);
    expect(state.robot).toMatchObject({ c: 1, r: 2 });
  });

  it('keys pressed during a step wait their turn, at most a few', () => {
    const b = open(6, 1, { c: 0, r: 0 });
    let s = rtStep(b, GOAL, [keyRule('right')], rtInit(b, GOAL), ['right']).state;
    s = rtStep(b, GOAL, [keyRule('right')], s, ['right', 'right', 'right', 'right']).state;
    expect(s.queue).toHaveLength(MAX_QUEUE);
    expect(s.robot.c).toBe(1);
    for (let i = 0; i < MOVE_TICKS * 4; i++) s = rtStep(b, GOAL, [keyRule('right')], s).state;
    expect(s.robot.c).toBe(1 + MAX_QUEUE);
  });

  it('an edge or a rock stops Brote where he is (a bump, not a loss)', () => {
    const b: Board = { ...open(3, 1, { c: 0, r: 0 }), obstacles: [{ c: 1, r: 0, kind: 'rock', seed: 1 }] };
    const { state, events } = rtStep(b, GOAL, [keyRule('right')], rtInit(b, GOAL), ['right']);
    const mv = events.find((e) => e.t === 'move') as Extract<RtEvent, { t: 'move' }>;
    expect(mv.step.kind).toBe('crash');
    expect(state.robot.c).toBe(0);
    expect(state.won).toBe(false);
  });

  it('reaching the goal wins, and a won game stands still', () => {
    const b = open(2, 1, { c: 0, r: 0 });
    const { state, events } = rtStep(b, GOAL, [keyRule('right')], rtInit(b, GOAL), ['right']);
    expect(kinds(events)).toContain('win');
    expect(state.won).toBe(true);
    expect(rtStep(b, GOAL, [keyRule('right')], state, ['right']).events).toEqual([]);
  });
});

describe('rules: seeds falling and touching', () => {
  const b = open(5, 4, { c: 2, r: 3 });
  const seedOver = (s: RtState, c: number): RtState => ({ ...s, seeds: [{ id: 99, c, y: 2.2, touched: false }], nextSpawn: Infinity });

  it('the spawner is deterministic: the same seed makes the same rain', () => {
    const spawns = (def: RealtimeDef) => rtPlay(b, def, [], 400).events.filter((e) => e.t === 'spawn').map((e) => JSON.stringify(e));
    const a = spawns(RAIN);
    expect(a.length).toBeGreaterThan(8);
    expect(spawns(RAIN)).toEqual(a);
    expect(spawns({ ...RAIN, spawner: { ...RAIN.spawner!, seed: 12 } })).not.toEqual(a);
  });

  it('seeds appear above the board, never twice in a row in the same column, and fall on their own', () => {
    const { events, state } = rtPlay(b, RAIN, [], 300);
    const cols = events.filter((e) => e.t === 'spawn').map((e) => (e as { c: number }).c);
    cols.forEach((c, i) => { expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThan(b.cols); if (i) expect(c).not.toBe(cols[i - 1]); });
    expect(events.find((e) => e.t === 'spawn')).toMatchObject({ y: SPAWN_Y });
    expect(events.some((e) => e.t === 'lost')).toBe(true);
    expect(state.seeds.every((f) => f.y < landingY(b))).toBe(true);
  });

  it('a touch rule takes the seed and scores exactly once per seed', () => {
    let s = seedOver(rtInit(b, RAIN), 2);
    const all: RtEvent[] = [];
    for (let i = 0; i < 30; i++) { const r = rtStep(b, { ...RAIN, spawner: { ...RAIN.spawner!, first: 1e9 } }, [TOUCH], s); s = r.state; all.push(...r.events); }
    expect(all.filter((e) => e.t === 'collect')).toHaveLength(1);
    expect(all.filter((e) => e.t === 'score')).toEqual([{ t: 'score', score: 1 }]);
    expect(all.find((e) => e.t === 'fire')).toMatchObject({ hat: 'touch:seed' });
    expect(s.seeds).toHaveLength(0);
  });

  it('without a touch rule the seed passes through Brote and is lost', () => {
    let s = seedOver(rtInit(b, RAIN), 2);
    const all: RtEvent[] = [];
    for (let i = 0; i < 30; i++) { const r = rtStep(b, { ...RAIN, spawner: { ...RAIN.spawner!, first: 1e9 } }, [keyRule('left')], s); s = r.state; all.push(...r.events); }
    expect(kinds(all)).toEqual(['pass', 'lost']);
    expect(s.score).toBe(0);
  });

  it('a touch rule without "sumar" takes the seed but scores nothing', () => {
    let s = seedOver(rtInit(b, RAIN), 2);
    for (let i = 0; i < 30; i++) s = rtStep(b, { ...RAIN, spawner: { ...RAIN.spawner!, first: 1e9 } }, [{ hat: 'touch:seed', actions: [] }], s).state;
    expect(s.score).toBe(0);
    expect(s.seeds).toHaveLength(0);
  });

  it('a seed in another column falls past Brote', () => {
    let s = seedOver(rtInit(b, RAIN), 4);
    for (let i = 0; i < 30; i++) s = rtStep(b, { ...RAIN, spawner: { ...RAIN.spawner!, first: 1e9 } }, [TOUCH], s).state;
    expect(s.score).toBe(0);
  });

  it('while Brote steps, both cells count (forgiving hitboxes)', () => {
    let s = seedOver(rtInit(b, RAIN), 3);
    s = { ...s, seeds: [{ id: 5, c: 2, y: 2.3, touched: false }] };
    // he leaves column 2 for column 3 just as the seed reaches him
    const r = rtStep(b, { ...RAIN, spawner: { ...RAIN.spawner!, first: 1e9 } }, [keyRule('right'), TOUCH], s, ['right']);
    expect(kinds(r.events)).toContain('collect');
  });

  it('wins at the score', () => {
    const def = { ...RAIN, win: { kind: 'score' as const, n: 1 } };
    let s = seedOver(rtInit(b, def), 2);
    const all: RtEvent[] = [];
    for (let i = 0; i < 30 && !s.won; i++) { const r = rtStep(b, def, [TOUCH], s); s = r.state; all.push(...r.events); }
    expect(s.won).toBe(true);
    expect(kinds(all).slice(-2)).toEqual(['score', 'win']);
  });

  it('the random generator is a pure function of its state', () => {
    expect(nextRandom(42)).toEqual(nextRandom(42));
    expect(nextRandom(42)[0]).toBeGreaterThanOrEqual(0);
    expect(nextRandom(42)[0]).toBeLessThan(1);
  });
});

describe('3ro pages', () => {
  it('3ro · 1: the reference rules win when the keys walk the shortest way', () => {
    const l = levelById('3ro-1')!;
    const b = l.worlds[0];
    const path = shortestMoves(b)!;
    expect(path).toContain('down');
    const { state } = playPresses(b, l.realtime!, l.realtime!.solution, path);
    expect(state.won).toBe(true);
  });

  it('3ro · 1: with only the intro rule (→), the seed cannot be reached; an ↑ press is a shrug', () => {
    const l = levelById('3ro-1')!;
    const b = l.worlds[0];
    const rules = [l.realtime!.intro!];
    const { state, events } = playPresses(b, l.realtime!, rules, [...shortestMoves(b)!, 'up', 'right', 'right', 'right', 'right', 'right']);
    expect(state.won).toBe(false);
    expect(events).toContainEqual({ t: 'shrug', key: 'up' });
    // → and ↑ are not enough either: the way round needs ↓
    const two = [{ hat: 'key:right', actions: ['right'] }, { hat: 'key:up', actions: ['up'] }] as Rule[];
    expect(playPresses(b, l.realtime!, two, shortestMoves(b)!).state.won).toBe(false);
  });

  it('3ro · 2: chasing seeds with the reference rules wins, calmly', () => {
    const l = levelById('3ro-2')!;
    const b = l.worlds[0];
    const { state, events } = rtPlay(b, l.realtime!, l.realtime!.solution, 3000, (s) => { const d = chaseSeed(s); return d && s.busy === 0 && !s.queue.length ? [d] : []; });
    expect(state.won).toBe(true);
    expect(state.score).toBe(5);
    // calm: never more than three seeds in the air
    let air = 0, most = 0;
    for (const e of events) { if (e.t === 'spawn') air++; if (e.t === 'collect' || e.t === 'lost') air--; most = Math.max(most, air); }
    expect(most).toBeLessThanOrEqual(3);
    // and it takes a while: at least 5 seeds' worth of falling
    expect(state.tick).toBeGreaterThan(5 * l.realtime!.spawner!.every[0]);
  });

  it('3ro · 2: without a touch rule nobody can win, whatever keys are pressed', () => {
    const l = levelById('3ro-2')!;
    const b = l.worlds[0];
    const without = l.realtime!.solution.filter((r) => r.hat !== 'touch:seed');
    const chase = rtPlay(b, l.realtime!, without, 3000, (s) => { const d = chaseSeed(s); return d && s.busy === 0 ? [d] : []; });
    expect(chase.state.won).toBe(false);
    expect(chase.state.score).toBe(0);
    expect(chase.events.some((e) => e.t === 'pass')).toBe(true);
    // random mashing, many seeds of the generator: still no point
    for (let seed = 1; seed <= 20; seed++) {
      let r = seed;
      const mash = rtPlay(b, l.realtime!, without, 1500, () => { const [x, n] = nextRandom(r); r = n; return x < 0.3 ? [x < 0.15 ? 'left' : 'right'] : []; });
      expect(mash.state.score).toBe(0);
    }
    // the page starts without it: the new rule is the lesson
    expect(l.realtime!.initial.some((x) => x.hat === 'touch:seed')).toBe(false);
  });

  it('3ro palettes hold exactly the hats and actions their rules use', () => {
    for (const id of ['3ro-1', '3ro-2']) {
      const l = levelById(id)!;
      for (const r of [...l.realtime!.solution, ...l.realtime!.initial]) {
        expect(l.blocks).toContain(r.hat);
        for (const a of r.actions) expect(l.blocks).toContain(a);
        expect(r.actions.length).toBeLessThanOrEqual(l.realtime!.maxActions);
      }
    }
  });
});
