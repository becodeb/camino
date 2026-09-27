import { describe, expect, it } from 'vitest';
import { shortestMoves, shortestPlan, simulate, solves } from '../game/engine';
import { cardCount, cmdProgram, inside, obstacleAt, sameCell } from '../game/model';
import { DOORS, type ExtraParams } from './model';
import { PRIMER } from './primer';
import { difficultyOf, extraFor, extraRun, generate, hashSeed, keyOfLevel, patterns } from './generate';

const WITH_EXTRAS = PRIMER.filter((s) => s.extras);
const RUN = 8;

/** Every flat list of `alphabet` with 1..max arrows. */
function* sequences(alphabet: readonly string[], max: number): Generator<string[]> {
  let layer: string[][] = [[]];
  for (let n = 1; n <= max; n++) {
    layer = layer.flatMap((s) => alphabet.map((a) => [...s, a]));
    yield* layer;
  }
}

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

  it('is deterministic in the seed', () => {
    const p: ExtraParams = { family: 'repeat', body: 2, count: [3, 4], pickups: 0 };
    expect(generate(p, 42)).toEqual(generate(p, 42));
    expect(hashSeed('a', 1)).not.toBe(hashSeed('a', 2));
  });
});

for (const sheet of WITH_EXTRAS) {
  describe(`sheet ${sheet.n} (${sheet.title}): extras`, () => {
    for (const door of DOORS) {
      const params = sheet.extras![door];
      const run = extraRun(sheet, door, RUN);

      it(`${door}: every level is sane and solvable, and fits its notebook`, () => {
        expect(run).toHaveLength(RUN);
        for (const e of run) {
          const b = e.board;
          for (const cell of [b.start, b.goal, ...b.pickups]) {
            expect(inside(b, cell.c, cell.r)).toBe(true);
            expect(obstacleAt(b, cell.c, cell.r)).toBeUndefined();
          }
          expect(sameCell(b.start, b.goal)).toBe(false);
          expect(b.goalKind).toBe(b.pickups.length ? 'pot' : 'seed');
          expect(simulate(b, e.solution).outcome).toBe('win');
          expect(cardCount(e.solution)).toBeLessThanOrEqual(e.slots);
          for (const cmd of e.solution.flatMap((it) => (it.t === 'cmd' ? [it.cmd] : it.body))) expect(e.blocks).toContain(cmd);
          expect(e.level.worlds[0]).toBe(b);
          expect(e.level.slots).toBe(e.slots);
        }
      });

      if (params.family === 'sequence') {
        it(`${door}: flat plans of the asked length, exactly as many lines as the shortest plan, seeds that cost a detour`, () => {
          for (const e of run) {
            expect(e.flat).toBeGreaterThanOrEqual(params.steps[0]);
            expect(e.flat).toBeLessThanOrEqual(params.steps[1]);
            expect(e.slots).toBe(shortestMoves(e.board)!.length);
            expect(e.board.pickups).toHaveLength(params.pickups);
            if (params.pickups) expect(shortestMoves({ ...e.board, pickups: [], goalKind: 'seed' })!.length).toBeLessThan(e.flat);
          }
        });
      } else {
        it(`${door}: the level needs the repeat (no plan without it fits the notebook)`, () => {
          for (const e of run) {
            const loop = e.solution[0];
            expect(loop.t).toBe('loop');
            if (loop.t !== 'loop' || typeof loop.count !== 'number') continue;
            expect(loop.body).toHaveLength(params.body);
            expect(loop.count).toBeGreaterThanOrEqual(params.count[0]);
            expect(loop.count).toBeLessThanOrEqual(params.count[1]);
            expect(e.slots).toBe(params.body);
            expect(shortestMoves(e.board)!.length).toBeGreaterThan(e.slots);
            const arrows = e.blocks.filter((b) => b !== 'repeat');
            for (const seq of sequences(arrows, e.slots)) expect(solves(e.board, cmdProgram(seq))).toBe(false);
          }
        });
      }

      it(`${door}: no level repeats within a run, nor one of the sheet's own levels`, () => {
        expect(new Set(run.map((e) => e.key)).size).toBe(run.length);
        expect(new Set(run.map((e) => e.level.id)).size).toBe(run.length);
        const own = [...sheet.core.map((c) => c.level), ...(sheet.boss ? [sheet.boss] : [])].map(keyOfLevel);
        for (const e of run) expect(own).not.toContain(e.key);
      });
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
  });
}
