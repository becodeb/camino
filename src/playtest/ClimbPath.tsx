// T39: the long ladder's visible progress (4to): a mountain beside the page
// with the way up drawn as switchbacks, one camp per rung from where this
// child started to the summit (rung 18). A rung passed in this ladder gets
// a flag; the rung on screen is circled; the rest of the way is still to
// climb. Drawn in code in the notebook's ink (no picture of a score, never a
// "wrong" mark: a rung not passed just has no flag).

import { memo } from 'react';
import { wobblyLine, wobblyPoly } from '../ink/ink.js';
import { INK, PEN } from '../ui/forestArt';

const W = 120;
const STEP = 52;
const PAD_TOP = 64;
const PAD_BOTTOM = 30;

export interface ClimbProps {
  /** The lowest rung shown (the entry, or the floor check below it). */
  from: number;
  /** The summit. */
  top: number;
  /** Rungs passed in this ladder. */
  passed: readonly number[];
  /** The rung on screen. */
  here: number;
}

export const ClimbPath = memo(function ClimbPath({ from, top, passed, here }: ClimbProps) {
  const n = top - from + 1;
  const h = PAD_TOP + (n - 1) * STEP + PAD_BOTTOM;
  const yOf = (r: number) => PAD_TOP + (top - r) * STEP;
  const xOf = (r: number) => ((r - from) % 2 === 0 ? 38 : 82);
  const rungs = Array.from({ length: n }, (_, i) => from + i);
  const done = new Set(passed);
  const mountain = wobblyPoly([[W / 2, 12], [W - 2, h - 4], [2, h - 4]], { wob: 0.6, bow: 0.4, seed: 18 });
  const climbed = Math.max(from - 1, ...passed);
  return (
    <svg className="pp-climb" viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="xMidYMax meet" role="img" aria-label={`Escalera: ${passed.length} ${passed.length === 1 ? 'escalón subido' : 'escalones subidos'}`} data-here={here} data-passed={passed.join(' ')}>
      <path d={mountain} fill="#ece4d2" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
      {/* hatching on the shady side */}
      {Array.from({ length: Math.floor(h / 26) }, (_, i) => {
        const y = 40 + i * 26;
        const half = ((y - 14) / (h - 20)) * (W / 2 - 4);
        return <path key={i} d={wobblyLine(W / 2 + 4, y, W / 2 + half - 4, y + 10, { seed: i + 4 })} stroke={INK} strokeWidth={0.9} opacity={0.22} fill="none" />;
      })}
      {/* the way up: dashed where it is still to climb, inked where it is climbed */}
      {rungs.slice(1).map((r) => (
        <path
          key={`w${r}`} d={wobblyLine(xOf(r - 1), yOf(r - 1), xOf(r), yOf(r), { seed: r })} fill="none"
          stroke={r <= climbed ? PEN : INK} strokeWidth={r <= climbed ? 3.2 : 1.6} strokeDasharray={r <= climbed ? undefined : '4 5'} opacity={r <= climbed ? 0.95 : 0.5}
        />
      ))}
      {/* the summit */}
      <g transform={`translate(${W / 2} 24) scale(1.3)`}>
        <path d="M0,-11 L3.2,-3.6 L11,-3.2 L5,2.3 L6.9,10 L0,6 L-6.9,10 L-5,2.3 L-11,-3.2 L-3.2,-3.6 Z" fill={done.has(top) ? '#f5c64f' : '#faf6ec'} stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
      </g>
      {rungs.map((r) => {
        const x = xOf(r), y = yOf(r);
        const isHere = r === here;
        return (
          <g key={r} transform={`translate(${x} ${y})`} className={`pp-climb-camp${isHere ? ' is-here' : ''}${done.has(r) ? ' is-passed' : ''}`} data-rung={r}>
            {isHere && <circle r={18} fill="rgba(122, 166, 232, 0.25)" stroke={PEN} strokeWidth={3.4} className="pp-climb-ring" />}
            <ellipse rx={11} ry={6.5} fill={done.has(r) ? '#a4b86d' : '#faf6ec'} stroke={INK} strokeWidth={2.2} />
            {done.has(r) && (
              <g transform="translate(0 -3)">
                <path d="M0,0 L0,-32" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
                <path d="M0,-32 L20,-25.5 L0,-18 Z" fill="#d9573f" stroke={INK} strokeWidth={1.9} strokeLinejoin="round" />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
});
