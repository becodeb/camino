import { describe, expect, it } from 'vitest';
import { DANCE_MAX_TIER, POSES, danceRound, danceSequence, judgeStep, lengthOf } from './dance';
import { rng } from '../../ink/ink.js';

describe('T45: copiá el baile', () => {
  it('a dance grows by one pose per tier, from 1 (T52: a trivial first round) up to 7', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(lengthOf)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(lengthOf(0)).toBe(1);
    expect(lengthOf(99)).toBe(lengthOf(DANCE_MAX_TIER));
  });

  it('never the same pose twice in a row, only known poses', () => {
    for (let seed = 1; seed < 300; seed++) {
      for (let tier = 1; tier <= DANCE_MAX_TIER; tier++) {
        const { seq } = danceRound(tier, seed);
        expect(seq).toHaveLength(lengthOf(tier));
        for (let i = 0; i < seq.length; i++) {
          expect(POSES).toContain(seq[i]);
          if (i) expect(seq[i]).not.toBe(seq[i - 1]);
        }
      }
    }
  });

  it('the next round keeps the dance the child knows and adds one pose', () => {
    const r1 = danceRound(1, 7);
    expect(r1.seq).toHaveLength(1);
    const r2 = danceRound(2, 99, r1.seq);
    expect(r2.seq.slice(0, 1)).toEqual(r1.seq);
    expect(r2.seq).toHaveLength(2);
    const r3 = danceRound(3, 5, r2.seq);
    expect(r3.seq.slice(0, 2)).toEqual(r2.seq);
    expect(r3.seq).toHaveLength(3);
    // a dance as long or longer is not a prefix: a fresh one
    expect(danceRound(3, 3, ['up', 'star', 'squat', 'flamingo'])).toHaveProperty('seq.length', 3);
  });

  it('danceSequence keeps the prefix and avoids repeats after it', () => {
    const s = danceSequence(5, rng(3), ['up', 'up']);
    expect(s.slice(0, 2)).toEqual(['up', 'up']);
    expect(s[2]).not.toBe('up');
    expect(danceSequence(2, rng(1), ['star', 'squat', 'up'])).toEqual(['star', 'squat']);
  });

  it('judges each tap: right so far, done at the end, a miss names the pose', () => {
    const seq = ['up', 'star', 'squat'] as const;
    expect(judgeStep(seq, [])).toEqual({ ok: true, done: false });
    expect(judgeStep(seq, ['up'])).toEqual({ ok: true, done: false });
    expect(judgeStep(seq, ['up', 'star'])).toEqual({ ok: true, done: false });
    expect(judgeStep(seq, ['up', 'star', 'squat'])).toEqual({ ok: true, done: true });
    expect(judgeStep(seq, ['star'])).toEqual({ ok: false, at: 0 });
    expect(judgeStep(seq, ['up', 'flamingo'])).toEqual({ ok: false, at: 1 });
    expect(judgeStep(seq, ['up', 'star', 'squat', 'up'])).toEqual({ ok: false, at: 2 });
  });
});
