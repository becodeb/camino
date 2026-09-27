import { describe, expect, it } from 'vitest';
import { shortestMoves, shortestPlan, simulate, solves } from '../game/engine';
import { differences, formatOf } from '../game/formats';
import { COUNT_MAX, COUNT_MIN } from '../game/hint';
import { HOLE, cardCount, cmdProgram, inside, isHole, obstacleAt, sameCell, type Board, type Program, type ProgramItem } from '../game/model';
import { DOORS, doorParams, paramsAt, type DoorExtras, type ExtraParams, type SequenceParams, type Sheet } from './model';
import { PRIMER } from './primer';
import { difficultyOf, extraFor, extraRun, generate, hashSeed, keyOfLevel, patterns, type Extra } from './generate';

/**
 * Test-only sheets with no levels of their own, so every family and variant is
 * checked here whether or not a sheet of the year uses it yet (forest and river).
 */
const lab = (n: number, zone: Sheet['zone'], easy: DoorExtras, medium: DoorExtras, hard: DoorExtras): Sheet =>
  ({ ...PRIMER[0], n, zone, title: `lab ${n}`, core: [], boss: undefined, extras: { easy, medium, hard } });
const seq = (cols: number, rows: number, steps: [number, number], pickups: number, rocks: number): SequenceParams => ({ family: 'sequence', cols, rows, steps, pickups, rocks });
const LAB: Sheet[] = [
  lab(101, 'bosque',
    { family: 'predict', cols: 4, rows: 3, steps: [3, 4], rocks: 1 },
    { family: 'predict', cols: 5, rows: 4, steps: [5, 6], rocks: 2 },
    { family: 'predict', cols: 6, rows: 4, steps: [6, 9], rocks: 3, loop: { body: 2, count: [3, 4] } }),
  lab(102, 'bosque',
    { family: 'fix', base: seq(4, 3, [3, 4], 0, 1), bugs: ['arrow'] },
    { family: 'fix', base: { family: 'repeat', body: 2, count: [3, 4], pickups: 0 }, bugs: ['count', 'arrow'] },
    { family: 'fix', base: { family: 'repeat', body: 3, count: [3, 3], pickups: 1 }, bugs: ['extra'] }),
  lab(103, 'rio',
    { family: 'complete', base: { family: 'repeat', body: 1, count: [3, 5], pickups: 0, post: [1, 1] }, holes: ['count'] },
    { family: 'complete', base: { family: 'repeat', body: 2, count: [2, 3], pickups: 0, post: [1, 1] }, holes: ['count', 'card'] },
    { family: 'complete', base: { family: 'repeat', body: 2, count: [3, 4], pickups: 0, pre: [1, 1], post: [1, 1] }, holes: ['card'] }),
  lab(104, 'rio',
    { family: 'repeat', body: 1, count: [4, 6], pickups: 0, save: true },
    { family: 'repeat', body: 2, count: [3, 4], pickups: 0, pre: [1, 1], post: [1, 1] },
    [{ family: 'repeat', body: 2, count: [3, 4], pickups: 1, pre: [1, 2], post: [1, 2] }, { family: 'fix', base: { family: 'repeat', body: 2, count: [3, 4], pickups: 1 }, bugs: ['extra', 'count'] }]),
];
const WITH_EXTRAS = [...PRIMER.filter((s) => s.extras), ...LAB];
const RUN = 8;

/** Every flat list of `alphabet` with 1..max arrows. */
function* sequences(alphabet: readonly string[], max: number): Generator<string[]> {
  let layer: string[][] = [[]];
  for (let n = 1; n <= max; n++) {
    layer = layer.flatMap((s) => alphabet.map((a) => [...s, a]));
    yield* layer;
  }
}

/** Every program of at most `cards` cards: arrows, and repeats one level deep. */
function* programs(arrows: readonly string[], cards: number): Generator<Program> {
  const items: { it: ProgramItem; cards: number }[] = arrows.map((cmd) => ({ it: { t: 'cmd', cmd }, cards: 1 }));
  for (const body of sequences(arrows, cards)) for (let n = COUNT_MIN; n <= COUNT_MAX; n++) items.push({ it: { t: 'loop', count: n, body }, cards: body.length });
  const grow = function* (acc: Program, room: number): Generator<Program> {
    if (acc.length) yield acc;
    for (const { it, cards: k } of items) if (k <= room) yield* grow([...acc, it], room - k);
  };
  yield* grow([], cards);
}

const moves = (p: Program) => p.flatMap((it) => (it.t === 'cmd' ? [it.cmd] : Array.from({ length: it.count as number }, () => it.body).flat())).filter((c) => !isHole(c));
const walkCells = (b: Board, p: Program) => [b.start, ...simulate(b, p).steps.flatMap((s) => s.cells)];

describe('the search', () => {
  it('finds the shortest plan through the seeds and into the pot', () => {
    const b = { cols: 4, rows: 2, start: { c: 0, r: 0 }, goal: { c: 3, r: 0 }, goalKind: 'pot' as const, obstacles: [], pickups: [{ c: 1, r: 1 }], deco: [], seed: 1 };
    const plan = shortestPlan(b, ['left', 'up', 'down', 'right'])!;
    expect(plan).toHaveLength(5);
    expect(solves(b, cmdProgram(plan))).toBe(true);
    expect(shortestPlan(b, ['right'])).toBeNull();
    expect(plan.length).toBe(shortestMoves(b)!.length);
  });

  it('patterns never turn back on themselves', () => {
    expect(patterns(1)).toHaveLength(4);
    expect(patterns(2)).toHaveLength(8);
    for (const p of patterns(3)) expect(p).toHaveLength(3);
  });

  it('knows a handmade level as the extra it would be', () => {
    const stairs = PRIMER.find((s) => s.n === 6)!.core[1].level; // the demo's staircase: 4 × [→ ↑]
    expect(keyOfLevel(stairs)).toBe('rep:rightup:4:-1');
    const flat = PRIMER.find((s) => s.n === 1)!.core[0].level;
    expect(keyOfLevel(flat)).toMatch(/^seq:/);
    expect(keyOfLevel(PRIMER.find((s) => s.n === 4)!.boss!)).toBeNull(); // two repeats: no family makes it
  });

  it('is deterministic in the seed, and the river only changes the look', () => {
    const p: ExtraParams = { family: 'repeat', body: 2, count: [3, 4], pickups: 0 };
    expect(generate(p, 42)).toEqual(generate(p, 42));
    expect(hashSeed('a', 1)).not.toBe(hashSeed('a', 2));
    const forest = generate(p, 42), river = generate(p, 42, 'rio');
    expect(river.solution).toEqual(forest.solution);
    expect(river.board.look).toBe('river');
    expect(river.board.obstacles.every((o) => o.kind === 'water')).toBe(true);
    expect(river.board.ford).toHaveLength(moves(river.solution).length + 1); // every cell of the path is a stepping stone
  });
});

/** Checks every generated level must pass, whatever its format. */
function expectSane(e: Extra) {
  const b = e.board;
  for (const cell of [b.start, ...(b.goalKind === 'none' ? [] : [b.goal]), ...b.pickups]) {
    expect(inside(b, cell.c, cell.r)).toBe(true);
    expect(obstacleAt(b, cell.c, cell.r)).toBeUndefined();
  }
  expect(sameCell(b.start, b.goal)).toBe(false);
  expect(e.level.worlds[0]).toBe(b);
  expect(e.level.slots).toBe(e.slots);
  expect(e.level.format).toBe(e.format);
  const f = formatOf(e.level);
  if (f === 'predict') {
    expect(b.goalKind).toBe('none');
    const t = simulate(b, e.solution);
    expect(t.outcome).toBe('short'); // it never bumps, and there is nothing to arrive at
    expect(sameCell(t.final, b.start)).toBe(false);
    expect(e.given).toEqual(e.solution);
    return;
  }
  expect(b.goalKind).toBe(b.pickups.length ? 'pot' : 'seed');
  expect(simulate(b, e.solution).outcome).toBe('win');
  expect(cardCount(e.solution)).toBeLessThanOrEqual(e.slots);
  for (const cmd of moves(e.solution)) if (f === 'solve') expect(e.blocks).toContain(cmd);
  if (f === 'fix' || f === 'complete') {
    expect(solves(b, e.given!)).toBe(false);
    expect(differences(e.given!, e.solution).length).toBeGreaterThan(0);
  }
}

for (const sheet of WITH_EXTRAS) {
  describe(`sheet ${sheet.n} (${sheet.title}): extras`, () => {
    for (const door of DOORS) {
      const run = extraRun(sheet, door, RUN);
      const withParams = run.map((e, i) => ({ e, p: paramsAt(sheet.extras![door], i + 1) }));
      const of = <F extends ExtraParams['family']>(family: F) =>
        withParams.filter((x) => x.p.family === family) as { e: Extra; p: Extract<ExtraParams, { family: F }> }[];

      it(`${door}: every level is sane and its reference program does what its format asks`, () => {
        expect(run).toHaveLength(RUN);
        for (const e of run) expectSane(e);
        for (const { e, p } of withParams) {
          const want = p.family === 'predict' || p.family === 'fix' || p.family === 'complete' ? p.family : undefined;
          expect(e.format).toBe(want);
        }
      });

      if (of('sequence').length) {
        it(`${door}: flat plans of the asked length, exactly as many lines as the shortest plan, seeds that cost a detour`, () => {
          for (const { e, p } of of('sequence')) {
            expect(e.flat).toBeGreaterThanOrEqual(p.steps[0]);
            expect(e.flat).toBeLessThanOrEqual(p.steps[1]);
            expect(e.slots).toBe(shortestMoves(e.board)!.length);
            expect(e.board.pickups).toHaveLength(p.pickups);
            if (p.pickups) expect(shortestMoves({ ...e.board, pickups: [], goalKind: 'seed' })!.length).toBeLessThan(e.flat);
          }
        });
      }

      if (of('repeat').some((x) => !x.p.save)) {
        it(`${door}: the level needs the repeat (no plan without it fits the notebook), and the steps around it`, () => {
          for (const { e, p } of of('repeat').filter((x) => !x.p.save)) {
            const at = e.solution.findIndex((it) => it.t === 'loop');
            const loop = e.solution[at];
            if (loop.t !== 'loop' || typeof loop.count !== 'number') throw new Error('a repeat level without its repeat');
            expect(loop.body).toHaveLength(p.body);
            expect(loop.count).toBeGreaterThanOrEqual(p.count[0]);
            expect(loop.count).toBeLessThanOrEqual(p.count[1]);
            expect(e.slots).toBe(cardCount(e.solution));
            const pre = at, post = e.solution.length - at - 1;
            if (p.pre) { expect(pre).toBeGreaterThanOrEqual(p.pre[0]); expect(pre).toBeLessThanOrEqual(p.pre[1]); } else expect(pre).toBe(0);
            if (p.post) { expect(post).toBeGreaterThanOrEqual(p.post[0]); expect(post).toBeLessThanOrEqual(p.post[1]); } else expect(post).toBe(0);
            expect(shortestMoves(e.board)!.length).toBeGreaterThan(e.slots);
            const arrows = e.blocks.filter((b) => b !== 'repeat');
            for (const seq of sequences(arrows, e.slots)) expect(solves(e.board, cmdProgram(seq))).toBe(false);
            if (pre || post) {
              for (const body of sequences(arrows, e.slots)) for (let n = COUNT_MIN; n <= COUNT_MAX; n++) expect(solves(e.board, [{ t: 'loop', count: n, body }])).toBe(false);
            }
          }
        });
      }

      if (of('repeat').some((x) => x.p.save)) {
        it(`${door}: save blocks: a long flat plan fits, and the gold challenge has the fewest lines that win`, () => {
          for (const { e } of of('repeat').filter((x) => x.p.save)) {
            expect(e.blocks).not.toContain('repeat');
            expect(e.slots).toBe(shortestMoves(e.board)!.length);
            expect(e.slots).toBeLessThanOrEqual(12);
            const s = e.save!;
            expect(e.level.save).toBe(s);
            expect(s.blocks).toContain('repeat');
            expect(solves(e.board, s.solution)).toBe(true);
            expect(cardCount(s.solution)).toBe(s.slots);
            expect(s.slots).toBeLessThan(e.slots);
            const arrows = s.blocks!.filter((b) => b !== 'repeat');
            for (const p of programs(arrows, s.slots - 1)) expect(solves(e.board, p), JSON.stringify(p)).toBe(false);
          }
        });
      }

      if (of('predict').length) {
        it(`${door}: predict: a program of the asked length that never crosses its own path`, () => {
          for (const { e, p } of of('predict')) {
            const walked = moves(e.solution);
            expect(walked.length).toBeGreaterThanOrEqual(p.steps[0]);
            expect(walked.length).toBeLessThanOrEqual(p.steps[1]);
            const cells = walkCells(e.board, e.solution);
            expect(new Set(cells.map((c) => `${c.c},${c.r}`)).size).toBe(cells.length);
            const loop = e.solution.find((it) => it.t === 'loop');
            expect(!!loop).toBe(!!p.loop);
            if (loop?.t === 'loop' && p.loop) {
              expect(loop.body).toHaveLength(p.loop.body);
              expect(loop.count).toBeGreaterThanOrEqual(p.loop.count[0]);
              expect(loop.count).toBeLessThanOrEqual(p.loop.count[1]);
            }
          }
        });
      }

      if (of('fix').length) {
        it(`${door}: fix: exactly one mistake, and Brote shows where it is`, () => {
          for (const { e, p } of of('fix')) {
            expect(p.bugs).toContain(e.bug);
            const diff = differences(e.given!, e.solution);
            expect(diff).toHaveLength(1);
            const t = simulate(e.board, e.given!);
            const d = diff[0];
            if (e.bug === 'count') {
              expect(d.kind).toBe('count');
              expect(t.outcome).toBe('short');
              if (d.kind === 'count') expect(d.from).toBeLessThan(d.to as number);
            } else {
              expect(d.kind).toBe('line');
              if (d.kind !== 'line') continue;
              expect(t.outcome).toBe('crash');
              const s = t.steps[t.crashAt!];
              expect({ item: s.ref.item, inner: s.ref.inner }).toEqual({ item: d.ref.item, inner: d.ref.inner });
              expect(s.ref.iter ?? 0).toBe(0);
              if (e.bug === 'extra') expect(d.to).toBe(HOLE);
            }
            // the palette has the arrows of the page, and no repeat to add
            expect(e.blocks).not.toContain('repeat');
            for (const cmd of moves(e.solution)) expect(e.blocks).toContain(cmd);
            expect(e.slots).toBe(cardCount(e.given!));
          }
        });
      }

      if (of('complete').length) {
        it(`${door}: complete: only what is missing is the child's, and only one answer fits`, () => {
          for (const { e, p } of of('complete')) {
            expect(p.holes).toContain(e.hole);
            const diff = differences(e.given!, e.solution);
            expect(diff).toHaveLength(1);
            const d = diff[0];
            if (e.hole === 'count') {
              expect(d).toMatchObject({ kind: 'count', from: 0 });
              expect(e.blocks).toEqual([]);
              if (d.kind !== 'count') continue;
              for (let n = COUNT_MIN; n <= COUNT_MAX; n++) {
                const tried = e.given!.map((it, i) => (i === d.item && it.t === 'loop' ? { ...it, count: n } : it));
                expect(solves(e.board, tried), `count ${n}`).toBe(n === d.to);
              }
            } else {
              expect(d).toMatchObject({ kind: 'line', from: HOLE });
              if (d.kind !== 'line') continue;
              for (const a of e.blocks) {
                const tried = structuredClone(e.given!);
                const it = tried[d.ref.item];
                if (it.t === 'cmd') it.cmd = a; else it.body[d.ref.inner!] = a;
                expect(solves(e.board, tried), a).toBe(a === d.to);
              }
            }
          }
        });
      }

      it(`${door}: no level repeats within a run, nor one of the sheet's own levels`, () => {
        expect(new Set(run.map((e) => e.key)).size).toBe(run.length);
        expect(new Set(run.map((e) => e.level.id)).size).toBe(run.length);
        const own = [...sheet.core.map((c) => c.level), ...(sheet.boss ? [sheet.boss] : [])].map(keyOfLevel);
        for (const e of run) expect(own).not.toContain(e.key);
      });

      if (sheet.zone === 'rio') {
        it(`${door}: by the river`, () => {
          for (const e of run) expect(e.board.look).toBe('river');
        });
      }
    }

    it('the doors get harder: easy < medium < hard, on average', () => {
      const avg = (d: (typeof DOORS)[number]) => extraRun(sheet, d, RUN).reduce((n, e) => n + difficultyOf(e), 0) / RUN;
      expect(avg('easy')).toBeLessThan(avg('medium'));
      expect(avg('medium')).toBeLessThan(avg('hard'));
    });

    it('the i-th extra is always the same level', () => {
      expect(extraFor(sheet, 'medium', 3)!.key).toBe(extraRun(sheet, 'medium', 3)[2].key);
      expect(extraFor(sheet, 'medium', 3)!.seed).toBe(extraRun(sheet, 'medium', RUN)[2].seed);
    });

    it('a door with several families takes them in turns', () => {
      for (const door of DOORS) {
        const list = doorParams(sheet.extras![door]);
        extraRun(sheet, door, RUN).forEach((e, i) => expect(e.format ?? 'x').toBe(fmt(list[i % list.length])));
      }
    });
  });
}

const fmt = (p: ExtraParams) => (p.family === 'predict' || p.family === 'fix' || p.family === 'complete' ? p.family : 'x');
