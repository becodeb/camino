// Levels the playtest can play, by id: 1ro's sheets' core pages
// (`1ro-h<n>-<k>`, curriculum/primer.ts) and the demo's pages (`2do-1`,
// `3ro-2`, game/levels.ts). And the program as run, written compactly for
// the `run` event.

import { sheetByN } from '../curriculum/primer';
import { levelById, type LevelDef } from '../game/levels';
import { isHole, type Program } from '../game/model';

/** The placement ladder's stand-in until T4: two fixed pages (a short sequence, a fix page). */
export const SAMPLE_LEVELS = ['1ro-h1-2', '1ro-h3-1'] as const;

export function pilotLevel(id: string): LevelDef | null {
  const m = id.match(/^1ro-h(\d+)-(\d+)$/);
  if (m) return sheetByN(Number(m[1]))?.core[Number(m[2]) - 1]?.level ?? null;
  return levelById(id) ?? null;
}

/**
 * A program as one short line: commands by id, an empty line as `_`, a
 * repeat as `rep3(right up)` or `repgoal(right)`, a missing count as
 * `rep?(…)`. e.g. `right right rep3(up) _`.
 */
export function programText(p: Program): string {
  return p.map((it) => {
    if (it.t === 'cmd') return isHole(it.cmd) ? '_' : it.cmd;
    const n = it.count === 'goal' ? 'goal' : it.count === 0 ? '?' : String(it.count);
    return `rep${n}(${it.body.map((c) => (isHole(c) ? '_' : c)).join(' ')})`;
  }).join(' ');
}

/** The cards in the notebook (empty lines do not count; a repeat counts itself and its body). */
export function blocksOf(p: Program): number {
  return p.reduce((n, it) => (it.t === 'cmd' ? n + (isHole(it.cmd) ? 0 : 1) : n + 1 + it.body.filter((c) => !isHole(c)).length), 0);
}
