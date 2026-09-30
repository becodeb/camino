// The calm pages between the playtest's activities: the child's character
// walks along a dotted path to the next page (between the ladder's items,
// after the tool check), and the cheer at the end of the ladder ("¡Muy
// bien! Vamos a jugar"). No scores, no "wrong": whatever happened, the
// character just walks on. Drawn in the house style: ink ground line, blue
// pen dots, a taped sheet of paper waiting at the end.

import { useEffect, useMemo, useRef } from 'react';
import { rng, wobblyLine, wobblyPoly } from '../ink/ink.js';
import { NextPageArt } from '../ui/art';
import { speakWhenAllowed } from '../ui/speech';
import { usePlayer, useStage } from '../screens/player';

const INK = '#2b2622';
const PEN = '#3d6ea5';

/** The scene's coordinates: the character's feet at (0, 0), the ground at y = 0, the page waiting at x = WALK_TO. */
const BOX = { x: -120, y: -190, w: 900, h: 250 };
const WALK_TO = 600;

/** The ground, three tufts of grass and the dotted way to a sheet of paper, one drawing per seed. */
function WalkScene({ seed, page = true }: { seed: number; page?: boolean }) {
  const art = useMemo(() => {
    const r = rng(seed);
    const ground = wobblyLine(BOX.x + 30, 8, BOX.x + BOX.w - 30, 6, { bow: 3, seed, segs: 5, jit: 1.2 });
    const tufts = [-60, 250, 470].map((x, i) => {
      const cx = x + (r() - 0.5) * 40;
      return [-7, 0, 7].map((dx, k) => wobblyLine(cx + dx * 0.4, 6, cx + dx, -9 - (k === 1 ? 5 : 0), { bow: 1, seed: seed * 7 + i * 3 + k })).join(' ');
    });
    // the sheet waiting at the end: a page with its lines, tilted, taped
    const sheet = wobblyPoly([[WALK_TO + 46, -118], [WALK_TO + 136, -124], [WALK_TO + 142, -6], [WALK_TO + 50, -2]], { wob: 1.5, bow: 2, seed: seed + 5 });
    const lines = [0, 1, 2, 3].map((i) => wobblyLine(WALK_TO + 62, -92 + i * 20, WALK_TO + 126, -94 + i * 20, { bow: 1, seed: seed + 11 + i }));
    return { ground, tufts, sheet, lines };
  }, [seed]);
  return (
    <svg className="pp-walk-scene" viewBox={`${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}`} aria-hidden="true">
      <g filter="url(#boil)">
        <path d={art.ground} fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        {art.tufts.map((d, i) => <path key={i} d={d} fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" opacity="0.8" />)}
        <path d={`M40,-6 C200,-20 380,4 ${WALK_TO + 20},-8`} fill="none" stroke={PEN} strokeWidth="3.2" strokeLinecap="round" strokeDasharray="1 11" />
      </g>
      {page && (
        <g className="pp-walk-page">
          <path d={art.sheet} transform="translate(5 6)" fill="rgba(84, 62, 38, 0.2)" />
          <path d={art.sheet} fill="#fbf7ee" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" filter="url(#rough)" />
          {art.lines.map((d, i) => <path key={i} d={d} fill="none" stroke={PEN} strokeWidth="1.8" strokeLinecap="round" opacity="0.45" />)}
          <rect x={WALK_TO + 70} y={-134} width="46" height="16" rx="2" fill="rgba(222, 204, 158, 0.85)" transform={`rotate(-8 ${WALK_TO + 93} -126)`} />
        </g>
      )}
    </svg>
  );
}

/** Between two pages: the character walks to the next one (about 3 s), then `done`. */
export function WalkOn({ seed, line, done }: { seed: number; line: string; done(): void }) {
  const player = usePlayer();
  const { ref, view } = useStage(player, BOX, { shadow: false });
  const doneRef = useRef(done);
  doneRef.current = done;
  useEffect(() => {
    let live = true;
    const off = speakWhenAllowed(line);
    const t = setTimeout(async () => {
      await view.current?.walkTo(WALK_TO, 150);
      if (live) setTimeout(() => live && doneRef.current(), 350);
    }, 500);
    // a character that cannot walk (no view) never keeps the child waiting
    const guard = setTimeout(() => live && doneRef.current(), 9000);
    return () => { live = false; off(); clearTimeout(t); clearTimeout(guard); };
    // once per walk
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <main className="pp-page pp-walk" data-interlude="walk">
      <section className="sheet pp-walk-card" aria-label={line}>
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <p className="pp-walk-say" aria-hidden="true">{line}</p>
        <div className="pp-walk-stage">
          <WalkScene seed={seed} />
          <svg ref={ref} className="pp-walk-actor" aria-hidden="true" />
        </div>
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
