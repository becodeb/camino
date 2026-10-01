// The playtest's top bar (round 2): no page icons, doors or boss frame
// (the year's sheet pages are hidden in the playtest), only a simple
// progress for the activity on screen. A step or an activity provides it
// (BarProgressContext) around its pages; the instrumented level pages show
// it in the bar's place of the pages (PlaytestLevel's nav).
// - `dots`: stones along a short path, the done ones with a seed, the one on
//   screen circled (the tool check's gestures, the ladder's items, a
//   sheet's core pages, the rule game's pages);
// - `path`: the way chosen on "¿Cómo seguís?" (a small drawing of it).

import { createContext, useContext } from 'react';
import type { Door } from '../curriculum/model';
import { PathArt, ProgressStones } from './round2Art';

export type BarProgress =
  | { kind: 'dots'; done: boolean[]; here: number }
  | { kind: 'path'; door: Door | 'boss' }
  | null;

export const BarProgressContext = createContext<BarProgress>(null);

const PATH_WORD: Record<Door | 'boss', string> = { easy: 'más fácil', medium: 'igual', hard: 'más difícil', boss: 'el desafío' };

export function BarProgressView() {
  const p = useContext(BarProgressContext);
  if (!p) return null;
  if (p.kind === 'path') {
    if (p.door === 'boss') return null;
    return <span className="pp-progress is-path" role="img" aria-label={`Camino ${PATH_WORD[p.door]}`}><PathArt door={p.door} mini /></span>;
  }
  return (
    <span className="pp-progress" role="img" aria-label={`${p.done.filter(Boolean).length} de ${p.done.length}`}>
      <ProgressStones done={p.done} here={p.here} />
    </span>
  );
}
