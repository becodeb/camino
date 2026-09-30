import { describe, expect, it } from 'vitest';
import { PRIMER } from '../curriculum/primer';
import { LEVELS } from '../game/levels';
import { WORKSHOP_LINES } from '../screens/WorkshopScreen';
import { withName } from './characterName';

/** Every sheet line, page title and page instruction of 1ro's year and the demo, and the workshop's lines. */
function allLines(): string[] {
  const out: string[] = [];
  for (const s of PRIMER) {
    out.push(s.title, s.say);
    for (const c of s.core) out.push(c.level.title, c.level.say);
    if (s.boss) out.push(s.boss.title, s.boss.say);
  }
  for (const l of LEVELS) out.push(l.title, l.say);
  out.push(...Object.values(WORKSHOP_LINES));
  return out.filter((t) => t.includes('Brote'));
}

describe('the chosen character\'s name in the lines', () => {
  it('says the name instead of Brote', () => {
    expect(withName('Llevá a Brote hasta la semilla.', 'mina')).toBe('Llevá a Mina hasta la semilla.');
    expect(withName('¿Dónde va a terminar Brote? Tocá ese lugar.', 'pliegue')).toBe('¿Dónde va a terminar Pliegue? Tocá ese lugar.');
    expect(withName('Mi primer juego: cuando aprieto una flecha, Brote se mueve', 'ovillo')).toBe('Mi primer juego: cuando aprieto una flecha, Ovillo se mueve');
  });

  it('leaves the lines alone for Brote, an unknown character, or a line without the name', () => {
    const line = 'Brote se confundió de camino. ¿Lo ayudás a arreglarlo?';
    expect(withName(line, 'brote')).toBe(line);
    expect(withName(line, 'nadie')).toBe(line);
    expect(withName(line, null)).toBe(line);
    expect(withName('¿Lo ayudás?', 'mina')).toBe('¿Lo ayudás?');
    // only the whole word
    expect(withName('Los Brotes del bosque', 'mina')).toBe('Los Brotes del bosque');
  });

  it('makes the words that agree with the character agree (Mina is "la")', () => {
    expect(withName('Brote se confundió de camino. ¿Lo ayudás a arreglarlo?', 'mina')).toBe('Mina se confundió de camino. ¿La ayudás a arreglarlo?');
    expect(withName('Brote se confundió de camino. ¿Lo ayudás a arreglarlo?', 'ovillo')).toBe('Ovillo se confundió de camino. ¿Lo ayudás a arreglarlo?');
  });

  it('leaves no Brote in any line of 1ro\'s year or the demo, for every other character', () => {
    const lines = allLines();
    expect(lines.length).toBeGreaterThan(20);
    for (const id of ['mina', 'pliegue', 'ovillo']) {
      for (const t of lines) {
        const out = withName(t, id);
        expect(out).not.toMatch(/\bBrote\b/);
        if (id === 'mina') expect(out).not.toMatch(/¿Lo ayudás/);
      }
    }
  });
});
