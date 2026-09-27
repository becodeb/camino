import { describe, expect, it } from 'vitest';
import { completeProgram, shortestMoves, simulate, solves } from '../game/engine';
import { holesOf, writeLine } from '../game/editor';
import { differences, formatOf, goldLevel, hasHoles, pinsOf } from '../game/formats';
import { COUNT_MAX, COUNT_MIN } from '../game/hint';
import { LEVELS, levelById, type LevelDef } from '../game/levels';
import { HOLE, cardCount, cmdProgram, inside, isHole, obstacleAt, sameCell, type Program, type ProgramItem } from '../game/model';
import { DOORS, bossId, coreId, isBuilt } from './model';
import { PRIMER, sheetByN } from './primer';

const BUILT = PRIMER.filter(isBuilt);
const cmdsOf = (l: Pick<LevelDef, 'blocks'>) => l.blocks.filter((b) => b !== 'repeat' && b !== 'repeat-goal');
const hasLoop = (p: Program) => p.some((it) => it.t === 'loop');
const levelsOf = (n: number) => { const s = sheetByN(n)!; return [...s.core.map((c) => c.level), s.boss!]; };
const loopsOf = (p: Program) => p.filter((it): it is Extract<ProgramItem, { t: 'loop' }> => it.t === 'loop');
const walked = (l: LevelDef, p: Program) => { const b = l.worlds[0]; return [b.start, ...simulate(b, p).steps.flatMap((s) => s.cells)]; };

/** Every flat list of `alphabet` with 1..max arrows. */
function* sequences(alphabet: readonly string[], max: number): Generator<string[]> {
  let layer: string[][] = [[]];
  for (let n = 1; n <= max; n++) {
    layer = layer.flatMap((s) => alphabet.map((a) => [...s, a]));
    yield* layer;
  }
}

/** Every program a notebook holds: these arrows, repeats one level deep (if `loops`), at most `slots` cards. */
function* programsWith(arrows: readonly string[], loops: boolean, slots: number): Generator<Program> {
  const items: { it: ProgramItem; cards: number }[] = arrows.map((cmd) => ({ it: { t: 'cmd', cmd }, cards: 1 }));
  if (loops) {
    for (const body of sequences(arrows, slots)) for (let n = COUNT_MIN; n <= COUNT_MAX; n++) items.push({ it: { t: 'loop', count: n, body }, cards: body.length });
  }
  const grow = function* (acc: Program, room: number): Generator<Program> {
    if (acc.length) yield acc;
    for (const { it, cards } of items) if (cards <= room) yield* grow([...acc, it], room - cards);
  };
  yield* grow([], slots);
}
const programsOf = (l: LevelDef) => programsWith(cmdsOf(l), l.blocks.includes('repeat'), l.slots!);

describe('the built sheets of 1ro', () => {
  it('are 1 to 6, 8 and 10 to 13', () => {
    expect(BUILT.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 8, 10, 11, 12, 13]);
  });

  for (const s of BUILT) {
    it(`sheet ${s.n}: 3 or 4 core levels, 1 or 2 essential, a boss, three doors of extras and a preview`, () => {
      expect(s.core.length).toBeGreaterThanOrEqual(3);
      expect(s.core.length).toBeLessThanOrEqual(4);
      const ess = s.core.filter((c) => c.essential).length;
      expect(ess).toBeGreaterThanOrEqual(1);
      expect(ess).toBeLessThanOrEqual(2);
      expect(s.boss).toBeDefined();
      for (const d of DOORS) expect(s.extras?.[d]).toBeDefined();
      expect(s.preview?.length).toBeGreaterThan(0);
      s.core.forEach((c, i) => {
        expect(c.level.id).toBe(coreId(s, i + 1));
        expect(c.level.page).toBe(i + 1);
      });
      expect(s.boss!.id).toBe(bossId(s));
    });
  }

  it('level ids are unique in the year and never collide with the demo', () => {
    const ids = BUILT.flatMap((s) => levelsOf(s.n).map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(LEVELS.some((l) => l.id === id)).toBe(false);
  });

  it('the river sheets are drawn by the river, the forest ones in the forest', () => {
    for (const s of BUILT) for (const l of levelsOf(s.n)) expect(l.worlds[0].look === 'river', l.id).toBe(s.zone === 'rio');
  });
});

describe('every level of the built sheets', () => {
  for (const s of BUILT) {
    for (const l of levelsOf(s.n)) {
      describe(l.id, () => {
        const b = l.worlds[0];
        const f = formatOf(l);

        it('is a 1ro program page with a sane board', () => {
          expect(l.mode).toBe('program');
          expect(l.blockLabel).toBe('picture-word');
          expect(l.grade).toBe('1ro');
          expect(l.worlds).toHaveLength(1);
          for (const cell of [b.start, ...(b.goalKind === 'none' ? [] : [b.goal]), ...b.pickups]) {
            expect(inside(b, cell.c, cell.r)).toBe(true);
            expect(obstacleAt(b, cell.c, cell.r)).toBeUndefined();
          }
          expect(sameCell(b.start, b.goal)).toBe(false);
          expect(b.goalKind).toBe(f === 'predict' ? 'none' : b.pickups.length ? 'pot' : 'seed');
          for (const x of b.ford ?? []) expect(obstacleAt(b, x.c, x.r)).toBeUndefined();
        });

        if (f === 'predict') {
          it('predict: the program is read-only, never bumps, never crosses its own path and does not end where it starts', () => {
            expect(l.given).toEqual(l.solution);
            const t = simulate(b, l.solution);
            expect(t.outcome).toBe('short');
            expect(sameCell(t.final, b.start)).toBe(false);
            const cells = walked(l, l.solution);
            expect(new Set(cells.map((c) => `${c.c},${c.r}`)).size).toBe(cells.length);
          });
          return;
        }

        it('its reference program wins, fits the notebook and uses only its palette', () => {
          expect(simulate(b, l.solution).outcome).toBe('win');
          expect(cardCount(l.solution)).toBeLessThanOrEqual(l.slots!);
          if (f === 'solve') {
            for (const it of l.solution) {
              if (it.t === 'cmd') expect(l.blocks).toContain(it.cmd);
              else { expect(l.blocks).toContain('repeat'); for (const c of it.body) expect(l.blocks).toContain(c); }
            }
          }
        });

        if (f === 'fix') {
          it('fix: exactly one mistake, which Brote shows (a bump right on it, or a repeat that stops short)', () => {
            const d = differences(l.given!, l.solution);
            expect(d).toHaveLength(1);
            expect(solves(b, l.given!)).toBe(false);
            const t = simulate(b, l.given!);
            if (d[0].kind === 'count') {
              expect(t.outcome).toBe('short');
              expect(d[0].from).toBeLessThan(d[0].to as number);
            } else {
              expect(t.outcome).toBe('crash');
              const s = t.steps[t.crashAt!];
              expect({ item: s.ref.item, inner: s.ref.inner }).toEqual({ item: d[0].ref.item, inner: d[0].ref.inner });
              expect(s.ref.iter ?? 0).toBe(0);
            }
            expect(l.slots).toBe(cardCount(l.given!));
            expect(l.blocks).not.toContain('repeat');
          });
        }

        if (f === 'complete') {
          it('complete: only empty lines and missing counts are the child\'s, and each has one answer', () => {
            const d = differences(l.given!, l.solution);
            expect(d.length).toBeGreaterThan(0);
            for (const x of d) expect(x.from).toBe(x.kind === 'count' ? 0 : HOLE);
            expect(solves(b, l.given!)).toBe(false);
            // each missing piece, the rest filled in: only the reference's answer wins
            for (const x of d) {
              if (x.kind === 'count') {
                for (let n = COUNT_MIN; n <= COUNT_MAX; n++) {
                  const tried = l.solution.map((it, i) => (i === x.item && it.t === 'loop' ? { ...it, count: n } : it));
                  expect(solves(b, tried), `count ${n}`).toBe(n === x.to);
                }
              } else {
                for (const a of cmdsOf(l)) expect(solves(b, writeLine(l.solution, x.ref, a)), a).toBe(a === x.to);
              }
            }
            const pins = pinsOf(l);
            expect(pins.cards.size).toBe(cardCount(l.given!));
            expect(l.blocks.length > 0).toBe(hasHoles(l.given!));
            expect(holesOf(l.given!)).toHaveLength(d.filter((x) => x.kind === 'line').length);
          });
        }

        if (f === 'solve' && !hasLoop(l.solution)) {
          it('flat: the notebook has exactly as many lines as the shortest plan', () => {
            expect(shortestMoves(b)!.length).toBe(l.slots);
            expect(completeProgram(b, [], l.blocks, l.slots!)).not.toBeNull();
          });
        }
        if (f === 'solve' && hasLoop(l.solution)) {
          it('needs "repetir": no plan without it fits the notebook', () => {
            for (const seq of sequences(cmdsOf(l), l.slots!)) expect(solves(b, cmdProgram(seq))).toBe(false);
          });
        }

        if (l.save) {
          it('its gold challenge: the same board with the fewest lines that win, and "repetir"', () => {
            const g = goldLevel(l)!;
            expect(g.worlds).toBe(l.worlds);
            expect(g.blocks).toContain('repeat');
            expect(solves(b, g.solution)).toBe(true);
            expect(cardCount(g.solution)).toBe(g.slots);
            expect(g.slots!).toBeLessThan(l.slots!);
            for (const p of programsWith(cmdsOf(g), true, g.slots! - 1)) expect(solves(b, p), JSON.stringify(p)).toBe(false);
          });
        }
      });
    }
  }
});

describe('what each sheet teaches', () => {
  it('1 · a review of sala 5: short flat plans, then seed first and pot after', () => {
    for (const l of levelsOf(1)) expect(hasLoop(l.solution)).toBe(false);
    for (const c of sheetByN(1)!.core) expect(c.level.slots).toBeLessThanOrEqual(6);
    expect(levelsOf(1).some((l) => l.worlds[0].goalKind === 'pot')).toBe(true);
  });

  it('2 · long plans from 8 to 12 steps, with seeds that cost a detour', () => {
    const lens = levelsOf(2).map((l) => l.slots!);
    for (const n of lens) { expect(n).toBeGreaterThanOrEqual(8); expect(n).toBeLessThanOrEqual(12); }
    expect(lens).toContain(12);
    for (const l of levelsOf(2)) {
      const b = l.worlds[0];
      expect(b.pickups.length).toBeGreaterThan(0);
      expect(shortestMoves({ ...b, pickups: [], goalKind: 'seed' })!.length).toBeLessThan(l.slots!);
    }
  });

  it('3 · fix and predict, still without repeat: a wrong arrow in a flat plan, the end of a flat plan', () => {
    const ls = levelsOf(3);
    for (const l of ls) {
      expect(['fix', 'predict']).toContain(formatOf(l));
      expect(hasLoop(l.solution)).toBe(false);
      expect(l.blocks).not.toContain('repeat');
    }
    const core = sheetByN(3)!.core.map((c) => c.level);
    expect(core.filter((l) => l.format === 'fix').length).toBeGreaterThanOrEqual(2);
    expect(core.filter((l) => l.format === 'predict').length).toBeGreaterThanOrEqual(1);
    // the essential pages are the fixes; the flat fixes are shortest plans
    for (const c of sheetByN(3)!.core.filter((x) => x.essential)) expect(c.level.format).toBe('fix');
    for (const l of ls.filter((x) => x.format === 'fix')) expect(shortestMoves(l.worlds[0])!.length).toBe(cardCount(l.solution));
  });

  it('4 · the demo\'s 1ro-1 and its ghost hand open the sheet; every level repeats one block', () => {
    const s = sheetByN(4)!;
    const demo = levelById('1ro-1')!;
    expect(s.core[0].level.worlds).toEqual(demo.worlds);
    expect(s.core[0].level.intro).toEqual(demo.intro);
    expect(s.concept).toEqual(demo.intro);
    for (const l of s.core.map((c) => c.level)) {
      const loops = l.solution.filter((it) => it.t === 'loop');
      expect(loops).toHaveLength(1);
      if (loops[0].t === 'loop') expect(loops[0].body).toHaveLength(1);
    }
  });

  it('4 · the boss needs two repeats: every program that fits and wins has two', () => {
    const l = sheetByN(4)!.boss!;
    let winners = 0;
    for (const p of programsOf(l)) {
      if (!solves(l.worlds[0], p)) continue;
      winners++;
      expect(p.filter((it) => it.t === 'loop'), JSON.stringify(p)).toHaveLength(2);
    }
    expect(winners).toBeGreaterThan(0);
  });

  it('5 · the count to complete, one count only; the passes counted on predict pages', () => {
    const ls = levelsOf(5);
    for (const l of ls) expect(['complete', 'predict']).toContain(formatOf(l));
    for (const l of ls.filter((x) => x.format === 'complete')) {
      // only counts are missing: nothing to bring, no palette
      expect(differences(l.given!, l.solution).every((d) => d.kind === 'count')).toBe(true);
      expect(l.blocks).toEqual([]);
    }
    for (const l of ls.filter((x) => x.format === 'predict')) expect(hasLoop(l.solution)).toBe(true);
    for (const c of sheetByN(5)!.core.filter((x) => x.essential)) expect(c.level.format).toBe('complete');
    expect(loopsOf(sheetByN(5)!.boss!.given!).filter((x) => x.count === 0)).toHaveLength(2);
  });

  it('6 · the demo\'s staircase is in; every winning program repeats a two-block pattern', () => {
    const s = sheetByN(6)!;
    expect(s.core[1].level.worlds).toEqual(levelById('1ro-2')!.worlds);
    for (const l of s.core.map((c) => c.level)) {
      let winners = 0;
      for (const p of programsOf(l)) {
        if (!solves(l.worlds[0], p)) continue;
        winners++;
        expect(p.some((it) => it.t === 'loop' && it.body.length === 2 && new Set(it.body).size === 2), JSON.stringify(p)).toBe(true);
      }
      expect(winners, l.id).toBeGreaterThan(0);
    }
  });

  it('8 · every winning program of the core repeats a three-block pattern', () => {
    for (const c of sheetByN(8)!.core) {
      const l = c.level;
      let winners = 0;
      for (const p of programsOf(l)) {
        if (!solves(l.worlds[0], p)) continue;
        winners++;
        expect(p.some((it) => it.t === 'loop' && it.body.length === 3), JSON.stringify(p)).toBe(true);
      }
      expect(winners, l.id).toBeGreaterThan(0);
    }
  });

  it('6 and 8 · the bosses climb and come down: two repeats of different patterns', () => {
    for (const n of [6, 8]) {
      const loops = sheetByN(n)!.boss!.solution.filter((it) => it.t === 'loop');
      expect(loops).toHaveLength(2);
      expect(JSON.stringify(loops[0])).not.toBe(JSON.stringify(loops[1]));
    }
  });

  it('10 · repeat again by the river: patterns of one, two and three blocks on stepping stones', () => {
    const solveLevels = levelsOf(10).filter((l) => formatOf(l) === 'solve');
    const bodies = new Set(solveLevels.flatMap((l) => loopsOf(l.solution).map((x) => x.body.length)));
    expect([...bodies].sort()).toEqual([1, 2, 3]);
    for (const l of solveLevels) expect(hasLoop(l.solution)).toBe(true);
    for (const l of levelsOf(10)) expect(l.worlds[0].obstacles.some((o) => o.kind === 'water')).toBe(true);
  });

  it('11 · long plans with a gold challenge whose repeat is the pattern of the plan; one page asks for the repeat from the start', () => {
    const ls = levelsOf(11);
    const golden = ls.filter((l) => l.save);
    expect(golden.length).toBeGreaterThanOrEqual(3);
    expect(sheetByN(11)!.boss!.save).toBeDefined();
    for (const l of golden) {
      // a flat plan first; the gold solution walks a way just as short, with the pattern in a repeat
      expect(hasLoop(l.solution)).toBe(false);
      expect(l.blocks).not.toContain('repeat');
      expect(hasLoop(l.save!.solution)).toBe(true);
      expect(walked(l, l.save!.solution)).toHaveLength(walked(l, l.solution).length);
    }
    expect(ls.some((l) => !l.save && hasLoop(l.solution) && l.blocks.includes('repeat'))).toBe(true);
  });

  it('12 · the broken repeat: a count too short, an extra card or a wrong arrow inside it', () => {
    const ls = levelsOf(12);
    const kinds = new Set<string>();
    for (const l of ls) {
      expect(formatOf(l)).toBe('fix');
      expect(hasLoop(l.given!)).toBe(true);
      const d = differences(l.given!, l.solution)[0];
      if (d.kind === 'count') kinds.add('count');
      else {
        expect(d.ref.inner).toBeDefined(); // the mistake is inside the repeat
        kinds.add(d.to === HOLE ? 'extra' : 'arrow');
      }
    }
    expect([...kinds].sort()).toEqual(['arrow', 'count', 'extra']);
  });

  it('13 · steps before and after the repeat: no repeat alone wins, and the reference has both', () => {
    for (const l of levelsOf(13)) {
      const at = l.solution.findIndex((it) => it.t === 'loop');
      expect(at).toBeGreaterThan(0);
      expect(at).toBeLessThan(l.solution.length - 1);
      if (formatOf(l) === 'predict') continue;
      const b = l.worlds[0];
      for (const body of sequences(['left', 'up', 'down', 'right'], 3)) {
        for (let n = COUNT_MIN; n <= COUNT_MAX; n++) expect(solves(b, [{ t: 'loop', count: n, body }]), `${l.id} ${body} ×${n}`).toBe(false);
      }
    }
    // the first page gives the repeat and leaves the steps around it to the child
    const first = sheetByN(13)!.core[0].level;
    expect(first.format).toBe('complete');
    expect(first.given!.filter((it) => it.t === 'cmd' && isHole(it.cmd))).toHaveLength(2);
  });

  it('a new idea is shown by the ghost hand on the first page, and never as the answer', () => {
    for (const n of [4, 6, 8]) {
      const s = sheetByN(n)!;
      const first = s.core[0].level;
      expect(first.intro).toEqual(s.concept);
      expect(solves(first.worlds[0], first.intro!.program)).toBe(false);
    }
  });
});
