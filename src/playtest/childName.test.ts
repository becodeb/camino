import { describe, expect, it } from 'vitest';
import { MAX_CHILD_NAME_CHARS, nameParamFromUrl, nameScreenOn, normalizeChildName } from './childName';

describe('normalizeChildName', () => {
  it('trims and collapses inner whitespace', () => {
    expect(normalizeChildName('  Sofía   Pérez  ')).toBe('Sofía Pérez');
  });

  it('keeps letters (accented, Ñ/ñ), spaces, apostrophes and hyphens', () => {
    expect(normalizeChildName("D'Angelo")).toBe("D'Angelo");
    expect(normalizeChildName('Jean-Paul')).toBe('Jean-Paul');
    expect(normalizeChildName('Toño')).toBe('Toño');
    expect(normalizeChildName('Ñandú')).toBe('Ñandú');
  });

  it('strips digits, punctuation and anything else, without rejecting the whole name', () => {
    expect(normalizeChildName('S0f1a!!')).toBe('Sfa');
    expect(normalizeChildName('<script>Mimi</script>')).toBe('scriptMimiscript');
    expect(normalizeChildName('🦊 Zorro')).toBe('Zorro');
  });

  it('caps at MAX_CHILD_NAME_CHARS', () => {
    const long = 'A'.repeat(MAX_CHILD_NAME_CHARS + 10);
    expect(normalizeChildName(long)).toHaveLength(MAX_CHILD_NAME_CHARS);
  });

  it('is empty when nothing usable is left', () => {
    expect(normalizeChildName('   ')).toBe('');
    expect(normalizeChildName('123!!!')).toBe('');
    expect(normalizeChildName('')).toBe('');
  });
});

describe('nameParamFromUrl', () => {
  it('reads ?nombre=si or ?nombre=no, case-insensitively, from grado= or grade=-shaped queries too', () => {
    expect(nameParamFromUrl('?grado=4&nombre=si')).toBe('si');
    expect(nameParamFromUrl('?nombre=NO')).toBe('no');
    expect(nameParamFromUrl('?grado=4')).toBeNull();
    expect(nameParamFromUrl('')).toBeNull();
    expect(nameParamFromUrl('?nombre=maybe')).toBeNull();
  });
});

describe('nameScreenOn', () => {
  it('is on by default for 4to and 5to only', () => {
    expect(nameScreenOn(1, null)).toBe(false);
    expect(nameScreenOn(2, null)).toBe(false);
    expect(nameScreenOn(3, null)).toBe(false);
    expect(nameScreenOn(4, null)).toBe(true);
    expect(nameScreenOn(5, null)).toBe(true);
  });

  it('?nombre=si turns it on for any grade; ?nombre=no turns it off, even 4to/5to', () => {
    expect(nameScreenOn(1, 'si')).toBe(true);
    expect(nameScreenOn(3, 'si')).toBe(true);
    expect(nameScreenOn(4, 'no')).toBe(false);
    expect(nameScreenOn(5, 'no')).toBe(false);
  });
});
