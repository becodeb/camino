// Small drawings the pages share: Brote's portrait, the rubber stamp of a
// finished page, the page icons of the tramo, the seed and the pot of the
// drawn instruction, the dotted "then" arrow and the big arrows of sala 4.
// Same ink, same weights as the board (docs/05 of habilidades).

import { memo, useEffect, useRef } from 'react';
import { blob, leaf, penLoop, wobblyLine, wobblyPoly } from '../ink/ink.js';
import type { CharacterDef } from '../ink/characters.js';
import type { Outfit } from '../curriculum/motivation';
import type { Dir } from '../game/model';
import { drawPortrait } from './board/BoardView';
import { BAR_FILL, barPath } from './noteArt';

const INK = '#2b2622';
const PEN = '#3d6ea5';
const STAMP = '#c9574a';
/** The ink of a gold stamp: a darker gold, legible on paper; its disc is the palette's yellow. */
export const GOLD_INK = '#b3822a';
const GOLD = '#f0d27a';

/** A character's still portrait, dressed in its outfit (ui/outfit.ts). */
export function Portrait({ def, mood = 'smile', className, outfit }: { def: CharacterDef; mood?: 'smile' | 'grin'; className?: string; outfit?: Outfit }) {
  const ref = useRef<SVGSVGElement>(null);
  const key = JSON.stringify(outfit ?? {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (ref.current) drawPortrait(def, ref.current, { x: 0.15, y: 0.25 }, mood, outfit); }, [def, mood, key]);
  return <svg ref={ref} className={className} viewBox="-52 -100 104 104" aria-hidden="true" />;
}

/**
 * The rubber stamp of a finished page: a double ring and a sprouting seed, in
 * red ink; in gold (`tone="gold"`) once the page's save-blocks challenge is
 * solved, on a flat gold disc. Inside another SVG (the map) it takes a place:
 * `x`, `y` (its centre) and `size`.
 */
export const Stamp = memo(function Stamp({ seed = 1, className, x, y, size, tone = 'red' }: { seed?: number; className?: string; x?: number; y?: number; size?: number; tone?: 'red' | 'gold' }) {
  const place = size != null ? { x: (x ?? 0) - size / 2, y: (y ?? 0) - size / 2, width: size, height: size } : {};
  const ink = tone === 'gold' ? GOLD_INK : STAMP;
  return (
    <svg className={`stamp is-${tone} ${className ?? ''}`} viewBox="0 0 100 100" aria-hidden="true" {...place}>
      <g filter="url(#rough)" fill="none" stroke={ink} strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
        {tone === 'gold' && <path d={blob(50, 50, 44, 43, { wob: 0.02, n: 14, seed })} fill={GOLD} fillOpacity={0.7} stroke="none" />}
        <path d={blob(50, 50, 44, 43, { wob: 0.02, n: 14, seed })} strokeWidth={5.5} />
        <path d={blob(50, 50, 35, 34, { wob: 0.025, n: 12, seed: seed + 1 })} strokeWidth={2.2} strokeDasharray="3 5" />
        <path d="M50,70 C47,60 53,52 50,40" strokeWidth={4} />
        <path d={leaf(50, 46, 33, 36, 8)} fill={ink} fillOpacity={0.25} strokeWidth={3.4} />
        <path d={leaf(50, 42, 68, 30, 8)} fill={ink} fillOpacity={0.25} strokeWidth={3.4} />
        <path d={blob(50, 73, 11, 8, { seed: seed + 2, n: 9 })} fill={ink} fillOpacity={0.35} strokeWidth={3.4} />
      </g>
    </svg>
  );
});

/**
 * The gold seal of a page's save-blocks challenge: a paper rosette with two
 * ribbon tails and a sprouting seed in the middle. Waiting (not earned) it is
 * gold with a dashed edge and a dotted seed, an invitation; earned, gold with
 * a flat darker facet, the seed filled in and glints of pen around it.
 */
export const SealArt = memo(function SealArt({ earned, seed = 3 }: { earned: boolean; seed?: number }) {
  const R = 30;
  const pts: [number, number][] = Array.from({ length: 28 }, (_, i) => {
    const a = (i / 28) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? R - 4.5 : R;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  const edge = `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')} Z`;
  const ribbon = (s: number) => wobblyPoly([[s * 4, 18], [s * 16, 14], [s * 22, 50], [s * 14, 44], [s * 8, 52]], { wob: 0.6, bow: 0.8, seed: seed + (s > 0 ? 1 : 2) });
  const face = earned ? GOLD : '#f5dc92';
  return (
    <svg className="seal-art" viewBox="-40 -40 80 96" aria-hidden="true">
      <g filter="url(#rough)" stroke={INK} strokeLinejoin="round" strokeLinecap="round">
        {[-1, 1].map((s) => <path key={s} d={ribbon(s)} fill={earned ? STAMP : '#e7a3a0'} strokeWidth={2.2} />)}
        <path d={edge} transform="translate(3 4)" fill="rgba(84, 62, 38, 0.2)" stroke="none" />
        <clipPath id={`seal-clip-${seed}`}><path d={edge} /></clipPath>
        <g clipPath={`url(#seal-clip-${seed})`}>
          <path d={edge} fill={earned ? '#d9b24e' : face} stroke="none" />
          {earned && <path d={edge} fill={face} stroke="none" transform="translate(-4 -4)" />}
        </g>
        <path d={edge} fill="none" strokeWidth={2.4} strokeDasharray={earned ? undefined : '4 4'} />
        <circle r={20} fill="none" stroke={earned ? GOLD_INK : INK} strokeWidth={1.8} strokeDasharray="2 4" opacity={earned ? 1 : 0.5} />
        <g strokeWidth={2.2} opacity={earned ? 1 : 0.55} strokeDasharray={earned ? undefined : '2 3'}>
          <path d="M0,9 C-2,2 2,-3 0,-10" fill="none" />
          <path d={leaf(0, -7, -11, -14, 4.5)} fill={earned ? '#a4b86d' : 'none'} />
          <path d={leaf(0, -9, 10, -16, 4.5)} fill={earned ? '#a4b86d' : 'none'} />
          <path d={blob(0, 10, 7.5, 6, { seed, n: 9 })} fill={earned ? '#fbf7ee' : 'none'} />
        </g>
        {earned && (
          <g stroke={PEN} strokeWidth={2.4}>
            <path d="M-34,-30 L-28,-24 M-38,-18 L-31,-18" />
            <path d="M33,-31 L27,-25 M37,-19 L30,-19" />
          </g>
        )}
      </g>
    </svg>
  );
});

/** The drawn instruction of a predict page: a cell of the board with a blue pen ring ("tap where he ends"). */
export function GuessIcon({ size = 42 }: { size?: number }) {
  return (
    <svg viewBox="-24 -24 48 48" width={size} height={size} aria-hidden="true" className="doodle">
      <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
        <path d={wobblyPoly([[-19, -18], [19, -19], [18, 19], [-18, 18]], { wob: 0.6, bow: 0.8, seed: 6 })} fill="#f6efdf" stroke={INK} strokeWidth={2.2} />
        <path d={blob(0, 2, 11, 10, { seed: 3, n: 9 })} fill="rgba(114, 152, 193, 0.18)" stroke="none" />
        <path d={penLoop(0, 2, 13, 12, { seed: 4 })} fill="none" stroke={PEN} strokeWidth={3} />
      </g>
    </svg>
  );
}

/** The drawn instruction of a music page: a strip of paper with three coloured bars on it, sounding. */
export function SongIcon({ size = 44 }: { size?: number }) {
  return (
    <svg viewBox="-26 -22 58 44" width={size} height={size} aria-hidden="true" className="doodle">
      <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
        <path d={wobblyPoly([[-23, -14], [17, -15], [18, 14], [-22, 15]], { wob: 0.5, bow: 0.8, seed: 8 })} transform="translate(2 2.5)" fill="rgba(84, 62, 38, 0.2)" />
        <path d={wobblyPoly([[-23, -14], [17, -15], [18, 14], [-22, 15]], { wob: 0.5, bow: 0.8, seed: 8 })} fill="#fbf7ee" stroke={INK} strokeWidth={2.2} />
        {(['do', 'mi', 'sol'] as const).map((p, i) => (
          <path key={p} d={barPath(-13 + i * 11.5, 0, 7, [20, 15, 10.5][i], 1.8, i + 2)} fill={BAR_FILL[p]} stroke={INK} strokeWidth={1.8} />
        ))}
        <path d="M22,-7 Q26.5,0 22,7" fill="none" stroke={PEN} strokeWidth={2.4} />
        <path d="M27,-13 Q34,0 27,13" fill="none" stroke={PEN} strokeWidth={2.4} />
      </g>
    </svg>
  );
}

/** The drawn instruction of a guarda page: a scrap of squared paper with a border of battlements in blue pen. */
export function GuardaIcon({ size = 44 }: { size?: number }) {
  const sq = [-12, -4, 4, 12];
  return (
    <svg viewBox="-24 -20 48 40" width={size} height={size} aria-hidden="true" className="doodle">
      <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
        <path d={wobblyPoly([[-21, -16], [20, -17], [21, 16], [-20, 17]], { wob: 0.5, bow: 0.8, seed: 9 })} transform="translate(2 2.5)" fill="rgba(84, 62, 38, 0.2)" />
        <path d={wobblyPoly([[-21, -16], [20, -17], [21, 16], [-20, 17]], { wob: 0.5, bow: 0.8, seed: 9 })} fill="#fdfbf4" stroke={INK} strokeWidth={2.2} />
        {sq.map((v) => <path key={`v${v}`} d={`M${v},-14 L${v},14`} stroke="#9dbbd8" strokeWidth={1.3} />)}
        {sq.map((v) => <path key={`h${v}`} d={`M-18,${v} L18,${v}`} stroke="#9dbbd8" strokeWidth={1.3} />)}
        <path d="M-16,4 L-12,4 L-12,-4 L-4,-4 L-4,4 L4,4 L4,-4 L12,-4 L12,4 L16,4" fill="none" stroke={PEN} strokeWidth={3} />
      </g>
    </svg>
  );
}

/** Several seeds to gather, drawn as a little heap (the bar's instruction stays short with three or more). */
export function SeedsIcon({ n, size = 42 }: { n: number; size?: number }) {
  const k = Math.min(n, 4);
  return (
    <span className="seeds-icon" style={{ width: size + (k - 1) * size * 0.42 }} aria-hidden="true">
      {Array.from({ length: k }, (_, i) => (
        <span key={i} style={{ left: i * size * 0.42, top: i % 2 ? 5 : 0 }}><SeedIcon size={size * 0.86} /></span>
      ))}
    </span>
  );
}

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
