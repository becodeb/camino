import { describe, expect, it } from 'vitest';
import { DIFFICULTY_DOOR } from './surveyArt';

describe('the difficulty question\'s hills (T23)', () => {
  it('reads flat → gentle → steep for fácil → más o menos → difícil, left to right', () => {
    // PathArt's own door names describe "¿Cómo seguís?"'s path chosen, not this question's
    // effort scale: `medium` is its flattest path (least climb), `easy` its gentle one.
    expect(DIFFICULTY_DOOR.easy).toBe('medium'); // fácil: flat
    expect(DIFFICULTY_DOOR.mid).toBe('easy'); // más o menos: a gentle hill
    expect(DIFFICULTY_DOOR.hard).toBe('hard'); // difícil: steep
  });

  it('every difficulty value maps to a distinct hill (no two answers draw the same picture)', () => {
    const doors = Object.values(DIFFICULTY_DOOR);
    expect(new Set(doors).size).toBe(doors.length);
  });
});
