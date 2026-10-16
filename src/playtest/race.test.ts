import { describe, expect, it } from 'vitest';
import {
  BAND, CONNECTOR, CUP_PREFIX, RIVAL_START, cupsIn, withCups, LURCH, MAX_HEIGHT, RACE_START, RUN_OUT, TURBO_LEN, ZOOM_SPEED, afterWin, arrowBlock, courseOf, cutAt, filledOf,
  generateRace, heightAt, judge, ownerOf, paceOf, raceProblems, readSaved, repeatFor, restingSpot, rivalOffset, roadCode, slopeAt,
  stepRival, tapeDirs, tierRule, type BandInput, type RaceDef, type RoadDir,
} from './race';
import type { Program } from '../game/model';

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 37 + 1);

describe('the race generator', () => {
  it('draws a race that keeps every rule of its tier, for many seeds and tiers 1–6', () => {
    for (const tier of [1, 2, 3, 4, 5, 6]) {
      for (const seed of SEEDS) {
        const r = generateRace(tier, seed);
        expect(raceProblems(r), `tier ${tier} seed ${seed}: ${roadsOf(r)}`).toEqual([]);
      }
    }
  });

  it('is deterministic: the same tier and seed draw the same race; another seed usually another', () => {
    expect(generateRace(2, 1234)).toEqual(generateRace(2, 1234));
    const distinct = new Set(SEEDS.slice(0, 40).map((s) => roadsOf(generateRace(2, s))));
    expect(distinct.size).toBeGreaterThan(30);
  });

  it('tier 1: six stretches of 1–2 arrows, one direction each, opening with one flat piece; ups and downs appear', () => {
    for (const seed of SEEDS) {
      const r = generateRace(1, seed);
      expect(r.stretches).toHaveLength(6);
      expect(r.stretches[0].road).toEqual(['right']);
      for (const s of r.stretches) {
        expect(s.turbo).toBe(false);
        expect(s.road.length).toBeGreaterThanOrEqual(1);
        expect(s.road.length).toBeLessThanOrEqual(2);
        expect(new Set(s.road).size).toBe(1);
      }
      const all = r.stretches.flatMap((s) => s.road);
      expect(all).toContain('up');
      expect(all).toContain('down');
    }
  });

  it('tier 2: 2–3 arrows mixing directions in every stretch, no turbo', () => {
    for (const seed of SEEDS) {
      const r = generateRace(2, seed);
      for (const s of r.stretches) {
        expect(s.turbo).toBe(false);
        expect(s.road.length).toBeGreaterThanOrEqual(2);
        expect(s.road.length).toBeLessThanOrEqual(3);
        expect(new Set(s.road).size).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('tier 3 adds two turbo straights of 4–6 →, never first and never side by side; tier 4+ stretches are 3–5 long', () => {
    for (const seed of SEEDS) {
      const r3 = generateRace(3, seed);
      const turbos = r3.stretches.map((s, i) => (s.turbo ? i : -1)).filter((i) => i >= 0);
      expect(turbos).toHaveLength(2);
      expect(turbos[0]).toBeGreaterThan(0);
      expect(turbos[1] - turbos[0]).toBeGreaterThan(1);
      for (const i of turbos) {
        const s = r3.stretches[i];
        expect(s.road.every((d) => d === 'right')).toBe(true);
        expect(s.road.length).toBeGreaterThanOrEqual(TURBO_LEN.min);
        expect(s.road.length).toBeLessThanOrEqual(TURBO_LEN.max);
      }
      const r4 = generateRace(4, seed);
      for (const s of r4.stretches.filter((x) => !x.turbo)) {
        expect(s.road.length).toBeGreaterThanOrEqual(3);
        expect(s.road.length).toBeLessThanOrEqual(5);
      }
      expect(r4.stretches.filter((x) => x.turbo)).toHaveLength(2);
    }
  });

  it('never draws an impossible stretch: the road stays between the ground and MAX_HEIGHT', () => {
    for (const tier of [1, 2, 3, 4]) {
      for (const seed of SEEDS) {
        let h = 0;
        for (const d of generateRace(tier, seed).stretches.flatMap((s) => s.road)) {
          h += d === 'up' ? 1 : d === 'down' ? -1 : 0;
          expect(h).toBeGreaterThanOrEqual(0);
          expect(h).toBeLessThanOrEqual(MAX_HEIGHT);
        }
      }
    }
  });

  it('tiers beyond 4 play as 4 (endless "¡Otra carrera!")', () => {
    expect(tierRule(9)).toEqual(tierRule(4));
    expect(tierRule(0)).toEqual(tierRule(1));
    expect(generateRace(9, 5).tier).toBe(9);
  });

  it('raceProblems names a broken rule', () => {
    const bad: RaceDef = { tier: 1, seed: 1, stretches: [{ road: ['down'], turbo: false }] };
    const p = raceProblems(bad);
    expect(p.some((x) => x.includes('stretches'))).toBe(true);
    expect(p.some((x) => x.includes('leaves the road'))).toBe(true);
  });

  it('codes a road for telemetry', () => {
    expect(roadCode(['right', 'up', 'down'])).toBe('RUD');
  });
});

function roadsOf(r: RaceDef) {
  return r.stretches.map((s) => (s.turbo ? `T${roadCode(s.road)}` : roadCode(s.road))).join(' ');
}

describe('the tape against the road', () => {
  const road: RoadDir[] = ['right', 'up', 'right'];

  it('a matching arrow is right, the last one completes, a mismatch is wrong (and is held to be drawn)', () => {
    let tape: Program = [];
    let r = judge(road, tape, arrowBlock('right'));
    expect(r.verdict).toBe('right');
    tape = r.tape;
    r = judge(road, tape, arrowBlock('down'));
    expect(r.verdict).toBe('wrong');
    expect(tapeDirs(r.tape)).toEqual(['right', 'down']);
    r = judge(road, tape, arrowBlock('up'));
    expect(r.verdict).toBe('right');
    r = judge(road, r.tape, arrowBlock('right'));
    expect(r.verdict).toBe('complete');
    expect(judge(road, r.tape, arrowBlock('right')).verdict).toBe('full');
  });

  it('a real repeat with one → fills the rest of a turbo straight; it is offered only there, with the count left', () => {
    const turbo = { road: Array<RoadDir>(5).fill('right'), turbo: true };
    expect(repeatFor({ road, turbo: false }, [])).toBeNull();
    const rep = repeatFor(turbo, [])!;
    expect(rep).toEqual({ t: 'loop', count: 5, body: ['right'] });
    expect(judge(turbo.road, [], rep).verdict).toBe('complete');
    // two arrows placed by hand: the repeat counts the three left
    const two: Program = [arrowBlock('right'), arrowBlock('right')];
    expect(repeatFor(turbo, two)).toEqual({ t: 'loop', count: 3, body: ['right'] });
    expect(judge(turbo.road, two, repeatFor(turbo, two)!).verdict).toBe('complete');
    // one piece left: no repeat (a repeat of one is just an arrow)
    expect(repeatFor(turbo, [...two, arrowBlock('right'), arrowBlock('right')])).toBeNull();
    // single arrows also work, just slower
    let t: Program = [];
    for (let i = 0; i < 5; i++) t = judge(turbo.road, t, arrowBlock('right')).tape;
    expect(filledOf(t)).toBe(5);
  });

  it('a repeat longer than the road, or over a bend, is wrong', () => {
    expect(judge(['right', 'up'], [], { t: 'loop', count: 2, body: ['right'] }).verdict).toBe('wrong');
    expect(judge(['right'], [], { t: 'loop', count: 3, body: ['right'] }).verdict).toBe('wrong');
  });

  it('a tap on a filled slot takes out its block and everything after it', () => {
    const tape: Program = [arrowBlock('right'), arrowBlock('up'), { t: 'loop', count: 3, body: ['right'] }];
    expect(ownerOf(tape, 0)).toBe(0);
    expect(ownerOf(tape, 1)).toBe(1);
    expect(ownerOf(tape, 2)).toBe(2);
    expect(ownerOf(tape, 4)).toBe(2);
    expect(ownerOf(tape, 5)).toBeNull();
    expect(cutAt(tape, 1)).toEqual([arrowBlock('right')]);
    expect(cutAt(tape, 3)).toEqual([arrowBlock('right'), arrowBlock('up')]);
    expect(cutAt(tape, 9)).toBe(tape);
  });
});

describe('the course', () => {
  const race: RaceDef = { tier: 1, seed: 1, stretches: [{ road: ['right'], turbo: false }, { road: ['up', 'up'], turbo: false }, { road: ['down'], turbo: false }] };
  const c = courseOf(race);

  it('lays a flat lead-in, each stretch with a connector after it, the finish and the run-out', () => {
    expect(c.starts).toEqual([1, 3, 6]);
    expect(c.ends).toEqual([2, 5, 7]);
    expect(c.finish).toBe(7 + CONNECTOR);
    expect(c.length).toBe(c.finish + RUN_OUT);
    expect(c.heights.slice(0, 9)).toEqual([0, 0, 0, 0, 1, 2, 2, 1, 1]);
  });

  it('tells the height and the slope anywhere', () => {
    expect(heightAt(c, 3.5)).toBeCloseTo(0.5);
    expect(heightAt(c, -2)).toBe(0);
    expect(heightAt(c, 999)).toBe(1);
    expect(slopeAt(c, 3.2)).toBe(1);
    expect(slopeAt(c, 6.5)).toBe(-1);
    expect(slopeAt(c, 0.5)).toBe(0);
  });

  it('a right block nudges the kart a little; it never reaches the stretch end before the zoom', () => {
    expect(restingSpot(c, 1, 0)).toBe(3);
    expect(restingSpot(c, 1, 1)).toBeCloseTo(3 + LURCH);
    const long = courseOf({ tier: 3, seed: 1, stretches: [{ road: Array<RoadDir>(6).fill('right'), turbo: true }] });
    expect(restingSpot(long, 0, 5)).toBeLessThan(long.ends[0]);
    expect(restingSpot(c, 0, 1)).toBeLessThan(c.ends[0]);
  });
});

// ------------------------------------------------------------------ the rubber band, played out

interface Sim { crossAt: number; rivalsAtCross: number[]; maxLead: number; idleMove: number; total: number; margins: number[] }

/**
 * A scripted child on a whole race (dt 50 ms): thinks `think(k, i)` seconds
 * before each block (all right), lurches, then zooms through the stretch and
 * its connector; an optional long pause mid-race. The rivals step with the
 * real band. Returns when the child crossed, where the rivals were, the
 * biggest lead a rival ever had, and how far they moved while the child was
 * idle.
 */
function simulate(race: RaceDef, think: (k: number, i: number) => number, pause?: { k: number; s: number }): Sim {
  const c = courseOf(race);
  const dt = 0.05;
  let t = 0;
  let me = 1;
  const rivals = [...RIVAL_START];
  const samples: { t: number; me: number }[] = [{ t: 0, me }];
  let lastInput = 0;
  let maxLead = -Infinity;
  let idleMove = 0;
  const tick = (zooming: boolean, idleTracked = false) => {
    t += dt;
    samples.push({ t: t * 1000, me });
    const k = c.starts.findIndex((s, i) => me >= s - 1e-9 && me < (c.starts[i + 1] ?? Infinity));
    const inp: BandInput = {
      me, finish: c.finish, pace: paceOf(samples, t * 1000), idleMs: zooming ? 0 : (t - lastInput) * 1000,
      last: k === race.stretches.length - 1, meDone: me >= c.finish,
    };
    for (const role of [0, 1] as const) {
      const before = rivals[role];
      rivals[role] = stepRival(rivals[role], dt, inp, role);
      if (idleTracked) idleMove += rivals[role] - before;
      maxLead = Math.max(maxLead, rivals[role] - me);
    }
  };
  let started = false;
  for (let k = 0; k < race.stretches.length; k++) {
    const len = race.stretches[k].road.length;
    for (let i = 0; i < len; i++) {
      const wait = think(k, i);
      for (let s = 0; s < wait; s += dt) started ? tick(false) : (t += dt);
      started = true;
      lastInput = t;
      if (i < len - 1) me = restingSpot(c, k, i + 1);
      if (pause && pause.k === k && i === 0) {
        for (let s = 0; s < pause.s; s += dt) tick(false, s > 10);
        lastInput = t;
      }
    }
    const to = k + 1 < race.stretches.length ? c.starts[k + 1] : c.finish;
    while (me < to) { me = Math.min(to, me + ZOOM_SPEED * dt); tick(true); }
  }
  const crossAt = t;
  const rivalsAtCross = [...rivals];
  const margins: number[] = [];
  for (let s = 0; s < 6 && margins.length < 2; s += dt) {
    const before = [...rivals];
    tick(true);
    rivals.forEach((r, i) => { if (before[i] < c.finish && r >= c.finish) margins.push(t - crossAt); });
  }
  return { crossAt, rivalsAtCross, maxLead, idleMove, total: t, margins };
}

describe('the rubber band', () => {
  const typical = (k: number, i: number) => 4 + ((k * 3 + i) % 3);
  const races = [generateRace(1, 11), generateRace(2, 23), generateRace(3, 37), generateRace(4, 41)];

  it('the child always crosses first, by a visible margin, at any pace (fast, typical, slow)', () => {
    for (const race of races) {
      for (const think of [() => 0.6, typical, () => 9]) {
        const s = simulate(race, think);
        const c = courseOf(race);
        // the tick the child crosses in already lets them drive on: well behind the line all the same
        for (const r of s.rivalsAtCross) expect(r).toBeLessThan(c.finish - 1);
        expect(s.margins.length).toBe(2);
        // the first critter crosses at least half a second after the child
        expect(Math.min(...s.margins)).toBeGreaterThan(0.5);
      }
    }
  });

  it('a critter leads for a while mid-race at a typical pace (tension), never by more than MAX_LEAD', () => {
    for (const race of races) {
      const s = simulate(race, typical);
      expect(s.maxLead).toBeGreaterThan(0.3);
      expect(s.maxLead).toBeLessThanOrEqual(BAND.maxLead + 1e-9);
    }
  });

  it('an idle child: the critters almost stop (less than one piece in 20 s past the first 10 s)', () => {
    const s = simulate(races[1], typical, { k: 3, s: 30 });
    expect(s.idleMove).toBeLessThan(1);
    expect(s.rivalsAtCross.every((r) => r <= courseOf(races[1]).finish - BAND.finishGap + 1e-9)).toBe(true);
  });

  it('tunes a tier-1 race to about a minute for a typical 1ro child (4–6 s an arrow; the intro, the stretches appearing and the finish add about 10 s on screen)', () => {
    const s = simulate(races[0], typical);
    expect(s.crossAt).toBeGreaterThan(35);
    expect(s.crossAt).toBeLessThan(90);
  });

  it("the critters' offsets: a lead window mid-race, behind in the last stretch", () => {
    expect(rivalOffset(0, 0.4, false)).toBeGreaterThan(0);
    expect(rivalOffset(0, 0.1, false)).toBeLessThan(0);
    expect(rivalOffset(1, 0.6, false)).toBeGreaterThan(0);
    expect(rivalOffset(0, 0.4, true)).toBeLessThan(0);
    expect(rivalOffset(1, 0.6, true)).toBeLessThan(0);
  });

  it('a critter never moves backwards, even when the caps are behind it', () => {
    const inp: BandInput = { me: 3, finish: 20, pace: 0, idleMs: 0, last: true, meDone: false };
    expect(stepRival(10, 0.1, inp, 0)).toBe(10);
  });

  it('the child\'s pace: units over the window', () => {
    const samples = [{ t: 0, me: 1 }, { t: 5000, me: 2 }, { t: 10_000, me: 4 }];
    expect(paceOf(samples, 10_000)).toBeCloseTo(0.3);
    expect(paceOf(samples, 10_000, 5000)).toBeCloseTo(0.4);
    expect(paceOf([{ t: 0, me: 1 }], 1000)).toBe(0);
  });
});

describe('the session\'s race state', () => {
  it('a win adds a cup and the next race is a tier harder', () => {
    expect(afterWin(RACE_START)).toEqual({ cups: 1, raceNo: 0, tier: 2 });
  });

  it('counts the cups from the session\'s progress and never keeps fewer cups, races or tiers than the wins', () => {
    expect(cupsIn({ [`${CUP_PREFIX}1`]: true, [`${CUP_PREFIX}2`]: true, 'pp-l1': true, 'race-1': true })).toBe(2);
    expect(withCups(RACE_START, 2)).toEqual({ cups: 2, raceNo: 2, tier: 3 });
    expect(withCups({ cups: 2, raceNo: 5, tier: 4 }, 1)).toEqual({ cups: 2, raceNo: 5, tier: 4 });
  });

  it('reads a saved state, falling back for anything malformed', () => {
    expect(readSaved({ cups: 3, raceNo: 4, tier: 2 })).toEqual({ cups: 3, raceNo: 4, tier: 2 });
    expect(readSaved(null)).toEqual(RACE_START);
    expect(readSaved({ cups: -1, raceNo: 'x', tier: 0 })).toEqual(RACE_START);
  });
});
