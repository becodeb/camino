// The 1ro arcade's shared rules (T43, "Los juegos del monstruo"), pure so
// they are unit-tested: which games exist and in which order the guided
// first pass plays them, how a game gets harder, and the rapid-tap detector
// that makes the child's character dizzy when a child taps at random
// (random tapping never pays: build first, then "¡Listo!").
//
// A game is a component (GameProps, Kit.tsx) registered in games.tsx. T45–T47
// add their games by adding one entry to GAME_IDS / GUIDED here and one to
// the registry there; nothing else changes.

/** Every monster game. */
export const GAME_IDS = ['recipe', 'dance', 'oops'] as const;
export type GameId = typeof GAME_IDS[number];

/**
 * The guided first pass, in order: every game once, short. T45 ("Copiá el
 * baile"), T46 ("¿Qué salió mal?") and T47 ("Tocá y pasa") slot in here.
 */
export const GUIDED: readonly GameId[] = ['recipe', 'dance', 'oops'];

/** Rounds of each game in the guided pass (the arcade's games are endless). */
export const GUIDED_ROUNDS = 3;
/**
 * A game's guided turn also ends after the round on screen once it has
 * lasted this long: the class (2026-10-27, ~45–50 min) plans ~5 min of
 * unplugged warm-up, ~15 min of guided pass for the four games, ~25 min of
 * free arcade.
 */
export const GUIDED_TURN_MS = 4 * 60_000;

/** The guided turn is over after the round just won: its rounds are done, or its time is. */
export const guidedTurnOver = (roundsWon: number, startedAt: number, now: number, rounds = GUIDED_ROUNDS, turnMs = GUIDED_TURN_MS) =>
  roundsWon >= rounds || now - startedAt >= turnMs;

/** How a game is being played: the guided first pass, or picked from the arcade's menu. */
export type GameMode = 'guided' | 'arcade';

/** The tier a game's round is played at (1 the easiest); "¡Otra vez!" plays the next one, up to `max`. */
export const nextTier = (tier: number, max: number) => Math.max(1, Math.min(max, Math.floor(tier) + 1));

/** The guided pass's round `round` (1-based) of a game: its tiers 1, 2, 3… */
export const guidedTier = (round: number, max: number) => Math.max(1, Math.min(max, Math.floor(round)));

/**
 * Where a game opens from the arcade's menu: the hardest tier the child
 * reached in it this session (the guided pass included), never past `max`.
 */
export const arcadeStartTier = (reached: number | undefined, max: number) => Math.max(1, Math.min(max, Math.floor(reached ?? 1)));

// ------------------------------------------------------------------ the rapid-tap detector

/** Taps on game targets this close together make the character dizzy. */
export const RAPID_TAPS = 4;
export const RAPID_WINDOW_MS = 1000;
/** How long the character stays dizzy (input waits; nothing is lost). */
export const DIZZY_MS = 2600;

export interface RapidTaps {
  /**
   * A tap on a game target at `now` (ms). `allowed`: the tap counts (false
   * while dizzy, and for the tap that makes it dizzy); `dizzy`: this tap
   * started a dizzy spell (`taps` within `window_ms` say how fast).
   */
  tap(now: number): { allowed: boolean; dizzy: boolean; taps: number; window_ms: number };
  /** The character is dizzy at `now`. */
  isDizzy(now: number): boolean;
  reset(): void;
}

export function createRapidTaps(o: { n?: number; windowMs?: number; dizzyMs?: number } = {}): RapidTaps {
  const n = o.n ?? RAPID_TAPS;
  const windowMs = o.windowMs ?? RAPID_WINDOW_MS;
  const dizzyMs = o.dizzyMs ?? DIZZY_MS;
  let times: number[] = [];
  let dizzyUntil = -Infinity;
  return {
    tap(now) {
      if (now < dizzyUntil) return { allowed: false, dizzy: false, taps: 0, window_ms: 0 };
      times = times.filter((t) => now - t < windowMs);
      times.push(now);
      if (times.length >= n) {
        const taps = times.length;
        const window_ms = now - times[0];
        times = [];
        dizzyUntil = now + dizzyMs;
        return { allowed: false, dizzy: true, taps, window_ms };
      }
      return { allowed: true, dizzy: false, taps: times.length, window_ms: now - times[0] };
    },
    isDizzy: (now) => now < dizzyUntil,
    reset() { times = []; dizzyUntil = -Infinity; },
  };
}
