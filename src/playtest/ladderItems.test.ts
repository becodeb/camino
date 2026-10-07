import { describe, expect, it } from 'vitest';
import { shortestMoves, shortestPlan, simulate, simulateAll, solvesAll } from '../game/engine';
import { formatOf } from '../game/formats';
import { isWin, type Board, type Dir, type Program } from '../game/model';
import { MOVE_TICKS, chaseSeed, rtInit, rtPlay, rtStep, type RealtimeDef, type RtEvent, type Rule } from '../game/rules';
import { withName } from './characterName';
import { LADDER } from './ladder';
import { LADDER_ITEMS, ladderItem } from './ladderItems';
import { pilotLevel } from './levels';

const ARROWS: Dir[] = ['left', 'up', 'down', 'right'];
const at = (n: number) => LADDER_ITEMS[n - 1];

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

describe('the round-2 item bank', () => {
  it('is the ladder: rung n plays pp-l<n>, and pilotLevel opens each', () => {
    expect(LADDER_ITEMS).toHaveLength(12);
    LADDER_ITEMS.forEach((l, i) => {
      expect(l.id).toBe(`pp-l${i + 1}`);
      expect(l.page).toBe(i + 1);
      expect(LADDER[i].item).toBe(l.id);
      expect(pilotLevel(l.id)).toBe(l);
      expect(ladderItem(l.id)).toBe(l);
    });
  });

  it('every program page is solved by its own solution on the real engine', () => {
    for (const l of LADDER_ITEMS.filter((x) => x.mode === 'program')) {
      if (formatOf(l) === 'predict') continue;
      expect(solvesAll(l.worlds, l.solution), l.id).toBe(true);
    }
  });

  it('the flat pages have exactly as many lines as their shortest plan', () => {
    for (const n of [1, 2]) {
      const l = at(n);
      const plan = shortestPlan(l.worlds[0], ARROWS)!;
      expect(plan.length, l.id).toBe(l.slots);
    }
    expect(at(2).worlds[0].pickups).toHaveLength(2);
    // a long sequence with a turn
    expect(new Set(shortestPlan(at(2).worlds[0], ARROWS)).size).toBeGreaterThanOrEqual(2);
    expect(at(2).slots).toBeGreaterThanOrEqual(8);
  });

  it('3 · the fix page: the given program bumps, and one changed line wins', () => {
    const l = at(3);
    expect(formatOf(l)).toBe('fix');
    expect(simulate(l.worlds[0], l.given!).outcome).toBe('crash');
    const diff = l.given!.filter((it, i) => JSON.stringify(it) !== JSON.stringify(l.solution[i]));
    expect(diff).toHaveLength(1);
    expect(l.given).toHaveLength(l.solution.length);
  });

  it('4 · the predict page: no goal, the program runs without a bump and ends after two turns', () => {
    const l = at(4);
    expect(formatOf(l)).toBe('predict');
    expect(l.worlds[0].goalKind).toBe('none');
    expect(l.given).toEqual(l.solution);
    const t = simulate(l.worlds[0], l.given!);
    expect(t.outcome).not.toBe('crash');
    expect(t.final).toMatchObject({ c: 2, r: 2 });
  });

  it('5–8 · the repeat pages need the repeat: no flat plan fits their lines', () => {
    for (const n of [5, 6, 7, 8]) {
      const l = at(n);
      const plan = shortestPlan(l.worlds[0], ARROWS)!;
      expect(plan.length, l.id).toBeGreaterThan(l.slots!);
      expect(l.solution.some((it) => it.t === 'loop'), l.id).toBe(true);
    }
    // T20: 5, 7, 8 all get the repeat concept demo (7/8 reuse 5's style)
    for (const n of [5, 7, 8]) expect(at(n).intro, at(n).id).toBeTruthy();
  });

  it('T20 (silent classroom round): every 1ro/2do format has a way to show it wordless', () => {
    expect(at(1).silentDemo).toBe('path');
    expect(at(2).silentDemo).toBe('path');
    expect(at(3).silentDemo).toBe('fix');
    expect(at(4).silentDemo).toBe('predict');
    expect(at(5).intro).toBeTruthy();
    expect(at(6).silentDemo).toBeUndefined(); // already pulses via CSS (.blk-count.is-calling)
    expect(at(7).intro).toBeTruthy();
    expect(at(8).intro).toBeTruthy();
    expect(at(9).intro).toBeTruthy(); // fog: already has one
    expect(at(10).silentDemo).toBe('worlds');
    expect(at(11).realtime?.intro).toBeTruthy(); // rule games: already auto-play once
    expect(at(12).realtime?.intro).toBeTruthy();
  });

  it('6 · the count is what is missing, nothing to bring', () => {
    const l = at(6);
    expect(formatOf(l)).toBe('complete');
    expect(l.blocks).toEqual([]);
    expect(l.given![0]).toMatchObject({ t: 'loop', count: 0 });
    expect(simulate(l.worlds[0], l.given!).outcome).not.toBe('win');
  });

  it('7 · a staircase whose pattern starts with ↑ (↑→)', () => {
    expect(at(7).solution).toEqual([{ t: 'loop', count: 4, body: ['up', 'right'] }]);
  });

  it('8 · a block before the repeat and one after it; the repeat alone does not reach', () => {
    const l = at(8);
    const loopAt = l.solution.findIndex((it) => it.t === 'loop');
    expect(loopAt).toBeGreaterThan(0);
    expect(loopAt).toBeLessThan(l.solution.length - 1);
    const onlyLoop: Program = [l.solution[loopAt]];
    expect(simulate(l.worlds[0], onlyLoop).outcome).not.toBe('win');
    // a different staircase from rung 7's: down, not up
    expect(JSON.stringify(l.solution)).toContain('down');
    expect(JSON.stringify(at(7).solution)).not.toContain('down');
  });

  it('9 · fog and "si hay piedra"; 10 · three short worlds; both won by either body order where the rocks allow', () => {
    expect(at(9).fog).toBe(true);
    expect(at(9).intro).toBeTruthy();
    expect(at(10).worlds).toHaveLength(3);
    for (const w of at(10).worlds) expect(w.cols).toBeLessThanOrEqual(6);
    // one world has a rock right at the start: "walk, then look" bumps there
    const walkFirst: Program = [{ t: 'loop', count: 'goal', body: ['right', 'ifrock:right'] }];
    expect(solvesAll(at(10).worlds, walkFirst)).toBe(false);
    expect(simulateAll(at(10).worlds, walkFirst).some((t) => t.outcome === 'crash')).toBe(true);
    expect(solvesAll(at(9).worlds, walkFirst)).toBe(true);
    // a plain walk bumps the first rock in each
    const walk: Program = [{ t: 'loop', count: 'goal', body: ['right'] }];
    expect(solvesAll(at(9).worlds, walk)).toBe(false);
  });

  it('11 · the game: the intro\'s → alone does not reach the seed, → and ↑ do', () => {
    const l = at(11);
    const def = l.realtime!;
    const b = l.worlds[0];
    expect(l.mode).toBe('realtime');
    expect(def.initial).toEqual([]);
    expect(def.intro).toEqual({ hat: 'key:right', actions: ['right'] });
    expect(def.afterIntro).toMatch(/flechas del teclado o de la pantalla/);
    const way = shortestMoves(b)!;
    expect(way.every((d) => d === 'up' || d === 'right')).toBe(true);
    expect(playPresses(b, def, def.solution, way).state.won).toBe(true);
    const alone = playPresses(b, def, [def.intro!], [...way, 'right', 'right', 'right', 'right']);
    expect(alone.state.won).toBe(false);
    expect(alone.events).toContainEqual({ t: 'shrug', key: 'up' });
    // the on-screen keys are the palette's hats: ↑ and →
    expect(l.blocks.filter((x) => x.startsWith('key:'))).toEqual(['key:up', 'key:right']);
  });

  it('12 · the game with points: chasing with the reference rules wins at four; without the touch rule, never', () => {
    const l = at(12);
    const def = l.realtime!;
    const b = l.worlds[0];
    expect(def.win).toEqual({ kind: 'score', n: 4 });
    expect(def.initial.some((r) => r.hat === 'touch:seed')).toBe(false);
    expect(def.initial.some((r) => r.hat === def.intro!.hat)).toBe(true);
    const chase = (rules: Rule[]) => rtPlay(b, def, rules, 3000, (s) => { const d = chaseSeed(s); return d && s.busy === 0 && !s.queue.length ? [d] : []; });
    const won = chase(def.solution);
    expect(won.state.won).toBe(true);
    expect(won.state.score).toBe(4);
    // shorter than 3ro-2: under a minute of falling
    expect(won.state.tick * 100).toBeLessThan(60_000);
    expect(chase(def.initial).state.score).toBe(0);
  });
});

describe('variety: every item differs from its neighbours', () => {
  const size = (l: (typeof LADDER_ITEMS)[number]) => l.worlds.map((w) => `${w.cols}x${w.rows}`).join('+');
  const things = (l: (typeof LADDER_ITEMS)[number]) => {
    const w = l.worlds[0];
    const kinds = [...new Set(l.worlds.flatMap((x) => x.obstacles.map((o) => o.kind)))].sort().join(',');
    return `${w.look ?? 'forest'}|${kinds}|seeds:${w.pickups.length}|fog:${!!l.fog}|${l.mode}|${formatOf(l)}`;
  };
  const goal = (l: (typeof LADDER_ITEMS)[number]) => l.worlds.map((w) => (w.goalKind === 'none' ? 'none' : `${w.goal.c},${w.goal.r}`)).join('+');

  it('no two consecutive items share board size, what is on the board, or the goal cell', () => {
    for (let i = 1; i < LADDER_ITEMS.length; i++) {
      const a = LADDER_ITEMS[i - 1], b = LADDER_ITEMS[i];
      expect(size(a), `${a.id} / ${b.id} size`).not.toBe(size(b));
      expect(things(a), `${a.id} / ${b.id} board`).not.toBe(things(b));
      expect(goal(a), `${a.id} / ${b.id} goal`).not.toBe(goal(b));
    }
  });

  it('no two consecutive items have the same solution', () => {
    for (let i = 1; i < LADDER_ITEMS.length; i++) {
      const a = LADDER_ITEMS[i - 1], b = LADDER_ITEMS[i];
      if (a.mode === 'realtime' || b.mode === 'realtime') continue;
      // 9 → 10 share their program on purpose (one program, now in three worlds)
      if (a.id === 'pp-l9') continue;
      expect(JSON.stringify(a.solution), `${a.id} / ${b.id}`).not.toBe(JSON.stringify(b.solution));
    }
  });

  it('every board is a real board: start and goal inside, the start free, the start is not a win', () => {
    for (const l of LADDER_ITEMS) for (const w of l.worlds) {
      expect(w.start.c >= 0 && w.start.c < w.cols && w.start.r >= 0 && w.start.r < w.rows, l.id).toBe(true);
      expect(w.obstacles.some((o) => o.c === w.start.c && o.r === w.start.r), l.id).toBe(false);
      if (w.goalKind !== 'none') expect(isWin(w, { ...w.start, mask: 0 }), l.id).toBe(false);
    }
  });

  it('titles and lines are kid-safe: no ids, no grades, the character\'s name put in', () => {
    for (const l of LADDER_ITEMS) {
      for (const text of [l.title, l.say, l.realtime?.afterIntro ?? '', l.realtime?.noRule ?? '']) {
        expect(text, l.id).not.toMatch(/pp-|\d(ro|do)\b|rung|nivel|ladder/i);
      }
      expect(withName(l.title, 'mina')).not.toMatch(/Brote/);
      expect(l.say.length, l.id).toBeLessThanOrEqual(130);
    }
  });
});
