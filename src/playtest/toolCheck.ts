// The tool check's plan, pure (the screen is ToolCheck.tsx): two tiny pages
// built with the real engine and 1ro's arrow, and five gestures, one at a
// time, each asked aloud and detected from the events the page logs: tap a
// block (tap-to-add), ▶ Probar; then drag a block into the notebook,
// ↺ Volver a empezar, ✋ once. A gesture not done in GHOST_AFTER_MS is shown
// once by the ghost hand; MOVE_ON_MS later the check moves on anyway (never
// stuck). Each gesture logs one `tool_check`.

import { openBoard } from '../curriculum/boards';
import type { LevelDef } from '../game/levels';
import type { Program } from '../game/model';

export type GestureId = 'tap' | 'play' | 'drag' | 'reset' | 'help';

export interface Gesture {
  id: GestureId;
  /** Which of the two pages (0, 1). */
  page: 0 | 1;
  /** What is said (Rioplatense, one gesture). */
  say: string;
  /** What the pen ring circles, and what the ghost hand does (selectors inside the page). */
  cue: string;
  ghost: { do: 'tap'; at: string } | { do: 'drag'; from: string; to: string };
}

const ARROW = '.zone-palette [data-cmd="right"]';

export const GESTURES: readonly Gesture[] = [
  { id: 'tap', page: 0, say: 'Tocá la flecha. Así va al cuaderno.', cue: ARROW, ghost: { do: 'tap', at: ARROW } },
  { id: 'play', page: 0, say: 'Ahora tocá Probar, y mirá qué pasa.', cue: '.btn-play', ghost: { do: 'tap', at: '.btn-play' } },
  { id: 'drag', page: 1, say: 'Ahora agarrá la flecha y arrastrala hasta el cuaderno.', cue: ARROW, ghost: { do: 'drag', from: ARROW, to: '.zone-program [data-key="end0"]' } },
  { id: 'reset', page: 1, say: 'Tocá la flecha que da la vuelta. Así empezás de nuevo.', cue: '.btn-restart', ghost: { do: 'tap', at: '.btn-restart' } },
  { id: 'help', page: 1, say: 'Esta es la mano de ayuda. Tocala una vez.', cue: '.level-bar .help', ghost: { do: 'tap', at: '.level-bar .help' } },
];

export const GHOST_AFTER_MS = 20_000;
export const MOVE_ON_MS = 20_000;

export const LINES = {
  done: '¡Muy bien! Cuando no sepas qué hacer, tocá la mano.',
};

/**
 * What a logged event means for the gesture being asked: `done`; `try` (a
 * try that did not work: a drag dropped nowhere); `other` (the block got in
 * the other way: a drag when a tap was asked moves on, a tap when a drag was
 * asked does not); null (unrelated). `reset` is the screen's own signal (↺
 * logs no event).
 */
export function gestureHit(g: GestureId, type: string, p: Record<string, unknown>): 'done' | 'try' | 'other' | null {
  switch (g) {
    case 'tap':
      if (type === 'tap_add') return 'done';
      if (type === 'drag' && p.phase === 'drop' && p.success === true) return 'other';
      return null;
    case 'play':
      return type === 'run' ? 'done' : null;
    case 'drag':
      if (type === 'drag' && p.phase === 'drop') return p.success === true ? 'done' : 'try';
      if (type === 'tap_add') return 'other';
      return null;
    case 'reset':
      return type === 'reset' ? 'done' : null;
    case 'help':
      return type === 'help' ? 'done' : null;
  }
}

/** Does this answer end the gesture? */
export const ends = (g: GestureId, hit: ReturnType<typeof gestureHit>) => hit === 'done' || (hit === 'other' && g === 'tap');

const arrows = (n: number): Program => Array.from({ length: n }, () => ({ t: 'cmd', cmd: 'right' }));

/** The two tiny pages: one step to the seed (tap, ▶); three steps (drag, ↺, ✋). Kid titles: the bar shows them. */
export function toolLevels(): [LevelDef, LevelDef] {
  const page = (n: 1 | 2, cols: number, title: string): LevelDef => ({
    id: `tool-${n}`,
    grade: '1ro',
    page: n,
    title,
    say: GESTURES.find((g) => g.page === n - 1)!.say,
    mode: 'program',
    // two rows: a one-row board gets a tall sky that a two-cell page cannot fill
    worlds: [openBoard({ cols, rows: 2, start: [0, 1], goal: [cols - 1, 1], seed: 9100 + n, grass: [[0, 0], [cols - 1, 0]] })],
    blocks: ['right'],
    blockLabel: 'picture-word',
    slots: cols - 1,
    solution: arrows(cols - 1),
  });
  return [page(1, 2, 'Tocar y probar'), page(2, 4, 'Arrastrar')];
}
