// T51: the way back to 1ro's arcade menu, drawn as the arcade itself (a
// taped sheet with the four monster games' own menu cards), so a child who
// neither reads nor listens recognises "the games" (2026-10-26: the bar's
// small four-squares button went unnoticed, and "¡Otra vez!" /
// "¡Otra carrera!" never led back to choosing a game).
//
// - ArcadeHomeContext: provided by FreePlay's activity frame on 1ro's route
//   only; null everywhere else (2do–5to, 1ro's classic route, the guided
//   pass), so every piece below renders nothing there.
// - EndChoices: a game's end screen, two large choices side by side:
//   "¡Otra vez!" and "Otro juego" (`game_exit` via `end_button`).
// - PlayHomeButton: while playing, a large drawn button in the bottom-left
//   corner, apart from the bar's icons and the game's targets
//   (`game_exit` via `play_button`).

import { createContext, useContext, type ReactNode } from 'react';
import { RecipeCardArt } from './monsterArt';
import { DanceCardArt } from './puppetArt';
import { OopsCardArt } from './oopsArt';
import { TapCardArt } from './tapArt';
import './arcade.css';

/** How a child left a game of 1ro's arcade (`game_exit.via`). */
export type ExitVia = 'end_button' | 'play_button' | 'bar_menu';

/** Back to 1ro's arcade menu (logs `game_exit` with `via`); null outside 1ro's arcade. */
export const ArcadeHomeContext = createContext<((via: ExitVia) => void) | null>(null);
export const useArcadeHome = () => useContext(ArcadeHomeContext);

/** The word under the drawing (for the adult; the drawing is what the child knows). */
export const HOME_WORD = 'Otro juego';

/** The arcade: a taped sheet with the four monster games' menu cards, tilted as on the menu. */
export function ArcadeHomeArt() {
  const cards = [<RecipeCardArt key="r" />, <DanceCardArt key="d" />, <OopsCardArt key="o" />, <TapCardArt key="t" />];
  return (
    <span className="ga-home-art" aria-hidden="true">
      <span className="ga-home-tape is-l" />
      <span className="ga-home-tape is-r" />
      {cards.map((c, i) => <span key={i} className="ga-home-card" style={{ rotate: `${[-3, 2.5, 2, -2.5][i]}deg` }}>{c}</span>)}
    </span>
  );
}

/** The end screen's "Otro juego": as large as "¡Otra vez!", drawn as the arcade, a cool blue (the other choice is orange). */
export function HomeButton({ onPress }: { onPress(): void }) {
  return (
    <button type="button" className="cut ga-home" aria-label="Otro juego: volver a los juegos" data-exit="end_button" onClick={onPress}>
      <ArcadeHomeArt />
      <span className="ga-home-word" aria-hidden="true">{HOME_WORD}</span>
    </button>
  );
}

/**
 * A game's end screen: "¡Otra vez!" (`again`, the game's own button) and,
 * on 1ro's arcade, "Otro juego" beside it. Without the arcade (the guided
 * pass, other grades) only `again`.
 */
export function EndChoices({ again, className = '' }: { again: ReactNode; className?: string }) {
  const home = useArcadeHome();
  if (!home) return <>{again}</>;
  return (
    <div className={`ga-end ${className}`.trim()}>
      {again}
      <HomeButton onPress={() => home('end_button')} />
    </div>
  );
}

/** While playing on 1ro's arcade: the drawn way back to the games, bottom-left (hidden while an end screen offers it). */
export function PlayHomeButton({ onPress }: { onPress(): void }) {
  return (
    <button type="button" className="cut pp-play-home" aria-label="Otro juego: volver a los juegos" data-exit="play_button" onClick={onPress}>
      <ArcadeHomeArt />
      <span className="pp-play-home-word" aria-hidden="true">{HOME_WORD}</span>
    </button>
  );
}
