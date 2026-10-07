import { describe, expect, it } from 'vitest';
import { dueForNudge, IDLE_NUDGE_MS, IDLE_NUDGE_REPEAT_MS } from './idleNudge';

describe('the idle nudge (T20, muted only): due after ~15s, then repeats every ~4s', () => {
  it('not due before the threshold', () => {
    expect(dueForNudge(IDLE_NUDGE_MS - 1, 0, 0)).toBe(false);
  });

  it('due right at the threshold, with no earlier nudge', () => {
    expect(dueForNudge(IDLE_NUDGE_MS, 0, 0)).toBe(true);
  });

  it('due again only after the repeat gap since the last nudge, even if idle for longer', () => {
    const firstNudgeAt = IDLE_NUDGE_MS;
    expect(dueForNudge(firstNudgeAt + IDLE_NUDGE_REPEAT_MS - 1, 0, firstNudgeAt)).toBe(false);
    expect(dueForNudge(firstNudgeAt + IDLE_NUDGE_REPEAT_MS, 0, firstNudgeAt)).toBe(true);
  });

  it('fresh input resets the clock (not due right after)', () => {
    const now = 100_000;
    expect(dueForNudge(now, now - 1000, 0)).toBe(false);
  });
});
