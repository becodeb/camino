import { describe, expect, it } from 'vitest';
import { menuFor } from './freePlay';
import { hasProbe } from './probes';
import { gmInit, gmStep, objectOf, presentOf, type GmGame } from '../game/gameMaker';
import type { Dir } from '../game/model';
import {
  FAST_TIMES, STEPS, STEP_DEFS, START_GAME, TIMES, applyMissing, doneLine, editableIn, enterStep, missingEdits, noFlags, observe,
  prepared, stepDone, stepGoal, stepLine, stepPalette, timesFrom, type GmStep, type StepFlags,
} from './gameMakerProbe';

/** Plays `g` for `ticks`, keys from `input`, watching the step like the screen does. */
function watch(step: GmStep, g: GmGame, ticks: number, input: (t: number, s: ReturnType<typeof gmInit>) => Dir[] = () => []): StepFlags {
  let s = gmInit(g, 11);
  let f = noFlags();
  for (let t = 0; t < ticks && !s.over; t++) {
    const r = gmStep(g, s, input(t, s));
    f = observe(step, f, s, r.events, g);
    s = r.state;
  }
  return f;
}
const build = (step: GmStep, g: GmGame) => {
  let next = g;
  for (const e of missingEdits(next, step)) {
    const r = applyMissing(next, e);
    if (!('game' in r)) throw new Error(`refused ${JSON.stringify(e)}`);
    next = r.game;
  }
  return next;
};

describe('the steps of "Hacé tu juego"', () => {
  it('six steps in order, each on its object', () => {
    expect(STEPS).toEqual(['move', 'stone', 'seed_read', 'touch_rules', 'win', 'free']);
    expect(STEPS.map((s) => STEP_DEFS[s].obj)).toEqual(['me', 'stone', 'seed', 'me', 'game', 'me']);
  });

  it('starts with the character alone and no rules; each step brings its object onto the board', () => {
    expect(START_GAME).toEqual([{ id: 'me', rules: [] }]);
    expect(presentOf(enterStep(START_GAME, 'move'))).toEqual(['me']);
    expect(presentOf(enterStep(START_GAME, 'stone'))).toEqual(['me', 'stone']);
    const seed = enterStep(START_GAME, 'seed_read');
    expect(presentOf(seed)).toEqual(['me', 'seed', 'stone']);
    expect(objectOf(seed, 'seed')!.rules).toEqual([{ hat: 'tick', actions: ['move:down'] }, { hat: 'touch:ground', actions: ['top'] }]);
    const win = enterStep(START_GAME, 'win');
    expect(presentOf(win)).toEqual(['me', 'seed', 'stone', 'game']);
    expect(objectOf(win, 'game')!.rules).toEqual([{ hat: 'lives0', actions: ['lose'] }]);
    // entering again changes nothing the child made
    const mine = enterStep([{ id: 'me', rules: [{ hat: 'key:up', actions: ['say:mia'] }] }, { id: 'seed', rules: [] }], 'seed_read');
    expect(objectOf(mine, 'seed')!.rules).toEqual([]);
    expect(objectOf(mine, 'me')!.rules).toEqual([{ hat: 'key:up', actions: ['say:mia'] }]);
  });

  it('the palette holds only the step\'s blocks, on its own object; every block in the free step', () => {
    expect(stepPalette('move', 'me')).toEqual({ hats: ['key:right', 'key:left'], actions: ['move:right', 'move:left'] });
    expect(stepPalette('move', 'stone')).toEqual({ hats: [], actions: [] });
    expect(stepPalette('seed_read', 'seed')).toEqual({ hats: [], actions: [] });
    expect(stepPalette('free', 'stone').hats.length).toBeGreaterThan(3);
    expect(editableIn('stone', 'stone')).toBe(true);
    expect(editableIn('stone', 'me')).toBe(false);
    expect(editableIn('seed_read', 'seed')).toBe(false);
    expect(editableIn('free', 'game')).toBe(true);
    // every target block is in the step's palette (the ghost taps it there)
    for (const s of STEPS) {
      const p = stepPalette(s, STEP_DEFS[s].obj);
      for (const t of STEP_DEFS[s].target) {
        expect(p.hats).toContain(t.hat);
        for (const a of t.actions) expect(p.actions).toContain(a);
      }
    }
  });

  it('the missing edits build the step\'s rules card by card; nothing is missing afterwards', () => {
    const g = enterStep(START_GAME, 'move');
    expect(missingEdits(g, 'move')).toEqual([
      { kind: 'hat', obj: 'me', hat: 'key:right' }, { kind: 'action', obj: 'me', hat: 'key:right', action: 'move:right' },
      { kind: 'hat', obj: 'me', hat: 'key:left' }, { kind: 'action', obj: 'me', hat: 'key:left', action: 'move:left' },
    ]);
    const done = build('move', g);
    expect(missingEdits(done, 'move')).toEqual([]);
    // a card the child already made is kept: only its action is missing
    const half = applyMissing(g, { kind: 'hat', obj: 'me', hat: 'key:left' });
    expect('game' in half && missingEdits(half.game, 'move').filter((e) => e.kind === 'hat').map((e) => e.hat)).toEqual(['key:right']);
  });

  it('prepared(step): every step before it done the canonical way', () => {
    const g = prepared('free');
    expect(presentOf(g)).toEqual(['me', 'seed', 'stone', 'game']);
    for (const s of STEPS) expect(missingEdits(g, s)).toEqual([]);
    expect(objectOf(prepared('move'), 'me')!.rules).toEqual([]);
    expect(objectOf(prepared('stone'), 'me')!.rules.length).toBe(2);
    expect(objectOf(prepared('stone'), 'stone')!.rules).toEqual([]);
  });
});

describe('when a step counts as done (the real engine)', () => {
  it('move: the character went both ways with the arrows', () => {
    const g = build('move', enterStep(START_GAME, 'move'));
    expect(stepDone('move', watch('move', g, 6, (t) => (t === 1 ? ['right'] : [])))).toBe(false);
    const f = watch('move', g, 6, (t) => (t === 1 ? ['right'] : t === 3 ? ['left'] : []));
    expect(f.movedRight && f.movedLeft).toBe(true);
    expect(stepDone('move', f)).toBe(true);
    // without rules the keys do nothing
    expect(stepDone('move', watch('move', enterStep(START_GAME, 'move'), 6, (t) => (t % 2 ? ['right'] : ['left'])))).toBe(false);
  });

  it('stone: it falls and comes back up; falling alone gets it stuck at the bottom', () => {
    const base = enterStep(prepared('stone'), 'stone');
    const fall = applyMissingOk(base, 1);
    const onlyFall = watch('stone', fall, 60);
    expect(onlyFall.stoneFell && onlyFall.stoneStuck && !onlyFall.stoneBack).toBe(true);
    expect(stepDone('stone', onlyFall)).toBe(false);
    const g = build('stone', base);
    const f = watch('stone', g, 60);
    expect(stepDone('stone', f)).toBe(true);
  });

  it('seed_read is done by the screen (the child tapped the seed)', () => {
    expect(stepDone('seed_read', noFlags())).toBe(false);
    expect(stepDone('seed_read', { ...noFlags(), read: true })).toBe(true);
  });

  it('touch_rules: a life lost and a point scored while playing', () => {
    const g = build('touch_rules', prepared('touch_rules'));
    // stand still: the stone and the seed both fall on the character sooner or later
    const still = watch('touch_rules', g, 1200);
    expect(still.lostLife || still.scored).toBe(true);
    // chase whatever falls closest to the ground: both happen
    const f = watch('touch_rules', g, 1500, (_t, s) => {
      const me = s.sprites.me!, low = [s.sprites.seed!, s.sprites.stone!].sort((a, b) => b.r - a.r)[0];
      return low.c > me.c ? ['right'] : low.c < me.c ? ['left'] : [];
    });
    expect(stepDone('touch_rules', f)).toBe(true);
    // without the step's rules nothing is lost or scored
    const none = watch('touch_rules', prepared('touch_rules'), 600);
    expect(none.lostLife || none.scored).toBe(false);
  });

  it('win: a game ends (won or lost) once there is a way to win', () => {
    const g = build('win', prepared('win'));
    const f = watch('win', g, 4000, (_t, s) => {
      const me = s.sprites.me!, seed = s.sprites.seed!;
      return seed.c > me.c ? ['right'] : seed.c < me.c ? ['left'] : [];
    });
    expect(f.ended).toBe('win');
    expect(stepDone('win', f)).toBe(true);
    // losing (all lives gone) counts too
    const lost = watch('win', g, 6000, (_t, s) => {
      const me = s.sprites.me!, stone = s.sprites.stone!;
      return stone.c > me.c ? ['right'] : stone.c < me.c ? ['left'] : [];
    });
    expect(lost.ended).toBe('lose');
    // without a way to win, losing is not the step's goal
    expect(watch('win', prepared('win'), 6000, (_t, s) => {
      const me = s.sprites.me!, stone = s.sprites.stone!;
      return stone.c > me.c ? ['right'] : stone.c < me.c ? ['left'] : [];
    }).ended).toBe(null);
  });

  it('the free step is never "done": the child leaves it', () => {
    expect(stepDone('free', { ...noFlags(), movedLeft: true, movedRight: true, read: true, scored: true, lostLife: true, ended: 'win' })).toBe(false);
  });
});

describe('times and words', () => {
  it('"seguir" after 90 s of trying, the free step up to 5 minutes; ?caps=fast in seconds', () => {
    expect(TIMES.skipMs).toBe(90_000);
    expect(TIMES.freeMaxMs).toBe(300_000);
    expect(timesFrom('?debug&caps=fast')).toBe(FAST_TIMES);
    expect(timesFrom('?debug')).toBe(TIMES);
    expect(FAST_TIMES.skipMs).toBeLessThan(15_000);
  });

  it('every line is short, names the character, and never says Scratch', () => {
    for (const s of STEPS) {
      for (const line of [stepLine(s, 'Ovillo'), doneLine(s, 'Ovillo'), ...stepGoal(s, 'Ovillo')]) {
        expect(line.length).toBeLessThanOrEqual(115);
        expect(line).not.toMatch(/scratch|Brote/i);
      }
    }
    expect(stepLine('move', 'Ovillo')).toContain('Ovillo');
    expect(stepGoal('move', 'Ovillo').join(' ')).toContain('Ovillo');
  });
});

describe('the probe on the menu', () => {
  it('is registered: its card shows on 4to\'s menu (not on 5to\'s, where the adult can open it)', () => {
    expect(hasProbe('game_maker')).toBe(true);
    expect(menuFor(4, hasProbe).map((a) => a.id)).toContain('game_maker');
    expect(menuFor(5, hasProbe).map((a) => a.id)).not.toContain('game_maker');
  });
});

/** The base game with the step's first `n + 1` missing edits applied (n = 0: the first). */
function applyMissingOk(g: GmGame, n: number): GmGame {
  let next = g;
  for (const e of missingEdits(g, 'stone').slice(0, n + 1)) {
    const r = applyMissing(next, e);
    if ('game' in r) next = r.game;
  }
  return next;
}
