import { describe, expect, it } from 'vitest';
import { isLateEndClass, LATE_END_CLASS_MS } from './classroom';

describe('isLateEndClass (T28)', () => {
  const sent = '2026-10-13T12:00:00.000Z';
  const sentMs = Date.parse(sent);

  it('is not late right away, or just under the threshold', () => {
    expect(isLateEndClass(sent, sentMs)).toBe(false);
    expect(isLateEndClass(sent, sentMs + LATE_END_CLASS_MS)).toBe(false);
  });

  it('is late past the threshold (a device asleep when the command was sent, waking up for the next class)', () => {
    expect(isLateEndClass(sent, sentMs + LATE_END_CLASS_MS + 1)).toBe(true);
    expect(isLateEndClass(sent, sentMs + 25 * 60_000)).toBe(true); // the real class-1 data: 24-26 min late
  });

  it('a custom threshold is honoured', () => {
    expect(isLateEndClass(sent, sentMs + 1000, 500)).toBe(true);
    expect(isLateEndClass(sent, sentMs + 1000, 2000)).toBe(false);
  });

  it('an unparsable `at` is never treated as late', () => {
    expect(isLateEndClass('not a date', sentMs)).toBe(false);
    expect(isLateEndClass('', sentMs)).toBe(false);
  });
});
