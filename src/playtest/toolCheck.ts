// The tool check's plan, pure (the screen is ToolCheck.tsx): two tiny pages
// built with the real engine and 1ro's arrow, and five gestures, one at a
// time, each asked aloud and detected from the events the page logs. Round
// 2 (the first try was slow and forcing): the three that make a program are
// asked (put the arrow in the notebook, ▶ Probar, put an arrow in again),
// and any equivalent gesture counts (a tap or a drag both put the block
// in; `via` says which); ↺ and ✋ are only shown (the ghost hand points at
// each while it is said what it does) and a press is welcome but never
// waited for. An asked gesture not done in GHOST_AFTER_MS is shown by the
// ghost hand; MOVE_ON_MS after it starts the check moves on anyway. Once the
// first gesture is done a drawn "seguir" arrow lets the child skip the rest.
// Each gesture logs one `tool_check`.

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
  /** Asked (waited for, up to MOVE_ON_MS) or only shown (SHOW_MS, the ghost points at once). */
  asked: boolean;
  /** What the pen ring circles, and what the ghost hand does (selectors inside the page). */
  cue: string;
  ghost: { do: 'tap'; at: string } | { do: 'drag'; from: string; to: string } | { do: 'point'; at: string };
}

const ARROW = '.zone-palette [data-cmd="right"]';

export const GESTURES: readonly Gesture[] = [
  { id: 'tap', page: 0, asked: true, say: 'Tocá la flecha. Así va al cuaderno.', cue: ARROW, ghost: { do: 'tap', at: ARROW } },
  { id: 'play', page: 0, asked: true, say: 'Ahora tocá Probar, y mirá qué pasa.', cue: '.btn-play', ghost: { do: 'tap', at: '.btn-play' } },
  { id: 'drag', page: 1, asked: true, say: 'También podés arrastrar la flecha hasta el cuaderno. Probá.', cue: ARROW, ghost: { do: 'drag', from: ARROW, to: '.zone-program [data-key="end0"]' } },
  { id: 'reset', page: 1, asked: false, say: 'Esta flecha que da la vuelta borra todo, para empezar de nuevo.', cue: '.btn-restart', ghost: { do: 'point', at: '.btn-restart' } },
  { id: 'help', page: 1, asked: false, say: 'Y esta es la mano de ayuda. Si no sabés qué hacer, tocala.', cue: '.level-bar .help', ghost: { do: 'point', at: '.level-bar .help' } },
];

/** An asked gesture not done by then: the ghost hand shows it. */
export const GHOST_AFTER_MS = 8_000;
/** An asked gesture not done by then (from its start): the check moves on. */
export const MOVE_ON_MS = 15_000;
/** How long a shown gesture stays (pointed at and said) before the next one. */
export const SHOW_MS = 5_000;

export const LINES = {
  done: '¡Muy bien! Ya sabés usar todo. ¡Vamos!',
};

/**
 * What a logged event means for the gesture being asked: `done`, with the
 * way it was done (`tap` or `drag` for a block put in the notebook); `try`
 * (a try that did not work: a drag dropped nowhere); null (unrelated).
 * `reset` is the screen's own signal (↺ logs no event).
 */
export function gestureHit(g: GestureId, type: string, p: Record<string, unknown>): { hit: 'done' | 'try'; via?: 'tap' | 'drag' } | null {
  switch (g) {
    case 'tap':
    case 'drag':
      if (type === 'tap_add') return { hit: 'done', via: 'tap' };
      if (type === 'drag' && p.phase === 'drop') return p.success === true ? { hit: 'done', via: 'drag' } : { hit: 'try', via: 'drag' };
      return null;
    case 'play':
      return type === 'run' ? { hit: 'done' } : null;
    case 'reset':
      return type === 'reset' ? { hit: 'done' } : null;
    case 'help':
      return type === 'help' ? { hit: 'done' } : null;
  }
}

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
