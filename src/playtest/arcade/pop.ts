// "¡Pum! Letras", 1ro's ZType-like arcade card: the pure part, unit-tested.
//
// Letters (later three-letter words with their picture: SOL with a sun) come
// down in soap bubbles; the child types the letter (the physical keyboard or
// the drawn one) and the bubble pops into a star. Nothing is ever lost: a
// bubble that reaches the grass bounces softly and waits there until it is
// typed. A wave lasts WAVE_MS of new bubbles, then the last ones on screen;
// the wave is won when the sky is clear.
//
// - What comes down, by tier ("¡Otra vez!" goes one up): the vowels, then a
//   few common consonants, then more, then words with a picture mixed with
//   letters, then words only. Always in capitals, as printed on the keys.
// - Two bubbles on screen never start with the same letter, so a key always
//   names one bubble (`pickText`).
// - The adaptivity inside a wave (`adaptStep`): three steps per tier. A run
//   of quick pops brings one more bubble at once and a quicker fall; a bubble
//   reaching the grass, or a burst of wrong keys, takes a step back.
// - Matching a key (`judge`): a word that was started takes the next keys;
//   otherwise the bubble whose letter it is. Case and accents never matter;
//   keys that are not letters are ignored.

export const POP_MAX_TIER = 5;
/** New bubbles come for this long; then the ones on screen are the last of the wave. */
export const WAVE_MS = 60_000;

export const LETTERS_1 = ['A', 'E', 'I', 'O', 'U'] as const;
/** The first consonants of reading at school (mamá, sapo, pato, luna, tete). */
export const LETTERS_2 = [...LETTERS_1, 'M', 'S', 'P', 'L', 'T'] as const;
export const LETTERS_3 = [...LETTERS_2, 'N', 'R', 'D', 'B', 'C', 'F'] as const;

/** Three-letter words a six-year-old knows and that draw well, each with its picture (popArt.tsx). */
export const PIC_WORDS = ['SOL', 'MAR', 'PAN', 'OSO', 'UVA', 'PEZ', 'OJO', 'PIE'] as const;
export type PicWord = typeof PIC_WORDS[number];
export const isPicWord = (t: string): t is PicWord => (PIC_WORDS as readonly string[]).includes(t);

export interface TierSpec {
  letters: readonly string[];
  /** How likely a new bubble is a word with its picture (0: letters only). */
  wordShare: number;
  /** Bubbles on screen at most, per adaptive step. */
  atOnce: readonly [number, number, number];
  /** How long a bubble takes from the sky to the grass, per adaptive step. */
  fallMs: readonly [number, number, number];
  /** At least this long between two new bubbles. */
  gapMs: number;
}

export const TIERS: Readonly<Record<1 | 2 | 3 | 4 | 5, TierSpec>> = {
  1: { letters: LETTERS_1, wordShare: 0, atOnce: [1, 1, 2], fallMs: [14_000, 12_000, 10_500], gapMs: 900 },
  2: { letters: LETTERS_2, wordShare: 0, atOnce: [1, 2, 2], fallMs: [13_000, 11_000, 9_500], gapMs: 1200 },
  3: { letters: LETTERS_3, wordShare: 0, atOnce: [2, 2, 3], fallMs: [12_000, 10_500, 9_000], gapMs: 1500 },
  4: { letters: LETTERS_2, wordShare: 0.5, atOnce: [1, 2, 2], fallMs: [17_000, 15_000, 13_000], gapMs: 1500 },
  5: { letters: LETTERS_3, wordShare: 1, atOnce: [1, 1, 2], fallMs: [17_000, 15_000, 13_000], gapMs: 1800 },
};

export const clampTier = (t: number) => Math.max(1, Math.min(POP_MAX_TIER, Math.floor(t) || 1)) as 1 | 2 | 3 | 4 | 5;
export const tierSpec = (t: number): TierSpec => TIERS[clampTier(t)];

// ------------------------------------------------------------------ adaptivity inside a wave

/** Quick pops in a row (before the grass, at most one wrong key) for one step up. */
export const ADAPT_UP_STREAK = 4;
/** Wrong keys since the last pop for one step down. */
export const ADAPT_DOWN_WRONG = 4;

export interface Adapt {
  level: 0 | 1 | 2;
  streak: number;
  wrong: number;
  ups: number;
  downs: number;
  /** The highest step reached (logged). */
  top: number;
}
export const newAdapt = (): Adapt => ({ level: 0, streak: 0, wrong: 0, ups: 0, downs: 0, top: 0 });

/** `pop`: a bubble popped (`landed`: it had reached the grass); `landed`: a bubble reached the grass; `wrong`: a wrong key. */
export type AdaptEvent = { kind: 'pop'; landed: boolean } | { kind: 'landed' } | { kind: 'wrong' };

export function adaptStep(a: Adapt, ev: AdaptEvent): Adapt {
  const down = (x: Adapt): Adapt => (x.level > 0 ? { ...x, level: (x.level - 1) as Adapt['level'], downs: x.downs + 1 } : x);
  switch (ev.kind) {
    case 'pop': {
      const quick = !ev.landed && a.wrong <= 1;
      const n = { ...a, wrong: 0, streak: quick ? a.streak + 1 : 0 };
      if (n.streak >= ADAPT_UP_STREAK && n.level < 2) {
        const level = (n.level + 1) as Adapt['level'];
        return { ...n, level, streak: 0, ups: n.ups + 1, top: Math.max(n.top, level) };
      }
      return n;
    }
    case 'landed': return down({ ...a, streak: 0 });
    case 'wrong': {
      const n = { ...a, wrong: a.wrong + 1 };
      return n.wrong >= ADAPT_DOWN_WRONG ? down({ ...n, wrong: 0, streak: 0 }) : n;
    }
  }
}

export const atOnceOf = (tier: number, a: Pick<Adapt, 'level'>) => tierSpec(tier).atOnce[a.level];
export const fallMsOf = (tier: number, a: Pick<Adapt, 'level'>) => tierSpec(tier).fallMs[a.level];

// ------------------------------------------------------------------ the bubbles of a wave

/** A bubble on screen: its text (one letter, or a word), how many of its letters are typed, its order of arrival. */
export interface Live {
  id: number;
  text: string;
  typed: number;
  seq: number;
  landed: boolean;
}

/** A new bubble's text: never the same first letter as a bubble on screen, never the last one again. */
export function pickText(tier: number, r: () => number, live: readonly Pick<Live, 'text'>[], last: string | null): string {
  const spec = tierSpec(tier);
  const taken = new Set(live.map((l) => l.text[0]));
  const free = (pool: readonly string[]) => pool.filter((t) => !taken.has(t[0]) && t !== last);
  const words = free(PIC_WORDS);
  const letters = free(spec.letters);
  const wantWord = spec.wordShare > 0 && r() < spec.wordShare;
  const pool = wantWord && words.length ? words : letters.length ? letters : words.length ? words : spec.letters.filter((t) => !taken.has(t[0]));
  const from = pool.length ? pool : spec.letters;
  return from[Math.floor(r() * from.length) % from.length];
}

/** A free lane for a new bubble (out of `lanes`), away from the ones in use when it can be. */
export function pickLane(r: () => number, used: readonly number[], lanes: number, last = -1): number {
  const all = Array.from({ length: lanes }, (_, i) => i);
  const free = all.filter((i) => !used.includes(i) && i !== last);
  const pool = free.length ? free : all.filter((i) => !used.includes(i));
  const from = pool.length ? pool : all;
  return from[Math.floor(r() * from.length) % from.length];
}

/** Whether a new bubble comes now. */
export function shouldSpawn(o: { now: number; waveAt: number; lastAt: number; live: number; atOnce: number; gapMs: number }): boolean {
  return o.now - o.waveAt < WAVE_MS && o.live < o.atOnce && o.now - o.lastAt >= o.gapMs;
}

/** The wave is won: no more new bubbles, and the sky is clear. */
export const waveOver = (elapsedMs: number, live: number) => elapsedMs >= WAVE_MS && live === 0;

// ------------------------------------------------------------------ the keys

/** A key as a capital letter (accents dropped), or null for anything that is not a letter. */
export function normKey(k: string): string | null {
  if ([...k].length !== 1) return null;
  const up = k.toUpperCase();
  if (up === 'Ñ') return up;
  const plain = up.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return /^[A-Z]$/.test(plain) ? plain : null;
}

/**
 * The bubble to type now (it glows, and its key on the drawn keyboard): the
 * word started, else one resting on the grass, else the one that came first.
 */
export function targetOf<T extends Live>(live: readonly T[], locked: number | null): T | null {
  const l = locked != null ? live.find((x) => x.id === locked) : undefined;
  if (l) return l;
  return [...live].sort((a, b) => Number(b.landed) - Number(a.landed) || a.seq - b.seq)[0] ?? null;
}

/** The letter its key glows for. */
export const expectedOf = (t: Pick<Live, 'text' | 'typed'> | null): string | null => (t ? t.text[t.typed] ?? null : null);

export type Judged =
  | { kind: 'ignore' }
  | { kind: 'wrong'; expected: string | null }
  | { kind: 'hit'; id: number; typed: number; done: boolean };

/** A key against the bubbles on screen (`locked`: the word being typed). */
export function judge(live: readonly Live[], locked: number | null, key: string): Judged {
  const k = normKey(key);
  if (!k) return { kind: 'ignore' };
  const word = locked != null ? live.find((x) => x.id === locked) : undefined;
  const hit = (b: Live): Judged => ({ kind: 'hit', id: b.id, typed: b.typed + 1, done: b.typed + 1 >= b.text.length });
  if (word) return word.text[word.typed] === k ? hit(word) : { kind: 'wrong', expected: word.text[word.typed] ?? null };
  const order = [...live].sort((a, b) => Number(b.landed) - Number(a.landed) || a.seq - b.seq);
  const b = order.find((x) => x.typed === 0 && x.text[0] === k);
  return b ? hit(b) : { kind: 'wrong', expected: expectedOf(targetOf(live, null)) };
}

/** Right keys over all keys, in % (null before any key). */
export const accuracyPct = (right: number, wrong: number): number | null =>
  (right + wrong > 0 ? Math.round((right / (right + wrong)) * 1000) / 10 : null);
