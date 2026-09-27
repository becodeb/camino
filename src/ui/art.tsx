// Small drawings the pages share: Brote's portrait, the rubber stamp of a
// finished page, the page icons of the tramo, the seed and the pot of the
// drawn instruction, the dotted "then" arrow and the big arrows of sala 4.
// Same ink, same weights as the board (docs/05 of habilidades).

import { memo, useEffect, useRef } from 'react';
import { blob, leaf, penLoop, wobblyLine, wobblyPoly } from '../ink/ink.js';
import type { CharacterDef } from '../ink/characters.js';
import type { Dir } from '../game/model';
import { drawPortrait } from './board/BoardView';

const INK = '#2b2622';
const PEN = '#3d6ea5';
const STAMP = '#c9574a';

export function Portrait({ def, mood = 'smile', className }: { def: CharacterDef; mood?: 'smile' | 'grin'; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => { if (ref.current) drawPortrait(def, ref.current, { x: 0.15, y: 0.25 }, mood); }, [def, mood]);
  return <svg ref={ref} className={className} viewBox="-52 -100 104 104" aria-hidden="true" />;
}

/**
 * The rubber stamp of a finished page: a double ring and a sprouting seed, in
 * red ink. Inside another SVG (the map) it takes a place: `x`, `y` (its
 * centre) and `size`.
 */
export const Stamp = memo(function Stamp({ seed = 1, className, x, y, size }: { seed?: number; className?: string; x?: number; y?: number; size?: number }) {
  const place = size != null ? { x: (x ?? 0) - size / 2, y: (y ?? 0) - size / 2, width: size, height: size } : {};
  return (
    <svg className={`stamp ${className ?? ''}`} viewBox="0 0 100 100" aria-hidden="true" {...place}>
      <g filter="url(#rough)" fill="none" stroke={STAMP} strokeLinecap="round" strokeLinejoin="round" opacity="0.88">
        <path d={blob(50, 50, 44, 43, { wob: 0.02, n: 14, seed })} strokeWidth={5.5} />
        <path d={blob(50, 50, 35, 34, { wob: 0.025, n: 12, seed: seed + 1 })} strokeWidth={2.2} strokeDasharray="3 5" />
        <path d="M50,70 C47,60 53,52 50,40" strokeWidth={4} />
        <path d={leaf(50, 46, 33, 36, 8)} fill={STAMP} fillOpacity={0.25} strokeWidth={3.4} />
        <path d={leaf(50, 42, 68, 30, 8)} fill={STAMP} fillOpacity={0.25} strokeWidth={3.4} />
        <path d={blob(50, 73, 11, 8, { seed: seed + 2, n: 9 })} fill={STAMP} fillOpacity={0.35} strokeWidth={3.4} />
      </g>
    </svg>
  );
});

/** A page of the tramo in the bar: blank, the one on screen, stamped, or not drawn yet (dashed). */
export function PageIcon({ state, seed = 1 }: { state: 'todo' | 'here' | 'done' | 'future'; seed?: number }) {
  const d = wobblyPoly([[3, 3], [23, 3], [29, 9], [29, 37], [3, 37]], { wob: 0.5, bow: 0.6, seed });
  return (
    <svg className={`page-icon is-${state}`} viewBox="0 0 32 40" aria-hidden="true">
      <path d={d} transform="translate(2 2.5)" fill="rgba(84, 62, 38, 0.2)" />
      <path d={d} fill={state === 'future' ? 'none' : '#fbf7ee'} stroke={state === 'future' ? 'rgba(43,38,34,0.4)' : INK} strokeWidth={2} strokeDasharray={state === 'future' ? '2 4' : undefined} strokeLinejoin="round" />
      {state !== 'future' && <path d="M23,3 L23,9 L29,9" fill="none" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />}
      {state !== 'future' && [16, 22, 28].map((y, i) => <path key={y} d={`M7,${y} L${i === 2 ? 17 : 24},${y}`} stroke={PEN} strokeOpacity={0.35} strokeWidth={1.6} strokeLinecap="round" />)}
    </svg>
  );
}

/** A seed with two leaves (what Brote goes to fetch). */
export function SeedIcon({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="-24 -30 48 50" width={size} height={size} aria-hidden="true" className="doodle">
      <g filter="url(#rough)" stroke={INK} strokeLinecap="round" strokeLinejoin="round">
        <path d="M0,4 C-2,-4 2,-9 0,-15" fill="none" strokeWidth={2.4} />
        <path d={leaf(0, -12, -14, -20, 5.5)} fill="#a4b86d" strokeWidth={2.2} />
        <path d={leaf(0, -14, 13, -23, 5.5)} fill="#a4b86d" strokeWidth={2.2} />
        <path d={blob(0, 8, 13, 11, { wob: 0.05, n: 9, seed: 3 })} fill="#f0d27a" strokeWidth={2.6} />
      </g>
    </svg>
  );
}

/** The clay pot where the seed is planted. */
export function PotIcon({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="-26 -24 52 56" width={size} height={size} aria-hidden="true" className="doodle">
      <g filter="url(#rough)" stroke={INK} strokeLinejoin="round" strokeLinecap="round">
        <path d={wobblyPoly([[-19, -4], [19, -4], [14, 26], [-14, 26]], { wob: 0.5, bow: 0.8, seed: 2 })} fill="#d98a5f" strokeWidth={2.6} />
        <path d={wobblyPoly([[-23, -14], [23, -14], [22, -3], [-22, -3]], { wob: 0.5, bow: 0.6, seed: 3 })} fill="#de8a56" strokeWidth={2.6} />
        <path d="M-18,-14 Q0,-19 18,-14" fill="#6e5a48" strokeWidth={2} />
      </g>
    </svg>
  );
}

/** The dotted blue "then" arrow of the drawn instruction. */
export function ThenArrow() {
  return (
    <svg viewBox="0 0 40 20" width={40} height={20} aria-hidden="true" className="doodle then-arrow">
      <path d="M3,12 Q18,4 32,10" fill="none" stroke={PEN} strokeWidth={2.6} strokeLinecap="round" strokeDasharray="1 6" />
      <path d="M27,5 L34,10.5 L27,15" fill="none" stroke={PEN} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** "Next page": a big paper page with a folded corner and a blue arrow, drawn, no words. */
export function NextPageArt() {
  const d = wobblyPoly([[6, 4], [48, 4], [62, 18], [62, 74], [6, 74]], { wob: 0.8, bow: 1.2, seed: 5 });
  return (
    <svg viewBox="0 0 70 80" aria-hidden="true" className="next-art">
      <g filter="url(#rough)">
        <path d={d} fill="#fbf7ee" stroke={INK} strokeWidth={2.8} strokeLinejoin="round" />
        <path d="M48,4 L48,18 L62,18" fill="none" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
        {[30, 40, 50, 60].map((y) => <path key={y} d={`M13,${y} L55,${y}`} stroke={PEN} strokeOpacity={0.3} strokeWidth={2} />)}
        <path d={wobblyLine(16, 45, 48, 44, { bow: 1.4, seed: 3 })} fill="none" stroke={PEN} strokeWidth={4.4} strokeLinecap="round" />
        <path d="M39,34 Q45,39 50,44 Q44,49 38,55" fill="none" stroke={PEN} strokeWidth={4.4} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

const PAD_ROT: Record<Dir, number> = { up: -90, right: 0, down: 90, left: 180 };

/** Sala 4's big arrows: a fat drawn arrow, no words. */
export const PadArrow = memo(function PadArrow({ dir }: { dir: Dir }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="pad-arrow">
      <g transform={`rotate(${PAD_ROT[dir]} 32 32)`} filter="url(#rough)">
        <path d="M8,25 L34,24 L33,11 L57,32 L33,53 L34,40 L8,39 Z" fill="#fbf7ee" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        <path d="M13,31 L40,31" stroke={INK} strokeOpacity={0.35} strokeWidth={1.6} strokeLinecap="round" />
      </g>
    </svg>
  );
});

/** The jar of points (3ro page 2), for the drawn instruction. */
export function JarIcon({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="-24 -26 48 52" width={size} height={size} aria-hidden="true" className="doodle">
      <g filter="url(#rough)" stroke={INK} strokeLinejoin="round" strokeLinecap="round">
        <path d="M-15,-8 L15,-8 L18,-1 L17,22 L-17,22 L-18,-1 Z" fill="#eef0e4" strokeWidth={2.6} />
        <path d="M-17,-15 L17,-15 L16,-7 L-16,-7 Z" fill="#de8a56" strokeWidth={2.4} />
        <path d={blob(-6, 13, 6, 5, { seed: 2, n: 8 })} fill="#f0d27a" strokeWidth={2} />
        <path d={blob(7, 14, 6, 5, { seed: 3, n: 8 })} fill="#f0d27a" strokeWidth={2} />
        <path d={blob(1, 4, 6, 5, { seed: 4, n: 8 })} fill="#f0d27a" strokeWidth={2} />
      </g>
    </svg>
  );
}

/**
 * The game's lamp, stuck on the corner of the sheet: off (grey glass) while
 * the rules wait, lit with rays while the game runs and they are listening.
 */
export function PlayLamp({ on }: { on: boolean }) {
  return (
    <svg className={`play-lamp${on ? ' is-on' : ''}`} viewBox="-30 -34 60 66" aria-hidden="true">
      <g filter="url(#rough)" strokeLinecap="round" strokeLinejoin="round">
        <g className="lamp-rays" stroke={PEN} strokeWidth={3}>
          {[-150, -115, -65, -30, 0, 180].map((a) => {
            const r = (a * Math.PI) / 180;
            return <path key={a} d={`M${(Math.cos(r) * 22).toFixed(1)},${(Math.sin(r) * 22 - 6).toFixed(1)} L${(Math.cos(r) * 29).toFixed(1)},${(Math.sin(r) * 29 - 6).toFixed(1)}`} />;
          })}
        </g>
        <path d={blob(0, -6, 15, 16, { seed: 5, n: 10 })} fill={on ? '#f0d27a' : '#e2dccd'} stroke={INK} strokeWidth={2.6} />
        <path d="M-5,-4 Q0,-12 5,-4" fill="none" stroke={INK} strokeWidth={1.8} opacity={0.7} />
        <path d="M-8,10 L8,10 L7,18 L-7,18 Z" fill="#9f937f" stroke={INK} strokeWidth={2.4} />
        <path d="M-7,14 L7,14" stroke={INK} strokeWidth={1.6} />
      </g>
    </svg>
  );
}

/** A pen loop around something (the page on screen). */
export function PenRing({ seed = 1 }: { seed?: number }) {
  return (
    <svg className="pen-ring" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d={penLoop(50, 50, 45, 43, { seed })} fill="none" stroke={PEN} strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
