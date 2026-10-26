import { describe, expect, it } from 'vitest';
import { programBuilder, type Program } from './program';
import { RIVAL_ANIMAL, TIERS, nextRival, raceField, raceResult, reasonFor, startTier, tierIndex, type Tier } from './rivals';
import { simulate } from './sim';
import { ALL_TRACKS, COPAS, referenceTimes, rivalTargets, trackById } from './tracks';

describe('nextRival: lose -> the tier below, win -> the tier above', () => {
  it('moves one tier and is clamped at bronze and gold', () => {
    expect(nextRival('silver', true)).toBe('gold');
    expect(nextRival('silver', false)).toBe('bronze');
    expect(nextRival('gold', true)).toBe('gold');
    expect(nextRival('bronze', false)).toBe('bronze');
    expect(nextRival('bronze', true)).toBe('silver');
    expect(nextRival('gold', false)).toBe('silver');
  });

  it('with no previous rival it starts from bronze', () => {
    expect(nextRival(null, true)).toBe('silver');
    expect(nextRival(undefined, false)).toBe('bronze');
  });

  it('a child whose program is as good as silver settles around silver and gold; a gold program ends on gold; a bronze program on bronze', () => {
    for (const track of ALL_TRACKS) {
      const t = referenceTimes(track);
      const play = (ms: number, start: Tier) => {
        let rival = start;
        const seen: Tier[] = [];
        for (let i = 0; i < 8; i++) {
          const won = ms < rivalTargets(track)[rival];
          rival = nextRival(rival, won);
          seen.push(rival);
        }
        return seen;
      };
      expect(play(t.gold, 'bronze').slice(-3), track.id).toEqual(['gold', 'gold', 'gold']);
      expect(new Set(play(t.silver, 'bronze').slice(-4)), track.id).toEqual(new Set(['silver', 'gold']));
      expect(new Set(play(t.bronze, 'gold').slice(-4)), track.id).toEqual(new Set(['bronze', 'silver']));
    }
  });
});

describe('startTier', () => {
  it('bronze without a ladder, then silver and gold for a high ceiling', () => {
    expect(startTier(undefined)).toBe('bronze');
    expect(startTier(null)).toBe('bronze');
    expect(startTier(NaN)).toBe('bronze');
    expect(startTier(8)).toBe('bronze'); // the 4to class's median
    expect(startTier(10)).toBe('silver');
    expect(startTier(14)).toBe('silver');
    expect(startTier(15)).toBe('gold');
    expect(startTier(18)).toBe('gold');
  });
});

describe('the field and the animals', () => {
  it('the rival and its neighbour race with the child', () => {
    expect(raceField('bronze')).toEqual(['bronze', 'silver']);
    expect(raceField('silver')).toEqual(['silver', 'gold']);
    expect(raceField('gold')).toEqual(['gold', 'silver']);
  });

  it('one animal per tier, the fox on gold', () => {
    expect(RIVAL_ANIMAL.gold).toBe('zorro');
    expect(new Set(TIERS.map((t) => RIVAL_ANIMAL[t])).size).toBe(3);
    expect(TIERS.map(tierIndex)).toEqual([0, 1, 2]);
  });
});

describe('raceResult', () => {
  it('a reference program beats exactly the rivals below its own tier and its own', () => {
    for (const track of ALL_TRACKS) {
      for (const own of TIERS) {
        const sim = simulate(track.refs[own], track, 4);
        for (const rival of TIERS) {
          const res = raceResult(sim, track, rival);
          expect(res.won, `${track.id}: ${own} program vs ${rival}`).toBe(tierIndex(own) >= tierIndex(rival));
          expect(res.beaten).toEqual(TIERS.filter((t) => tierIndex(t) <= tierIndex(own)));
          expect(res.marginMs).toBe(Math.round(rivalTargets(track)[rival] - sim.timeMs));
          expect(res.rival).toBe(rival);
        }
      }
    }
  });

  it('the place is among the child and the two animals racing', () => {
    const t = trackById('c3-a')!;
    const gold = simulate(t.refs.gold, t, 1);
    const bronze = simulate(t.refs.bronze, t, 1);
    expect(raceResult(gold, t, 'silver').place).toBe(1);
    expect(raceResult(bronze, t, 'silver').place).toBe(3);
    expect(raceResult(simulate(t.refs.silver, t, 1), t, 'bronze').place).toBe(1);
    expect(raceResult(simulate(t.refs.silver, t, 1), t, 'silver').place).toBe(2); // gold is faster
    expect(raceResult(simulate(t.refs.silver, t, 1), t, 'gold').place).toBe(2); // the field is gold and silver: it beats silver's target, not gold's
  });

  it('a crash or a program that stops early loses, last, with no margin', () => {
    const t = trackById('c1-a')!;
    const crash = raceResult(simulate(t.deer.program, t, 1), t, 'bronze');
    expect(crash).toMatchObject({ won: false, place: 3, marginMs: null, beaten: [], reason: 'crash' });
    const stuck = raceResult(simulate({ main: [] }, t, 1), t, 'bronze');
    expect(stuck).toMatchObject({ won: false, place: 3, reason: 'stuck' });
  });

  it('the reason is truthful: skids, nitro left unused, jumps for nothing', () => {
    const skidTrack = trackById('c3-b')!;
    expect(raceResult(simulate(skidTrack.refs.bronze, skidTrack, 2), skidTrack, 'gold').reason).toBe('skids');
    expect(raceResult(simulate(skidTrack.refs.silver, skidTrack, 2), skidTrack, 'gold').reason).toBe('wasted_jumps');
    const gp = trackById('c5-a')!;
    expect(raceResult(simulate(gp.refs.silver, gp, 2), gp, 'gold').reason).toBe('no_turbo');
    expect(raceResult(simulate(gp.refs.gold, gp, 2), gp, 'gold').reason).toBe('fast_and_clean');
    const b = programBuilder('s');
    const sputter: Program = { main: [b.repeat('laps', [b.repeat(gp.tiles.length, [b.iff('puddle_ahead', [b.jump()], [b.turbo()])])])], onLog: gp.refs.gold.onLog };
    expect(raceResult(simulate(sputter, gp, 2), gp, 'gold').reason).toBe('sputters');
  });

  it('winning is always "fast and clean", whatever else the run did', () => {
    const t = trackById('c1-b')!;
    expect(reasonFor(simulate(t.refs.bronze, t, 1), t, true)).toBe('fast_and_clean');
  });

  it('a lost race that finished with nothing to blame is just slow', () => {
    const t = trackById('c1-a')!;
    const b = programBuilder('w');
    const slow: Program = { main: [b.wait(9), ...t.refs.gold.main] };
    const sim = simulate(slow, t, 1);
    expect(sim.outcome).toBe('finish');
    expect(raceResult(sim, t, 'bronze')).toMatchObject({ won: false, reason: 'slow' });
  });

  it('every copa has tracks whose gold rival can really win and lose (targets are distinct and ordered)', () => {
    for (const c of COPAS) for (const t of c.tracks) {
      const g = rivalTargets(t);
      expect(g.gold).toBeLessThan(g.silver);
      expect(g.silver).toBeLessThan(g.bronze);
    }
  });
});
