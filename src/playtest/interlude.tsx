// The calm pages between the playtest's activities: a short look at the
// child's own garden (between the ladder's items, after the tool check,
// between free-play activities), and the cheer at the end of the ladder
// ("¡Muy bien! Vamos a jugar"). No scores, no "wrong": whatever happened,
// the child always has something worth a look.
//
// T31: this replaced the old "character hops slowly to a leaf" interlude
// (~3.8 s, read by the teacher as a loading screen — only 4/42 kids ever
// saw their garden, at the very end). Now every step between activities is
// itself a glimpse of the garden: the plants already there sit still, the
// newest one (SessionGarden's `onlyNewest`) grows in with its own little
// animation, the character stands beside it and cheers — understood with
// no sound, since growing + a happy character reads as "you got something"
// on its own. An empty garden (nothing earned yet, e.g. right after the
// tool check) shows the same dug, waiting first bed the goodbye and the
// class-end rest already use for zero seeds — a sensible "about to plant a
// seed", not a new drawing.

import { useEffect, useRef, useState } from 'react';
import { NextPageArt } from '../ui/art';
import { speakWhenAllowed } from '../ui/speech';
import { usePlayer, useStage } from '../screens/player';
import { realTimeout } from './demo';
import { SessionGarden } from './SessionGarden';

/** How long the garden shows before moving on by itself (shorter than the old walk: a look, not a wait). */
export const WALK_ON_MS = 2600;
/** A character or a garden that fails to render never keeps the child waiting past this. */
export const WALK_ON_FALLBACK_MS = 9000;

/**
 * Between two pages: a short look at the child's garden (the newest plant
 * growing in, the character beside it, happy), then `done` — automatically
 * after WALK_ON_MS, or right away on a tap anywhere (skip ahead).
 */
export function WalkOn({ line, done }: { line: string; done(): void }) {
  const doneRef = useRef(done);
  doneRef.current = done;
  const went = useRef(false);
  const go = () => { if (!went.current) { went.current = true; doneRef.current(); } };
  // the character cheers a beat after mount (as the goodbye's own garden does), not at 0ms: it needs to be standing there first
  const [cheer, setCheer] = useState(0);
  useEffect(() => {
    const off = speakWhenAllowed(line);
    const c = realTimeout(() => setCheer(1), 700);
    const t = realTimeout(go, WALK_ON_MS);
    // a garden that fails to render (or any other stall) never keeps the child waiting
    const guard = realTimeout(go, WALK_ON_FALLBACK_MS);
    return () => { off(); clearTimeout(c); clearTimeout(t); clearTimeout(guard); };
    // once per look
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <main className="pp-page pp-walk" data-interlude="walk" onClick={go}>
      <section className="sheet pp-walk-card" aria-label={line}>
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <p className="pp-walk-say" aria-hidden="true">{line}</p>
        <div className="pp-walk-garden"><SessionGarden cheer={cheer} onlyNewest /></div>
      </section>
    </main>
  );
}

/** The end of an activity: the character cheers, it is said aloud, and the page turns (by itself after a while). */
export function Cheer({ line, say, done, autoMs = 5000 }: { line: string; say: string; done(): void; autoMs?: number }) {
  const player = usePlayer();
  const box = { x: -300, y: -190, w: 600, h: 250 };
  const { ref, view } = useStage(player, box, { shadow: true });
  const doneRef = useRef(done);
  doneRef.current = done;
  const went = useRef(false);
  const go = () => { if (!went.current) { went.current = true; doneRef.current(); } };
  useEffect(() => {
    const off = speakWhenAllowed(say);
    const t = setTimeout(() => void view.current?.cheer(), 600);
    const auto = setTimeout(go, autoMs);
    return () => { off(); clearTimeout(t); clearTimeout(auto); };
    // once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <main className="pp-page pp-walk pp-cheer" data-interlude="cheer">
      <section className="sheet pp-walk-card" aria-label={say}>
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <p className="pp-walk-say pp-cheer-say" aria-hidden="true">{line}</p>
        <div className="pp-walk-stage pp-cheer-stage">
          <svg ref={ref} className="pp-walk-actor" aria-hidden="true" />
        </div>
        <button type="button" className="next-page cut pop-in pp-cheer-next" aria-label="Seguir" onClick={go}><NextPageArt /></button>
      </section>
    </main>
  );
}
