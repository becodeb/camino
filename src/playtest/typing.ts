// "Teclas del bosque", the pilot's typing minigame: the pure part (round 2,
// T12). The game is three short rounds, each with a visible goal (a garden
// bed of N holes that fill as things are caught) and each harder on purpose:
// what falls by grade and round (1ro: vowels → common letters, two at once →
// syllables; 2do: letters → syllables → short words; 3ro: short words →
// words of programming → a command with its number; 4to–5to: programming
// words, short → long → commands), how a key press is scored (an item is
// typed letter by letter, in order; a wrong key loses nothing), the gentle
// pace inside a round (a bit faster after a streak of quick catches, a bit
// slower after something reached the ground; three steps only), the golden
// streak (three catches in a row before the middle of the fall plant a
// golden seed that fills two holes), the seeds sent to the session's garden
// and the cap. TypingStep.tsx plays it; docs/prueba-piloto-datos.md
// (`typing`, `typing_round`, `typing_end`) records it.

import { rng } from '../ink/ink.js';

/** The grade's kind of game (logged in `typing_end`; round 1 of 2do is letters, but 2do is a words game). */
export type TypingMode = 'letters' | 'words';
/** What an item was drawn from (logged with every key and every round). */
export type TypingSet = 'vowels' | 'letters' | 'syllables' | 'words' | 'commands' | 'phrases';

export const VOWELS = ['a', 'e', 'i', 'o', 'u'] as const;
/** 1ro's common letters after the vowels: the first ones of reading at school (mamá, sapo, luna, pato, nene). */
export const COMMON = ['m', 's', 'l', 'p', 't', 'n'] as const;
/** 2do's letters: 1ro's and a few more of everyday words. */
export const COMMON2 = [...COMMON, 'r', 'd', 'c', 'b'] as const;
/** 1ro's syllables: a common consonant and a vowel (the syllables of the reading primer). */
export const SYLLABLES1 = ['ma', 'me', 'mi', 'mo', 'pa', 'pe', 'pi', 'sa', 'so', 'la', 'lo', 'lu', 'ta', 'te', 'no', 'na'] as const;
/** 2do's syllables: more consonants. */
export const SYLLABLES2 = ['ma', 'pe', 'lo', 'su', 'ta', 'ni', 'ra', 'do', 'ca', 'be', 'mi', 'so', 'lu', 'fe', 'ga', 'ri'] as const;
/** Short everyday words. No accents (a dead key), nothing ambiguous or sad. */
export const WORDS = ['sol', 'mar', 'pan', 'oso', 'sapo', 'pato', 'casa', 'luna', 'mesa', 'nube', 'rana', 'taza', 'lupa', 'mapa'] as const;
/** The words of programming (the rule cards, the commands): short ones… */
export const COMMANDS_SHORT = ['si', 'ir', 'mover', 'girar', 'parar', 'sumar', 'tocar'] as const;
/** …and longer ones. */
export const COMMANDS_LONG = ['saltar', 'pintar', 'repetir', 'avanzar', 'esperar', 'tocar', 'girar'] as const;
/** A command with its number, as in a program line (the space is the long bar). */
export const PHRASES3 = ['repetir 2', 'mover 3', 'sumar 1', 'saltar 2', 'girar 4'] as const;
export const PHRASES4 = ['repetir 3', 'mover 2', 'avanzar 4', 'esperar 1', 'sumar 5', 'girar 2'] as const;

/** Every word list, for the tests. */
export const COMMANDS = [...new Set([...COMMANDS_SHORT, ...COMMANDS_LONG])];

/** The letters of the drawn keyboard, as printed on a Latin-American Spanish keyboard (the caps say them in uppercase). */
export const KEY_ROWS = ['qwertyuiop', 'asdfghjklñ', 'zxcvbnm'] as const;
/** The number row, drawn only for a game with commands that carry a number. */
export const DIGIT_ROW = '1234567890';

export const modeOf = (grade: number): TypingMode => (grade <= 1 ? 'letters' : 'words');
/** The grade's family of lists (logged in `typing_end.set`, as in round 1 of the pilot). */
export const wordSetOf = (grade: number): 'letters' | 'words' | 'commands' => (grade <= 1 ? 'letters' : grade === 2 ? 'words' : 'commands');

/** How a letter, a number or the space is said aloud (the child hears it as the seed appears, and in the help). */
export const LETTER_NAME: Record<string, string> = {
  a: 'a', b: 'be', c: 'ce', d: 'de', e: 'e', f: 'efe', g: 'ge', h: 'hache', i: 'i', j: 'jota', k: 'ka', l: 'ele', m: 'eme',
  n: 'ene', ñ: 'eñe', o: 'o', p: 'pe', q: 'cu', r: 'erre', s: 'ese', t: 'te', u: 'u', v: 've', w: 'doble ve', x: 'equis',
  y: 'ye', z: 'zeta',
  '1': 'uno', '2': 'dos', '3': 'tres', '4': 'cuatro', '5': 'cinco', '6': 'seis', '7': 'siete', '8': 'ocho', '9': 'nueve', '0': 'cero',
  ' ': 'espacio',
};

// ------------------------------------------------------------------ the rounds

export const ROUNDS = 3;

export interface RoundDef {
  /** 1, 2 or 3. */
  n: number;
  set: TypingSet;
  /** What falls (the same lists for every child; the order is random). */
  pool: readonly string[];
  /** Holes in the garden bed: things to catch (a golden seed fills two). */
  goal: number;
  /** A one-letter item's fall at the round's calm pace (ms)… */
  letterMs: number;
  /** …or a longer item's: a moment plus a while per character. */
  perCharMs: number;
  /** Things falling at once (two: the second starts when the first is half-way down). */
  atOnce: 1 | 2;
  /** A butterfly carries one item of the round, fluttering. */
  butterfly: boolean;
  /** Said when the round starts (round 1: the intro says it). */
  say: string;
}

export const WORD_FALL_BASE_MS = 3_500;

const ROUND_LINE = {
  more: '¡Ronda dos! Ahora caen otras letras, y a veces dos juntas.',
  syl2: '¡Ronda dos! Ahora caen sílabas: escribí las dos letras.',
  syl3: '¡Última ronda! Ahora caen sílabas: escribí las dos letras.',
  words3: '¡Última ronda! Ahora caen palabras.',
  prog2: '¡Ronda dos! Ahora caen palabras de programar.',
  long2: '¡Ronda dos! Palabras de programar más largas.',
  phrase3: '¡Última ronda! Órdenes con número. El espacio es la barra larga.',
} as const;

/** The three rounds of a grade, each harder on purpose (the content, then the pace or two at once). */
export function roundsFor(grade: number): RoundDef[] {
  const r = (n: number, set: TypingSet, pool: readonly string[], goal: number, o: Partial<RoundDef> = {}): RoundDef => ({
    n, set, pool, goal, letterMs: 10_000, perCharMs: 3_000, atOnce: 1, butterfly: n > 1, say: '', ...o,
  });
  if (grade <= 1) {
    return [
      r(1, 'vowels', VOWELS, 6, { letterMs: 10_000 }),
      r(2, 'letters', [...VOWELS, ...COMMON], 8, { letterMs: 8_500, atOnce: 2, say: ROUND_LINE.more }),
      r(3, 'syllables', SYLLABLES1, 5, { perCharMs: 3_000, say: ROUND_LINE.syl3 }),
    ];
  }
  if (grade === 2) {
    return [
      r(1, 'letters', [...VOWELS, ...COMMON2], 8, { letterMs: 8_000, atOnce: 2 }),
      r(2, 'syllables', SYLLABLES2, 6, { perCharMs: 2_600, say: ROUND_LINE.syl2 }),
      r(3, 'words', WORDS, 5, { perCharMs: 2_400, say: ROUND_LINE.words3 }),
    ];
  }
  if (grade === 3) {
    return [
      r(1, 'words', WORDS, 5, { perCharMs: 2_100 }),
      r(2, 'commands', COMMANDS_SHORT, 5, { perCharMs: 2_000, say: ROUND_LINE.prog2 }),
      r(3, 'phrases', PHRASES3, 3, { perCharMs: 1_900, say: ROUND_LINE.phrase3 }),
    ];
  }
  return [
    r(1, 'commands', COMMANDS_SHORT, 5, { perCharMs: 1_800 }),
    r(2, 'commands', COMMANDS_LONG, 5, { perCharMs: 1_700, say: ROUND_LINE.long2 }),
    r(3, 'phrases', PHRASES4, 4, { perCharMs: 1_600, say: ROUND_LINE.phrase3 }),
  ];
}

/** The game draws the number row (a round has commands with their number). */
export const needsDigits = (rounds: RoundDef[]) => rounds.some((r) => r.pool.some((t) => /\d/.test(t)));

/** The intro's demo item (the ghost hand types it): round 1's kind of thing. */
export function demoOf(grade: number): string {
  const first = roundsFor(grade)[0];
  return first.set === 'vowels' || first.set === 'letters' ? 'a' : first.set === 'words' ? 'sol' : 'si';
}

/** The set an item belongs to, inside its round (1ro's round 2 mixes vowels and letters). */
export function setOf(text: string, round: RoundDef): TypingSet {
  if (round.set === 'letters' && (VOWELS as readonly string[]).includes(text)) return 'vowels';
  return round.set;
}

export interface Pick { text: string; set: TypingSet }

/**
 * What falls in a round, one after the other (seeded, so a test can replay
 * it). Letter rounds that start with the vowels (1ro's round 1) give the five
 * first in a shuffled order. Nothing of the last two again (a pool of five
 * never repeats back to back). Something that reached the ground comes back
 * two items later (`again`): no miss, just another chance.
 */
export function createRoundPicker(round: RoundDef, seed = 1) {
  const r = rng(seed);
  const recent: string[] = [];
  const back: { text: string; in: number }[] = [];
  const first = round.set === 'vowels' ? [...round.pool].sort(() => r() - 0.5) : [];
  return {
    next(): Pick {
      back.forEach((b) => b.in--);
      const due = back.findIndex((b) => b.in <= 0 && b.text !== recent[recent.length - 1]);
      let text: string;
      if (due >= 0) text = back.splice(due, 1)[0].text;
      else if (first.length) text = first.shift()!;
      else {
        const pool = round.pool.filter((t) => !recent.includes(t));
        const from = pool.length ? pool : round.pool;
        text = from[Math.floor(r() * from.length)];
      }
      recent.push(text);
      if (recent.length > 2) recent.shift();
      return { text, set: setOf(text, round) };
    },
    again(text: string) { back.push({ text, in: 2 }); },
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

/** keyOf, plus the space bar when the item waits for a space (a command and its number); otherwise the space is no key of the game. */
export const keyFor = (key: string, expected: string | null): string | null => keyOf(key) ?? (key === ' ' && expected === ' ' ? ' ' : null);

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

// ------------------------------------------------------------------ the pace inside a round

/**
 * Three gentle steps (0 calm, 1, 2 a bit livelier): each is about 15 %
 * quicker. The round's own design does the real ramp; this only follows the
 * child a little.
 */
export const PACE = [1, 0.86, 0.74] as const;
export const PACE_TOP = PACE.length - 1;

export interface Pace {
  step: number;
  /** Catches before the middle of the fall, in a row. */
  quick: number;
}
export const PACE_START: Pace = { step: 0, quick: 0 };

/** A catch (`early`: before the middle) or something that reached the ground. */
export type PaceEvent = { kind: 'caught'; early: boolean } | { kind: 'landed' };

/** Three early catches in a row → one step livelier; something on the ground → one step calmer. Wrong keys never change it. */
export function adaptPace(p: Pace, ev: PaceEvent): Pace {
  if (ev.kind === 'landed') return { step: Math.max(0, p.step - 1), quick: 0 };
  if (!ev.early) return { ...p, quick: 0 };
  const quick = p.quick + 1;
  return quick >= STREAK ? { step: Math.min(PACE_TOP, p.step + 1), quick: 0 } : { step: p.step, quick };
}

/** An item's fall from the trees to the ground (ms), at the round's pace step. A butterfly flutters down slower. */
export function fallMs(text: string, round: RoundDef, step: number, butterfly = false): number {
  const base = text.length === 1 ? round.letterMs : WORD_FALL_BASE_MS + round.perCharMs * text.length;
  return Math.round(base * PACE[Math.max(0, Math.min(PACE_TOP, step))] * (butterfly ? 1.25 : 1));
}

/** Caught before the middle of its fall (it still shines): counts for the golden streak. */
export const isEarly = (progress: number) => progress < 0.5;

// ------------------------------------------------------------------ the goal and the golden streak

/** Early catches in a row that make a golden seed. */
export const STREAK = 3;

export interface RoundProgress {
  goal: number;
  /** Holes filled (a golden catch fills two). */
  filled: number;
  /** Things caught. */
  caught: number;
  /** Golden seeds (each one a hole filled for free). */
  golden: number;
  /** Early catches in a row, toward the next golden seed (0–2). */
  streak: number;
}

export const startRound = (goal: number): RoundProgress => ({ goal, filled: 0, caught: 0, golden: 0, streak: 0 });

/**
 * A catch: one hole more; the third early catch in a row also plants a
 * golden seed in the next hole (never past the goal). A late catch or a
 * landed item only starts the streak again: nothing is taken away.
 */
export function addCatch(p: RoundProgress, early: boolean): RoundProgress & { goldenNow: boolean } {
  const streak = early ? p.streak + 1 : 0;
  const goldenNow = streak >= STREAK && p.filled + 1 < p.goal;
  const filled = Math.min(p.goal, p.filled + 1 + (goldenNow ? 1 : 0));
  return { ...p, filled, caught: p.caught + 1, golden: p.golden + (goldenNow ? 1 : 0), streak: streak >= STREAK ? 0 : streak, goldenNow };
}

export const landedOn = (p: RoundProgress): RoundProgress => ({ ...p, streak: 0 });
export const roundDone = (p: RoundProgress) => p.filled >= p.goal;

// ------------------------------------------------------------------ seeds and time

/** A seed for the session's garden (the pouch) every three holes filled over the whole game; a few at most. */
export const SEED_EVERY = 3;
export const MAX_TYPING_SEEDS = 8;
export const seedsFor = (filled: number) => Math.min(MAX_TYPING_SEEDS, Math.floor(filled / SEED_EVERY));

/** The three rounds take about three minutes; at five the game ends gently after the item on screen. */
export const TYPING_CAP_MS = 5 * 60_000;

/** `?teclas=<minutes>` sets another cap (0.25–10). */
export function typingCap(search: string): number {
  const m = /[?&]teclas=([\d.]+)/.exec(search);
  const min = m ? Number(m[1]) : NaN;
  return Number.isFinite(min) && min >= 0.25 && min <= 10 ? Math.round(min * 60_000) : TYPING_CAP_MS;
}

/** `?metas=<n>` makes every round's goal n (1–20; checks and screenshots). */
export function goalOverride(search: string): number | null {
  const m = /[?&]metas=(\d+)/.exec(search);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 20 ? n : null;
}
