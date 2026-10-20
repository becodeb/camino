// "Carrera de teclas" (T41, 4to's Arcade): the pure logic of the typing
// race. The T33 track, karts and rivals are driven by typing: each stretch
// of road is a word or a short phrase of Scratch's Spanish ("mover",
// "por siempre", "cambiar puntos en 1"); every right letter nudges the kart,
// a finished word boosts it to the next stretch, a wrong letter only makes it
// wobble (nothing is lost and nothing needs erasing: the next right key
// carries on). Accents are optional and case does not matter; the space
// between words is required.
//
// Everything here is pure and deterministic (seeded), so it is unit-tested
// (typingRace.test.ts): the word bank by tier, the words of a race, judging a
// key, the road under the words, and the race's numbers (words per minute,
// accuracy).

import { MAX_HEIGHT, rng, type RaceDef, type RoadDir, type Stretch } from './race';

// ------------------------------------------------------------------ the words

/**
 * Programming words and phrases as Scratch 3 says them in Spanish (what 4to
 * met all year and meets in the Workshop). Tiers by length: 1 short words,
 * 2 longer words, 3 two- and three-word phrases, 4 phrases with numbers.
 * No ñ, no punctuation and no minus sign (any keyboard layout types them).
 */
export const WORD_BANK: Readonly<Record<1 | 2 | 3 | 4, readonly string[]>> = {
  1: ['mover', 'girar', 'decir', 'pensar', 'fijar', 'sonido', 'tecla', 'puntos', 'vidas', 'borde', 'ratón', 'clic', 'fondo', 'valor', 'nota', 'lápiz'],
  2: ['repetir', 'esperar', 'mostrar', 'esconder', 'cambiar', 'detener', 'variable', 'mensaje', 'disfraz', 'bandera', 'rebotar', 'posición', 'dirección', 'presionar', 'tocando', 'siempre', 'aleatorio', 'escenario'],
  3: ['por siempre', 'si tocando', 'detener todo', 'enviar mensaje', 'al recibir', 'siguiente disfraz', 'cambiar disfraz', 'tecla espacio', 'al presionar tecla', 'decir hola', 'fijar puntos', 'si no', 'mover pasos', 'esperar hasta que'],
  4: ['mover 10 pasos', 'repetir 10', 'esperar 1 segundos', 'cambiar puntos en 1', 'girar 15 grados', 'cambiar x en 10', 'fijar y a 100', 'fijar vidas a 3', 'esperar 2 segundos', 'cambiar velocidad en 2', 'repetir 5', 'decir hola por 2 segundos'],
};

/** A tier's word list ("¡Otra carrera!" goes one up, endless; 4 and beyond stay as 4). */
export const bankFor = (tier: number) => WORD_BANK[Math.min(4, Math.max(1, Math.floor(tier) || 1)) as 1 | 2 | 3 | 4];

/**
 * How many letters (spaces included) a race of each tier needs at least: a
 * race lasts about 60–90 s for a child typing a letter or so a second (about
 * 10 words per minute, a 9–10 year old looking for each key; the
 * pilot's `typing_race_end.ms` will tell).
 */
export const RACE_CHARS: Readonly<Record<1 | 2 | 3 | 4, number>> = { 1: 55, 2: 60, 3: 65, 4: 70 };
/** Never fewer words than this (a race of three long phrases would feel like three stretches only). */
export const MIN_WORDS = 4;

/** The words of a race, drawn from `seed` (deterministic): no word twice, at least RACE_CHARS letters. */
export function wordsFor(tier: number, seed: number): string[] {
  const bank = [...bankFor(tier)];
  const r = rng(seed * 17 + Math.floor(tier) * 131 + 7);
  // Fisher–Yates with the seeded draw
  for (let i = bank.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [bank[i], bank[j]] = [bank[j], bank[i]];
  }
  const need = RACE_CHARS[Math.min(4, Math.max(1, Math.floor(tier) || 1)) as 1 | 2 | 3 | 4];
  const out: string[] = [];
  let chars = 0;
  for (const w of bank) {
    if (chars >= need && out.length >= MIN_WORDS) break;
    out.push(w);
    chars += w.length;
  }
  return out;
}

// ------------------------------------------------------------------ the keys

const ACCENTS: Readonly<Record<string, string>> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' };

/** A letter as it is compared: lower case, accents off (á → a; ñ stays ñ). */
export function fold(ch: string): string {
  const c = ch.toLowerCase();
  return ACCENTS[c] ?? c;
}

/**
 * A key against the letter expected next: `right`, `wrong`, or `ignore` (a
 * key that types no letter: Shift, a dead accent key, Backspace, Enter…).
 * Accents are optional ("raton" types "ratón"), case does not matter, and
 * the space between words must be typed.
 */
export function judgeKey(expected: string, key: string): 'right' | 'wrong' | 'ignore' {
  if ([...key].length !== 1) return 'ignore';
  return fold(key) === fold(expected) ? 'right' : 'wrong';
}

// ------------------------------------------------------------------ the road under the words

/** A stretch of road per word, about a piece for every three letters (2–7 pieces). */
export const stretchLen = (word: string) => Math.max(2, Math.min(7, Math.round(word.length / 3)));

const lift = (d: RoadDir) => (d === 'up' ? 1 : d === 'down' ? -1 : 0);

/**
 * The race's road (scenery: the words drive it): one stretch per word, its
 * pieces mixing flat road and ramps, never above MAX_HEIGHT or below the
 * ground. It is a RaceDef, so the T33 course, art and rubber band take it as is.
 */
export function typingRaceDef(words: readonly string[], tier: number, seed: number): RaceDef {
  const r = rng(seed * 29 + 3);
  let h = 0;
  const stretches: Stretch[] = words.map((w) => {
    const road: RoadDir[] = [];
    for (let i = 0; i < stretchLen(w); i++) {
      const dirs = (['right', 'up', 'down'] as const).filter((d) => h + lift(d) >= 0 && h + lift(d) <= MAX_HEIGHT);
      // mostly flat: ramps are the fun, flat road is where typing reads best
      const x = r();
      const d: RoadDir = x < 0.55 || dirs.length === 1 ? 'right' : dirs.filter((dd) => dd !== 'right')[Math.floor(((x - 0.55) / 0.45) * (dirs.length - 1))] ?? 'right';
      road.push(d);
      h += lift(d);
    }
    return { road, turbo: false };
  });
  return { tier: Math.max(1, Math.floor(tier) || 1), seed, stretches };
}

/** Where the kart waits in stretch `k` with `typed` of the word's `total` letters right (never at the stretch's end: the boost takes it on). */
export function typedSpot(starts: readonly number[], ends: readonly number[], k: number, typed: number, total: number): number {
  const len = ends[k] - starts[k];
  return starts[k] + (total > 0 ? Math.min(1, typed / total) : 0) * Math.max(0, len - 0.35);
}

// ------------------------------------------------------------------ the numbers

/** Words per minute, the usual way: five letters (spaces included) a word. Null before any time has passed. */
export function wpm(chars: number, ms: number): number | null {
  if (!(ms > 0) || chars <= 0) return chars <= 0 && ms > 0 ? 0 : null;
  return Math.round((chars / 5 / (ms / 60_000)) * 10) / 10;
}

/** The share of keys that were right (0–100), null before any key. */
export function accuracy(right: number, wrong: number): number | null {
  const n = right + wrong;
  return n > 0 ? Math.round((right / n) * 1000) / 10 : null;
}

// ------------------------------------------------------------------ the session's typing races

/** What carries over between typing races (and across a reload): cups won, races started, the next race's tier. */
export const TYPING_CUP_PREFIX = 'typing-cup-';
