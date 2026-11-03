// T55 (2026-11-03): 1ro's visible progress, a big drawn strip at the top of
// the screen during the guided pass (GuidedGames.tsx) and the gentle blocks
// ladder after it (Ladder.tsx, 1ro's route only). No text: one disc per
// monster game, then one block per blocks level met so far. A finished
// station fills with a star, the one on screen pulses, the rest wait empty.
// Purely visual (pointer-events none): it never takes a tap from the game.

import './chapterStrip.css';

/** The monster games' colours, in GUIDED order (kit.ts). */
const GAME_COLORS = ['#e8a33d', '#d9668f', '#5b9bd5', '#6dbb6a'];
/** At most this many blocks levels drawn (the latest ones), so the strip fits a phone. */
const MAX_LEVELS = 6;

const Star = () => (
  <svg viewBox="-12 -12 24 24" className="cs-star" aria-hidden="true">
    <path d="M0,-10 L2.9,-3.6 L9.5,-3.1 L4.5,1.5 L5.9,8.1 L0,4.7 L-5.9,8.1 L-4.5,1.5 L-9.5,-3.1 L-2.9,-3.6 Z" />
  </svg>
);

/**
 * `game`: the monster game on screen (0-based; GUIDED.length or more: all
 * done). `levels`: blocks levels finished; `inLadder`: the ladder is on.
 */
export function ChapterStrip({ games, game, levels = 0, inLadder = false }: { games: number; game: number; levels?: number; inLadder?: boolean }) {
  const shown = inLadder ? Math.min(MAX_LEVELS, levels + 1) : 1;
  const firstLevel = inLadder ? Math.max(0, levels + 1 - MAX_LEVELS) : 0;
  return (
    <div className={`pp-chapter-strip${inLadder ? " is-ladder" : ""}`} role="img" aria-label="Tu camino" data-game={game} data-levels={levels}>
      {Array.from({ length: games }, (_, i) => {
        const state = i < game ? 'done' : i === game && !inLadder ? 'here' : 'todo';
        return (
          <span key={`g${i}`} className={`cs-station cs-game is-${state}`} style={{ ['--cs-color' as string]: GAME_COLORS[i % GAME_COLORS.length] }}>
            {state === 'done' && <Star />}
          </span>
        );
      })}
      <span className="cs-gap" aria-hidden="true" />
      {Array.from({ length: shown }, (_, k) => {
        const n = firstLevel + k;
        const state = !inLadder ? 'todo' : n < levels ? 'done' : 'here';
        return (
          <span key={`l${n}`} className={`cs-station cs-level is-${state}`}>
            {state === 'done' && <Star />}
          </span>
        );
      })}
    </div>
  );
}
