// The showcase (sheet 17): the pages a child can show the family. Any page
// solved on a sheet of pages (a core page or a boss; the doors' extras are
// generated, not the child's own) and the levels made on this device in the
// workshops. Pure: what can be picked, in the year's order, and the page a
// favourite plays as.

import type { LevelDef } from '../game/levels';
import { bossId, coreId, hasCore } from './model';
import { PRIMER, sheetByN } from './primer';
import type { Progress } from './progress';
import { cardLevel, cardLevelId } from './workshop';

/** A page the child can show: its level id (a favourite's key), where it comes from, its page. */
export interface ShowPage {
  id: string;
  /** The sheet it belongs to (a workshop's for a level made there). */
  sheet: number;
  kind: 'core' | 'boss' | 'made';
  /** Core pages: the page's number on its sheet. */
  k?: number;
  level: LevelDef;
}

/** Every page the child solved and may show, in the year's order: each sheet's core pages and boss, then the levels made here. */
export function showPages(p: Progress): ShowPage[] {
  const out: ShowPage[] = [];
  for (const s of PRIMER.filter(hasCore)) {
    s.core.forEach((c, i) => {
      const id = coreId(s, i + 1);
      if (p.solved[id]) out.push({ id, sheet: s.n, kind: 'core', k: i + 1, level: c.level });
    });
    if (s.boss && p.solved[bossId(s)]) out.push({ id: bossId(s), sheet: s.n, kind: 'boss', level: s.boss });
  }
  for (const m of p.made) {
    const ws = sheetByN(m.sheet);
    if (!ws?.workshop) continue;
    const id = cardLevelId(m.id);
    if (p.solved[id]) out.push({ id, sheet: m.sheet, kind: 'made', level: cardLevel(m, ws) });
  }
  return out;
}

/** The child's favourites that can still be shown (solved, and a made level not cleared), in the order they were picked. */
export function favoritePages(p: Progress): ShowPage[] {
  const all = new Map(showPages(p).map((s) => [s.id, s]));
  return p.favorites.flatMap((id) => (all.has(id) ? [all.get(id)!] : []));
}

/** The showcase needs two pages at least to go on to the family. */
export const MIN_FAVORITES = 2;
