import { describe, expect, it } from 'vitest';
import { gradeFromUrl } from './gradeParam';

describe('?grado= (also ?grade=) preselects the grade (T19)', () => {
  it('accepts 1 to 5, either spelling, among other params', () => {
    expect(gradeFromUrl('?grado=3')).toBe(3);
    expect(gradeFromUrl('?debug&grado=1')).toBe(1);
    expect(gradeFromUrl('?grado=1&sonido=no')).toBe(1);
    expect(gradeFromUrl('?grade=5')).toBe(5);
  });

  it('falls back to the cards (null) outside 1..5, or with no param', () => {
    expect(gradeFromUrl('?grado=0')).toBeNull();
    expect(gradeFromUrl('?grado=6')).toBeNull();
    expect(gradeFromUrl('?grado=-1')).toBeNull();
    expect(gradeFromUrl('?grado=abc')).toBeNull();
    expect(gradeFromUrl('?grado=')).toBeNull();
    expect(gradeFromUrl('')).toBeNull();
    expect(gradeFromUrl('?debug')).toBeNull();
  });
});
