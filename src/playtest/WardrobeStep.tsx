// The wardrobe (2–3 min): the year's wardrobe (WardrobePage) with the
// session's progress, open, and the pieces unlocking at a few seeds instead
// of the year's milestones (PLAYTEST_UNLOCKS, installed by PlaytestScreen):
// two pieces for everyone, more with more seeds, every threshold shown on
// its piece as a seed and a number. Seeds are never spent; a piece is chosen,
// never drawn. The page to turn is "listo"; after about three minutes the
// character says how nice it looks and the next step comes.
//
// Logged (`wardrobe`): `open` (seeds, the pieces unlocked), every tap on a
// piece (`on`, `off`, or `locked` with the seeds it needs), a character
// changed (`character`), and `close` (the outfit kept, the character, the
// time, the taps, why: `done` | `time` | `left`).

import { useEffect, useRef, useState } from 'react';
import type { Item, ItemId } from '../curriculum/motivation';
import { progress, setWardrobe } from '../curriculum/progress';
import { outfitOf, unlockOf, unlockedItems } from '../curriculum/rewards';
import { WardrobePage } from '../screens/WardrobeScreen';
import { usePlaytest } from './context';
import { Cheer } from './interlude';

/**
 * Seeds for each piece in the playtest (the year's are 3 to 50 seeds and
 * whole sheets): the scarf and the mushroom hat for everyone, then one piece
 * every three or four seeds. A session plants about 2 (tool check) + 2–6
 * (ladder) + 3–10 (free play).
 */
export const PLAYTEST_UNLOCKS: Record<ItemId, { seeds: number }> = {
  bufanda: { seeds: 0 },
  hongo: { seeds: 0 },
  mochila: { seeds: 4 },
  capa: { seeds: 7 },
  botas: { seeds: 10 },
  flotador: { seeds: 13 },
  corona: { seeds: 16 },
};

/** About three minutes, then a gentle move on. */
export const WARDROBE_MS = 3 * 60_000;

const LINES = {
  time: '¡Qué lindo quedó! Vamos a seguir.',
};

export function WardrobeStep() {
  const { next, log, did } = usePlaytest();
  const since = useRef(Date.now());
  const taps = useRef(0);
  const closed = useRef(false);
  const [timeUp, setTimeUp] = useState(false);

  const close = (reason: 'done' | 'time' | 'left') => {
    if (closed.current) return;
    closed.current = true;
    const p = progress.get();
    log('wardrobe', { action: 'close', reason, outfit: outfitOf(p), character: p.character, duration_ms: Date.now() - since.current, taps: taps.current, seeds: p.seeds });
  };

  useEffect(() => {
    progress.update((p) => setWardrobe(p, true));
    const p = progress.get();
    log('wardrobe', { action: 'open', seeds: p.seeds, unlocked: unlockedItems(p) });
    did('wardrobe');
    const t = setTimeout(() => { close('time'); setTimeUp(true); }, WARDROBE_MS);
    return () => { clearTimeout(t); close('left'); };
    // once, when the step opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (timeUp) return <Cheer line="¡Qué lindo!" say={LINES.time} done={next} />;

  const tap = (item: Item, result: 'on' | 'off' | 'locked') => {
    taps.current++;
    const u = unlockOf(item);
    log('wardrobe', { action: result, outfit_id: item.id, slot: item.slot, ...(result === 'locked' && 'seeds' in u ? { needs: u.seeds } : {}) });
  };

  return (
    <WardrobePage
      title={<b>Vestidor</b>}
      quit={null}
      onPick={(id) => { log('wardrobe', { action: 'character', character: id }); log('choice', { activity: 'character', character: id, where: 'wardrobe' }); }}
      onTap={tap}
      next={() => { close('done'); next(); }}
    />
  );
}
