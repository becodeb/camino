import { describe, expect, it } from 'vitest';
import {
  afterRace, completeDeer, completeTrack, copaDone, copasFinished, copaStart, currentStep, deerCanGiveUp, deerGhostOn, deerSetup,
  enterCopa, ghostOn, medalOf, newJourney, offerSkip, parseJourney, placementCopa, programFor, recordDeerRun, recordRun, setProgram,
  skipCopa, spiedProgram, stepsOf, trickIds,
} from './journey';
import { programBuilder, slotCount, type Block, type Program } from './program';
import { simulate } from './sim';
import { ALL_TRACKS, COPAS, TIERS, copaOf, type CopaId } from './tracks';

const prog = (...kinds: ('forward' | 'jump')[]): Program => {
  const b = programBuilder('t');
  return { main: kinds.map((k) => (k === 'jump' ? b.jump() : b.forward())) };
};
const finish = (place: 1 | 2 | 3 = 1, beaten: ('bronze' | 'silver' | 'gold')[] = ['bronze', 'silver', 'gold'], timeMs = 5000) => ({ outcome: 'finish' as const, place, beaten, timeMs });

describe('placementCopa: the ladder ceiling picks the starting copa, never later than 3', () => {
  it('maps the ceiling rung', () => {
    expect(placementCopa(null)).toBe(1);
    expect(placementCopa(undefined)).toBe(1);
    expect(placementCopa(Number.NaN)).toBe(1);
    expect(placementCopa(0)).toBe(1);
    expect(placementCopa(4)).toBe(1);
    expect(placementCopa(5)).toBe(2); // passed `repeat`
    expect(placementCopa(8)).toBe(2); // the 2026-10-20 class's median ceiling
    expect(placementCopa(9)).toBe(3); // passed conditions
    expect(placementCopa(15)).toBe(3); // if/else: still copa 3
    expect(placementCopa(18)).toBe(3);
  });

  it('a new journey starts in the placed copa with the ladder rival', () => {
    expect(newJourney(8)).toMatchObject({ startCopa: 2, copa: 2, step: 0, rival: 'bronze', ceiling: 8 });
    expect(newJourney(12)).toMatchObject({ startCopa: 3, copa: 3, rival: 'silver' });
    expect(newJourney(16)).toMatchObject({ startCopa: 3, rival: 'gold' });
    expect(newJourney(null)).toMatchObject({ startCopa: 1, copa: 1, rival: 'bronze', ceiling: null });
  });
});

describe('the steps of a copa', () => {
  it('copa 1 has only tracks; copas 2 to 5 start with Ayudá al ciervo', () => {
    expect(stepsOf(1).map((s) => s.kind)).toEqual(['track', 'track', 'track']);
    for (const c of [2, 3, 4, 5] as CopaId[]) {
      const steps = stepsOf(c);
      expect(steps[0]).toEqual({ kind: 'deer', copa: c });
      expect(steps.length).toBe(1 + copaOf(c).tracks.length);
    }
  });
});

describe('progress: a track is done when it is finished, in any place', () => {
  it('moves to the next step and the copa finishes after its last track', () => {
    let j = newJourney(null);
    for (const t of COPAS[0].tracks) {
      expect(currentStep(j)).toMatchObject({ kind: 'track', track: { id: t.id } });
      j = completeTrack(recordRun(j, t.id, finish(3, ['bronze'])).journey, t.id);
    }
    expect(copaDone(j, 1)).toBe(true);
    expect(j.step).toBe(stepsOf(1).length);
    expect(currentStep(j)).toBeNull();
  });

  it('losing (a 3rd place with no tier beaten) never blocks', () => {
    const j = completeTrack(recordRun(newJourney(null), 'c1-a', finish(3, [])).journey, 'c1-a');
    expect(j.tracks['c1-a']).toMatchObject({ done: true, bestPlace: 3, medal: null });
    expect(j.step).toBe(1);
  });

  it('crashes do not finish a track: runs and fails count, nothing is done', () => {
    let j = newJourney(null);
    j = recordRun(j, 'c1-a', { outcome: 'crash' }).journey;
    expect(j.tracks['c1-a']).toMatchObject({ done: false, runs: 1, fails: 1, failStreak: 1 });
    expect(copaDone(j, 1)).toBe(false);
  });

  it('keeps the best place, the best time and the best medal over the revanchas', () => {
    let j = newJourney(null);
    j = recordRun(j, 'c1-a', finish(3, ['bronze'], 9000)).journey;
    j = recordRun(j, 'c1-a', finish(1, ['bronze', 'silver', 'gold'], 6000)).journey;
    j = recordRun(j, 'c1-a', finish(2, ['bronze', 'silver'], 7000)).journey;
    expect(j.tracks['c1-a']).toMatchObject({ bestPlace: 1, bestMs: 6000, medal: 'gold', runs: 3 });
  });

  it('medalOf is the best tier beaten', () => {
    expect(medalOf(['bronze', 'silver', 'gold'])).toBe('gold');
    expect(medalOf(['bronze', 'silver'])).toBe('silver');
    expect(medalOf(['bronze'])).toBe('bronze');
    expect(medalOf([])).toBeNull();
  });

  it('copa 2 onward: the deer comes first, and after the deer the first track', () => {
    let j = newJourney(8);
    expect(currentStep(j)).toEqual({ kind: 'deer', copa: 2 });
    j = completeDeer(j, 2, true, 5000);
    expect(currentStep(j)).toMatchObject({ kind: 'track', track: { id: 'c2-a' } });
    expect(j.deer[2]).toMatchObject({ done: true, fixed: true });
  });

  it('going back to a finished copa lands on its first track to play it again', () => {
    let j = newJourney(null);
    for (const t of COPAS[0].tracks) j = completeTrack(j, t.id);
    j = enterCopa(j, 2);
    expect(currentStep(j)).toEqual({ kind: 'deer', copa: 2 });
    j = enterCopa(j, 1);
    expect(currentStep(j)).toMatchObject({ kind: 'track', track: { id: 'c1-a' } });
  });
});

describe('Arcade and survey triggers: copas finished', () => {
  it('copa 2 finished (the Arcade) and copa 3 finished (the survey)', () => {
    let j = newJourney(null);
    expect(copasFinished(j)).toBe(0);
    for (const t of COPAS[0].tracks) j = completeTrack(j, t.id);
    expect(copasFinished(j)).toBe(1);
    for (const t of COPAS[1].tracks) j = completeTrack(j, t.id);
    expect(copasFinished(j)).toBe(2);
    for (const t of COPAS[2].tracks) j = completeTrack(j, t.id);
    expect(copasFinished(j)).toBe(3);
  });

  it('a child placed at copa 3 reaches the survey trigger by finishing copa 3 alone', () => {
    let j = newJourney(10);
    for (const t of COPAS[2].tracks) j = completeTrack(j, t.id);
    expect(copasFinished(j)).toBe(3);
  });

  it('a skipped copa counts as finished', () => {
    let j = newJourney(null);
    j = completeTrack(recordRun(j, 'c1-a', finish()).journey, 'c1-a');
    j = skipCopa(j, 1);
    expect(copaDone(j, 1)).toBe(true);
    expect(j.copa).toBe(2);
  });
});

describe('skip: the first track of the copa, on the first run, beating at least silver', () => {
  const first = (beaten: ('bronze' | 'silver' | 'gold')[], pre?: (j: ReturnType<typeof newJourney>) => ReturnType<typeof newJourney>) => {
    let j = newJourney(null);
    if (pre) j = pre(j);
    j = recordRun(j, 'c1-a', finish(1, beaten)).journey;
    return offerSkip(j, { trackId: 'c1-a', beaten });
  };

  it('is offered on a first-run silver or gold finish of the first track', () => {
    expect(first(['bronze', 'silver'])).toBe(true);
    expect(first(['bronze', 'silver', 'gold'])).toBe(true);
  });

  it('is not offered when only bronze was beaten, or nothing', () => {
    expect(first(['bronze'])).toBe(false);
    expect(first([])).toBe(false);
  });

  it('is not offered after a crash first, nor on a second run', () => {
    expect(first(['bronze', 'silver'], (j) => recordRun(j, 'c1-a', { outcome: 'crash' }).journey)).toBe(false);
    expect(first(['bronze', 'silver'], (j) => recordRun(j, 'c1-a', finish(3, ['bronze'])).journey)).toBe(false);
  });

  it('is not offered on the second track of a copa, nor in copa 5, nor twice', () => {
    let j = newJourney(null);
    j = recordRun(j, 'c1-b', finish()).journey;
    expect(offerSkip(j, { trackId: 'c1-b', beaten: ['bronze', 'silver', 'gold'] })).toBe(false);
    let k = newJourney(null);
    k = recordRun(k, 'c5-a', finish()).journey;
    expect(offerSkip(k, { trackId: 'c5-a', beaten: ['bronze', 'silver', 'gold'] })).toBe(false);
    let m = newJourney(null);
    m = recordRun(m, 'c1-a', finish()).journey;
    m = skipCopa(m, 1);
    expect(offerSkip(m, { trackId: 'c1-a', beaten: ['bronze', 'silver', 'gold'] })).toBe(false);
  });

  it('skipCopa never goes past copa 5', () => {
    const j = newJourney(null);
    expect(skipCopa(j, 5)).toBe(j);
  });
});

describe('the rival tier follows the results', () => {
  it('starts from the ladder, down after a loss, up after a win, clamped', () => {
    let j = newJourney(12); // silver
    expect(j.rival).toBe('silver');
    j = afterRace(j, true);
    expect(j.rival).toBe('gold');
    j = afterRace(j, true);
    expect(j.rival).toBe('gold');
    j = afterRace(j, false);
    expect(j.rival).toBe('silver');
    j = afterRace(afterRace(afterRace(j, false), false), false);
    expect(j.rival).toBe('bronze');
  });
});

describe('the ghost hand: two failed runs in a row on the same track', () => {
  it('turns on at the second failed run (crash, stuck or timeout) and off after a finish', () => {
    let j = newJourney(null);
    let r = recordRun(j, 'c1-a', { outcome: 'crash' });
    expect(r.ghostNow).toBe(false);
    expect(ghostOn(r.journey, 'c1-a')).toBe(false);
    r = recordRun(r.journey, 'c1-a', { outcome: 'stuck' });
    expect(r.ghostNow).toBe(true);
    expect(ghostOn(r.journey, 'c1-a')).toBe(true);
    r = recordRun(r.journey, 'c1-a', { outcome: 'timeout' });
    expect(r.ghostNow).toBe(false); // already on: logged once
    expect(ghostOn(r.journey, 'c1-a')).toBe(true);
    r = recordRun(r.journey, 'c1-a', finish());
    expect(ghostOn(r.journey, 'c1-a')).toBe(false);
    expect(r.journey.tracks['c1-a'].ghost).toBe(true); // it was used: the report reads this
    j = r.journey;
    expect(ghostOn(j, 'c1-b')).toBe(false); // per track
  });

  it('a failure, a finish and a failure never add up', () => {
    let j = newJourney(null);
    j = recordRun(j, 'c1-a', { outcome: 'crash' }).journey;
    j = recordRun(j, 'c1-a', finish()).journey;
    j = recordRun(j, 'c1-a', { outcome: 'crash' }).journey;
    expect(ghostOn(j, 'c1-a')).toBe(false);
  });

  it('the deer: ghost after 2 failures, giving up after 4', () => {
    let j = newJourney(8);
    let r = recordDeerRun(j, 2, 'crash', 1000);
    r = recordDeerRun(r.journey, 2, 'crash', 2000);
    expect(r.ghostNow).toBe(true);
    expect(deerGhostOn(r.journey, 2)).toBe(true);
    expect(deerCanGiveUp(r.journey, 2)).toBe(false);
    r = recordDeerRun(r.journey, 2, 'stuck', 3000);
    r = recordDeerRun(r.journey, 2, 'crash', 4000);
    expect(deerCanGiveUp(r.journey, 2)).toBe(true);
    j = completeDeer(r.journey, 2, false, 9000);
    expect(j.deer[2]).toMatchObject({ done: true, fixed: false, runs: 4, ms: 8000 });
  });
});

describe('the growing program', () => {
  const copa3Program = (): Program => {
    const b = programBuilder('p');
    return { main: [b.repeat(10, [b.iff('puddle_ahead', [b.jump()], [b.forward()])])] };
  };

  it('within a copa the program carries from track to track', () => {
    let j = newJourney(8);
    const p = prog('forward', 'jump');
    j = setProgram(j, 'c2-a', p);
    expect(programFor(j, 'c2-a').program).toEqual(p);
    expect(programFor(j, 'c2-b').program).toEqual(p);
    j = setProgram(j, 'c2-b', prog('jump'));
    expect(programFor(j, 'c2-c').program).toEqual(prog('jump'));
    expect(programFor(j, 'c2-b').program).toEqual(prog('jump'));
  });

  it('1 -> 2 and 2 -> 3 start empty and show the previous program as a reference', () => {
    let j = newJourney(null);
    const p1 = prog('forward', 'forward', 'jump');
    j = completeTrack(setProgram(j, 'c1-c', p1), 'c1-c');
    j = enterCopa(j, 2);
    expect(programFor(j, 'c2-a')).toEqual({ program: { main: [] }, reference: p1 });
    // only the first track of the copa shows it, and it stays while the child builds on that track
    expect(programFor(j, 'c2-b').reference).toBeNull();
    j = setProgram(j, 'c2-a', prog('jump'));
    expect(programFor(j, 'c2-a')).toEqual({ program: prog('jump'), reference: p1 });
    expect(programFor(j, 'c2-b').reference).toBeNull();
    // 2 -> 3: the same
    const p2 = prog('jump', 'forward');
    j = enterCopa(setProgram(j, 'c2-c', p2), 3);
    expect(programFor(j, 'c3-a')).toEqual({ program: { main: [] }, reference: p2 });
  });

  it('3 -> 4 and 4 -> 5 carry the main program (and copa 4\'s event script on to 5)', () => {
    let j = newJourney(10);
    const p3 = copa3Program();
    j = enterCopa(setProgram(j, 'c3-c', p3), 4);
    expect(programFor(j, 'c4-a')).toEqual({ program: p3, reference: null });
    const b = programBuilder('e');
    const p4: Program = { main: p3.main, onLog: b.onLog([b.brake(), b.wait(1)]) };
    j = enterCopa(setProgram(j, 'c4-b', p4), 5);
    expect(programFor(j, 'c5-a')).toEqual({ program: p4, reference: null });
  });

  it('the child\'s own last edit on a track wins, also after a reload (parseJourney keeps it)', () => {
    let j = newJourney(8);
    j = setProgram(j, 'c2-a', prog('jump'));
    const back = parseJourney(JSON.parse(JSON.stringify(j)));
    expect(back).not.toBeNull();
    expect(programFor(back!, 'c2-a').program).toEqual(prog('jump'));
  });

  it('copaStart: copa 1 and an empty previous program have no reference', () => {
    const j = newJourney(null);
    expect(copaStart(j, 1)).toEqual({ program: { main: [] }, reference: null });
    expect(copaStart(j, 2)).toEqual({ program: { main: [] }, reference: null });
    expect(copaStart(j, 4).program).toEqual({ main: [] });
  });

  it('setProgram with the same program changes nothing, and an untouched empty program is not an edit', () => {
    const j = setProgram(newJourney(8), 'c2-a', prog('jump'));
    expect(setProgram(j, 'c2-a', prog('jump'))).toBe(j);
    const fresh = newJourney(8);
    expect(setProgram(fresh, 'c2-a', { main: [] })).toBe(fresh);
    expect(setProgram(j, 'c2-a', { main: [] })).not.toBe(j); // emptied after editing: that is an edit
  });
});

describe('Ayudá al ciervo: the deer\'s program with one spare place', () => {
  it('copa 1 has no deer; copas 2 to 5: memory = the deer\'s program + 1, and the deer never finishes', () => {
    expect(deerSetup(1)).toBeNull();
    for (const c of [2, 3, 4, 5] as CopaId[]) {
      const d = deerSetup(c)!;
      expect(d.slots).toBe(slotCount(d.program) + 1);
      expect(d.track.slots).toBe(d.slots);
      expect(d.track.id).toBe(copaOf(c).tracks[0].id);
      const run = simulate(d.program, d.track, 11);
      expect(run.outcome, `copa ${c}`).not.toBe('finish');
    }
  });

  it('the fixed deer (the fox\'s block on the bug) fits the memory and finishes', () => {
    for (const c of [2, 3, 4, 5] as CopaId[]) {
      const d = deerSetup(c)!;
      const gold = d.track.refs.gold;
      expect(slotCount(gold)).toBeLessThanOrEqual(d.slots);
      expect(simulate(gold, d.track, 3).outcome).toBe('finish');
    }
  });
});

describe('Espiá el programa del zorro: where the trick is', () => {
  const idsIn = (p: Program): string[] => {
    const out: string[] = [];
    const walk = (bs: readonly Block[]) => bs.forEach((b) => { out.push(b.id); if (b.kind === 'repeat') walk(b.body); if (b.kind === 'if') { walk(b.then); walk(b.else); } });
    walk(p.main);
    if (p.onLog) { out.push(p.onLog.id); walk(p.onLog.body); }
    return out;
  };

  it('every track and tier has at least one trick block, and it is in the program', () => {
    for (const track of ALL_TRACKS) {
      for (const tier of TIERS) {
        const ids = trickIds(track, tier);
        expect(ids.length, `${track.id}/${tier}`).toBeGreaterThan(0);
        const inProgram = idsIn(spiedProgram(track, tier));
        for (const id of ids) expect(inProgram, `${track.id}/${tier} ${id}`).toContain(id);
      }
    }
  });

  it('the fox\'s trick is the track\'s trickBlockId (copa 1: every jump over a puddle)', () => {
    for (const track of ALL_TRACKS) {
      const ids = trickIds(track, 'gold');
      if (track.copa === 1) expect(ids.length).toBeGreaterThanOrEqual(1);
      else expect(ids).toEqual([track.trickBlockId]);
      expect(ids).toContain(track.copa === 1 ? ids[0] : track.trickBlockId);
    }
    expect(trickIds(copaOf(4).tracks[0], 'gold')).toEqual([copaOf(4).tracks[0].refs.gold.onLog!.id]);
  });

  it('the spied program is the tier\'s reference', () => {
    const t = copaOf(3).tracks[0];
    expect(spiedProgram(t, 'gold')).toBe(t.refs.gold);
    expect(spiedProgram(t, 'bronze')).toBe(t.refs.bronze);
  });
});

describe('parseJourney', () => {
  it('round-trips a journey and rejects junk', () => {
    let j = newJourney(8);
    j = completeDeer(j, 2, true, 1);
    j = recordRun(j, 'c2-a', finish()).journey;
    expect(parseJourney(JSON.parse(JSON.stringify(j)))).toEqual(j);
    expect(parseJourney(null)).toBeNull();
    expect(parseJourney({ v: 1 })).toBeNull();
    expect(parseJourney({ ...j, rival: 'platinum' })).toBeNull();
    expect(parseJourney({ ...j, copa: 9 })).toBeNull();
  });
});
