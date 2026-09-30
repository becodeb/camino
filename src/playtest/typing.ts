// "Teclas del bosque", the pilot's typing minigame: the pure part. What
// falls by grade (1ro: vowels, then a few common letters; 2do: short words;
// 3ro and up: the words of programming), how a key press is scored (a word
// is typed letter by letter, in order; a wrong key loses nothing), how the
// speed adapts (faster after a streak of quick right keys, slower after
// errors, slow keys or an item that reached the ground; it starts slow), how
// many things fall at once, the seeds a game plants and how long it lasts.
// TypingStep.tsx plays it; docs/prueba-piloto-datos.md (`typing`,
// `typing_end`) records it.

import { rng } from '../ink/ink.js';

export type TypingMode = 'letters' | 'words';
/** What an item was drawn from (logged with every key). */
export type TypingSet = 'vowels' | 'letters' | 'words' | 'commands';

export const VOWELS = ['a', 'e', 'i', 'o', 'u'] as const;
/** 1ro's common letters after the vowels: the first ones of reading at school (mamá, sapo, luna, pato, nene). */
export const COMMON = ['m', 's', 'l', 'p', 't', 'n'] as const;
/** 2do: short everyday words, three letters first. No accents (a dead key), nothing ambiguous or sad. */
export const WORDS = ['sol', 'mar', 'pan', 'oso', 'sapo', 'pato', 'casa', 'luna', 'mesa', 'nube', 'rana', 'taza', 'lupa', 'mapa'] as const;
/** 3ro and up: the words of programming (the rule cards, the commands), short first. */
export const COMMANDS = ['si', 'ir', 'mover', 'girar', 'parar', 'sumar', 'tocar', 'saltar', 'pintar', 'repetir', 'avanzar', 'esperar'] as const;

/** The letters of the drawn keyboard, as printed on a Latin-American Spanish keyboard (the caps say them in uppercase). */
export const KEY_ROWS = ['qwertyuiop', 'asdfghjklñ', 'zxcvbnm'] as const;

export const modeOf = (grade: number): TypingMode => (grade <= 1 ? 'letters' : 'words');
export const wordSetOf = (grade: number): TypingSet => (grade <= 1 ? 'letters' : grade === 2 ? 'words' : 'commands');

/** How a letter is said aloud (the child hears it as the seed appears). */
export const LETTER_NAME: Record<string, string> = {
  a: 'a', b: 'be', c: 'ce', d: 'de', e: 'e', f: 'efe', g: 'ge', h: 'hache', i: 'i', j: 'jota', k: 'ka', l: 'ele', m: 'eme',
  n: 'ene', ñ: 'eñe', o: 'o', p: 'pe', q: 'cu', r: 'erre', s: 'ese', t: 'te', u: 'u', v: 've', w: 'doble ve', x: 'equis',
  y: 'ye', z: 'zeta',
};

// ------------------------------------------------------------------ what falls

export interface Pick { text: string; set: TypingSet }

/**
 * The items of a game, one after the other (seeded, so a test can replay it).
 * 1ro: the five vowels first (in a shuffled order), then vowels and the
 * common letters mixed; never the same letter twice in a row. Words: at the
 * slow levels the short ones (2do: three letters; 3ro+: up to five), longer
 * ones as the speed grows; none of the last three again.
 */
export function createPicker(grade: number, seed = 1): (level: number) => Pick {
  const r = rng(seed);
  const pickFrom = <T,>(list: readonly T[]) => list[Math.floor(r() * list.length)];
  const recent: string[] = [];
  const remember = (t: string) => { recent.push(t); if (recent.length > 3) recent.shift(); };
  if (modeOf(grade) === 'letters') {
    const first = [...VOWELS].sort(() => r() - 0.5);
    let n = 0;
    return () => {
      const last = recent[recent.length - 1];
      let text: string;
      if (n < first.length) text = first[n];
      else {
        const pool = r() < 0.5 ? VOWELS : COMMON;
        do text = pickFrom(pool); while (text === last);
      }
      n++;
      remember(text);
      return { text, set: (VOWELS as readonly string[]).includes(text) ? 'vowels' : 'letters' };
    };
  }
  const set = wordSetOf(grade);
  const all: readonly string[] = set === 'words' ? WORDS : COMMANDS;
  return (level) => {
    const longest = set === 'words' ? (level <= 2 ? 3 : 4) : level <= 1 ? 5 : level === 2 ? 6 : 7;
    const pool = all.filter((w) => w.length <= longest && !recent.includes(w));
    const text = pickFrom(pool.length ? pool : all);
    remember(text);
    return { text, set };
  };
}

// ------------------------------------------------------------------ a key

/**
 * The key a keydown means, as the game compares it: one printable character,
 * lowercased, accents off (a dead key's á is an a), ñ kept; null for keys
 * that are not a character (Shift, arrows, Enter, a dead key alone) and for
 * the space.
 */
export function keyOf(key: string): string | null {
  if (key.length !== 1 || key === ' ') return null;
  const k = key.toLowerCase();
  if (k === 'ñ') return k;
  return k.normalize('NFD').replace(/[̀-ͯ]/g, '') || null;
}

/** An item being typed: its text and the next letter to type. */
export interface Typed { text: string; pos: number }

export interface PressResult {
  correct: boolean;
  /** The letter that was expected. */
  expected: string;
  /** The next letter to type after this press. */
  pos: number;
  /** The whole item is typed: it is caught. */
  done: boolean;
}

/** One key pressed on an item: the right letter moves on; a wrong one changes nothing. */
export function pressOn(t: Typed, key: string): PressResult {
  const expected = t.text[t.pos];
  const correct = key === expected;
  const pos = correct ? t.pos + 1 : t.pos;
  return { correct, expected, pos, done: pos >= t.text.length };
}

// ------------------------------------------------------------------ the speed

export interface Speed {
  level: number;
  /** Quick right keys in a row. */
  streak: number;
  /** Wrong keys since the last quick right one. */
  misses: number;
}

export const SPEED_START: Speed = { level: 1, streak: 0, misses: 0 };

/** The fastest a grade gets (1ro stays gentle). */
export const maxLevel = (grade: number) => (grade <= 1 ? 4 : grade === 2 ? 5 : 6);

/** A key is quick below this and slow above that: the first letter of an item counts from its appearance, the next ones from the key before. */
export const FAST_MS = { first: 2000, next: 1200 } as const;
export const SLOW_MS = { first: 5000, next: 3500 } as const;
/** Quick right keys in a row that speed it up; wrong keys that slow it down. */
export const STREAK_UP = 3;
export const MISSES_DOWN = 2;

export type SpeedEvent =
  | { kind: 'press'; correct: boolean; latency_ms: number; first: boolean }
  | { kind: 'landed' };

/** The next speed after a key or an item that reached the ground. */
export function adapt(s: Speed, ev: SpeedEvent, grade: number): Speed {
  if (ev.kind === 'landed') return { level: Math.max(1, s.level - 1), streak: 0, misses: 0 };
  if (!ev.correct) {
    const misses = s.misses + 1;
    return misses >= MISSES_DOWN ? { level: Math.max(1, s.level - 1), streak: 0, misses: 0 } : { ...s, streak: 0, misses };
  }
  const fast = ev.latency_ms <= (ev.first ? FAST_MS.first : FAST_MS.next);
  const slow = ev.latency_ms >= (ev.first ? SLOW_MS.first : SLOW_MS.next);
  if (slow) return { level: Math.max(1, s.level - 1), streak: 0, misses: s.misses };
  if (!fast) return { ...s, streak: 0 };
  const streak = s.streak + 1;
  if (streak >= STREAK_UP) return { level: Math.min(maxLevel(grade), s.level + 1), streak: 0, misses: 0 };
  return { level: s.level, streak, misses: 0 };
}

/** A letter's fall from the trees to the ground, by speed level (1–6). */
export const LETTER_FALL_MS = [0, 11_000, 9_000, 7_500, 6_200, 5_200, 4_400] as const;
/** A word falls for a moment plus a while per letter. */
export const WORD_FALL_BASE_MS = 3_500;
export const WORD_FALL_PER_LETTER_MS = [0, 3_000, 2_500, 2_100, 1_750, 1_450, 1_200] as const;

export function fallMs(mode: TypingMode, text: string, level: number): number {
  const l = Math.max(1, Math.min(6, level));
  return mode === 'letters' ? LETTER_FALL_MS[l] : WORD_FALL_BASE_MS + WORD_FALL_PER_LETTER_MS[l] * text.length;
}

/** Things falling at once: one; 1ro's letters two from level 3 (never more). */
export const maxItems = (mode: TypingMode, level: number) => (mode === 'letters' && level >= 3 ? 2 : 1);

// ------------------------------------------------------------------ seeds and time

/** A seed for the session's garden every N things caught; at most a few per game. */
export const SEED_EVERY: Record<TypingMode, number> = { letters: 5, words: 2 };
export const MAX_TYPING_SEEDS = 8;
export const seedsFor = (caught: number, mode: TypingMode) => Math.min(MAX_TYPING_SEEDS, Math.floor(caught / SEED_EVERY[mode]));

/** The game lasts about four minutes; "listo" shows after a minute. */
export const TYPING_MS = 4 * 60_000;
export const TYPING_LISTO_MS = 60_000;

/** `?teclas=<minutes>` in the URL sets another length (0.25–10; "listo" then shows at half of it, at most a minute). */
export function typingTimes(search: string): { total: number; listo: number } {
  const m = /[?&]teclas=([\d.]+)/.exec(search);
  const min = m ? Number(m[1]) : NaN;
  const total = Number.isFinite(min) && min >= 0.25 && min <= 10 ? Math.round(min * 60_000) : TYPING_MS;
  return { total, listo: Math.min(TYPING_LISTO_MS, Math.round(total / 2)) };
}
