// Drawings of the workshops (sheets 7 and 15) and the class corkboard: the
// editor's tools (a rock, the eraser), the notebook's lines setting (a pencil
// that adds a line, the eraser that rubs one out), the corkboard's pieces
// (push-pins, the pencil tally of plays, a classmate's badge, the star
// sticker of one's own level, the badge of a limited level) and the small
// pictures of the bar. Same ink, weights and flat facets as the board
// (docs/style-guide.md): one outline colour, a darker flat facet for volume,
// a flat offset shadow, no gradients.

import { memo, useEffect, useRef } from 'react';
import { blob, wobblyLine, wobblyPoly } from '../ink/ink.js';
import { CHARACTERS } from '../ink/characters.js';
import { drawPortrait } from './board/BoardView';
import { TapeGlyph } from '../blocks/blocks';

const INK = '#2b2622';
const PEN = '#3d6ea5';
const PENCIL = '#47444c';
const SHADOW = 'rgba(84, 62, 38, 0.2)';
const PAPER = '#fbf7ee';

/** A shape with its darker flat facet (the light tone shifted up-left over the dark one), outlined. */
function Facet({ id, d, light, dark, shift = [-4, -4], sw = 2.6 }: { id: string; d: string; light: string; dark: string; shift?: [number, number]; sw?: number }) {
  return (
    <g>
      <clipPath id={id}><path d={d} /></clipPath>
      <g clipPath={`url(#${id})`}>
        <path d={d} fill={dark} />
        <path d={d} fill={light} transform={`translate(${shift[0]} ${shift[1]})`} />
      </g>
      <path d={d} fill="none" stroke={INK} strokeWidth={sw} strokeLinejoin="round" />
    </g>
  );
}

// ------------------------------------------------------------------ the editor's tools

/** A rock, as on the board: the tool that puts rocks in the way. */
export const RockIcon = memo(function RockIcon({ size = 56 }: { size?: number }) {
  const d = blob(0, 6, 25, 17, { wob: 0.09, n: 8, seed: 11, rot: 0.4 });
  return (
    <svg viewBox="-32 -22 64 50" width={size} height={size * 50 / 64} aria-hidden="true" className="doodle">
      <g filter="url(#rough)" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} transform="translate(3 4)" fill={SHADOW} />
        <Facet id="tool-rock" d={d} light="#bdb09c" dark="#9f937f" shift={[-4, -4]} sw={2.8} />
        <path d="M-6,-2 l4,6 l-3,5" fill="none" stroke={INK} strokeWidth={1.8} />
        <path d={blob(24, 17, 5, 3.6, { seed: 13, n: 7 })} fill="#bdb09c" stroke={INK} strokeWidth={2} />
      </g>
    </svg>
  );
});

/** The two-tone school eraser, tilted, with crumbs: it takes rocks away (and lines, in the lines setting). */
export const EraserIcon = memo(function EraserIcon({ size = 56 }: { size?: number }) {
  const body = wobblyPoly([[-24, -9], [20, -9], [24, 9], [-20, 9]], { wob: 0.6, bow: 0.8, seed: 21 });
  return (
    <svg viewBox="-30 -24 60 48" width={size} height={size * 48 / 60} aria-hidden="true" className="doodle">
      <g filter="url(#rough)" strokeLinecap="round" strokeLinejoin="round">
        <g transform="rotate(-24)">
          <path d={body} transform="translate(3 4)" fill={SHADOW} />
          <clipPath id="tool-eraser"><path d={body} /></clipPath>
          <g clipPath="url(#tool-eraser)">
            <rect x={-30} y={-14} width={34} height={30} fill="#e7a3a0" />
            <rect x={-30} y={4} width={34} height={10} fill="#d4847f" />
            <rect x={4} y={-14} width={26} height={30} fill="#a9c3de" />
            <rect x={4} y={4} width={26} height={10} fill="#8aa9c8" />
          </g>
          <path d={body} fill="none" stroke={INK} strokeWidth={2.6} />
          <path d="M4,-9 L7,9" stroke={INK} strokeWidth={2} />
        </g>
        {[[-16, 17, 3], [-7, 20, 2.2], [3, 18, 2.6]].map(([x, y, r], i) => <path key={i} d={blob(x, y, r, r * 0.8, { seed: 30 + i, n: 6 })} fill="#e7a3a0" stroke={INK} strokeWidth={1.4} />)}
      </g>
    </svg>
  );
});

/** A yellow school pencil (the lines setting's "one more line", the workshop's mark). */
function Pencil({ x, y, rot, s = 1 }: { x: number; y: number; rot: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} stroke={INK} strokeLinejoin="round" strokeLinecap="round">
      <path d="M0,-5 L30,-5 L30,5 L0,5 Z" transform="translate(2 3)" fill={SHADOW} stroke="none" />
      <path d="M0,-5 L30,-5 L30,5 L0,5 Z" fill="#f0d27a" strokeWidth={2} />
      <path d="M1,1.5 L29,1.5" stroke="#d3b25a" strokeWidth={2.4} />
      <path d="M30,-5 L38,-5 L38,5 L30,5 Z" fill="#e7a3a0" strokeWidth={2} />
      <path d="M0,-5 L-11,0 L0,5 Z" fill="#ecd3ad" strokeWidth={2} />
      <path d="M-11,0 L-6,-2.2 L-6,2.2 Z" fill={INK} strokeWidth={1.2} />
    </g>
  );
}

/** One more line: a pencil drawing a new dashed line under the others. */
export const MoreLineIcon = memo(function MoreLineIcon() {
  return (
    <svg viewBox="-30 -24 60 48" width={52} height={42} aria-hidden="true" className="doodle">
      <g filter="url(#rough)" strokeLinecap="round">
        <rect x={-24} y={-17} width={34} height={13} rx={4} fill="none" stroke="rgba(43,38,34,0.35)" strokeWidth={2} strokeDasharray="4 4" />
        <path d="M-24,9 L6,9" stroke={PEN} strokeWidth={3} strokeDasharray="4 5" />
        <Pencil x={10} y={8} rot={-38} s={0.8} />
        <path d="M-27,-24 L-27,-14 M-32,-19 L-22,-19" stroke={PEN} strokeWidth={3} />
      </g>
    </svg>
  );
});

/** One line less: the eraser rubbing out the last dashed line. */
export const LessLineIcon = memo(function LessLineIcon() {
  return (
    <svg viewBox="-30 -24 60 48" width={52} height={42} aria-hidden="true" className="doodle">
      <g filter="url(#rough)" strokeLinecap="round">
        <rect x={-24} y={-17} width={34} height={13} rx={4} fill="none" stroke="rgba(43,38,34,0.35)" strokeWidth={2} strokeDasharray="4 4" />
        <path d="M-24,9 L-12,9" stroke="rgba(43,38,34,0.35)" strokeWidth={2.4} strokeDasharray="4 5" />
        <path d="M-9,4 q4,4 8,0 q4,-4 8,0" fill="none" stroke={PENCIL} strokeWidth={1.4} opacity={0.5} />
        <g transform="translate(9 3) scale(0.62)"><EraserShape /></g>
        <path d="M-32,-19 L-22,-19" stroke={PEN} strokeWidth={3} />
      </g>
    </svg>
  );
});

/** The eraser alone, for the lines setting. */
function EraserShape() {
  const body = wobblyPoly([[-24, -9], [20, -9], [24, 9], [-20, 9]], { wob: 0.6, bow: 0.8, seed: 23 });
  return (
    <g transform="rotate(-24)" strokeLinejoin="round">
      <path d={body} fill="#e7a3a0" stroke={INK} strokeWidth={3} />
      <path d="M4,-9 L7,9 L24,9 L20,-9 Z" fill="#a9c3de" stroke={INK} strokeWidth={2.6} />
    </g>
  );
}

// ------------------------------------------------------------------ the bar's small pictures

/** The workshop, drawn: a little board being drawn with a pencil. */
export function MakeIcon({ size = 46 }: { size?: number }) {
  return (
    <svg viewBox="-26 -22 52 44" width={size} height={size * 44 / 52} aria-hidden="true" className="doodle">
      <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
        <path d={wobblyPoly([[-22, -15], [14, -16], [15, 12], [-21, 13]], { wob: 0.5, bow: 0.8, seed: 5 })} transform="translate(2 3)" fill={SHADOW} />
        <path d={wobblyPoly([[-22, -15], [14, -16], [15, 12], [-21, 13]], { wob: 0.5, bow: 0.8, seed: 5 })} fill="#f6efdf" stroke={INK} strokeWidth={2.2} />
        {[-10, 2].map((x) => <path key={x} d={`M${x},-14 L${x},11`} stroke={INK} strokeWidth={1.2} opacity={0.4} />)}
        <path d="M-20,-1 L13,-1" stroke={INK} strokeWidth={1.2} opacity={0.4} />
        <path d={blob(-16, 6, 4.5, 3.4, { seed: 3, n: 8 })} fill="#bdb09c" stroke={INK} strokeWidth={1.6} />
        <path d="M-5,-10 L-1,-4 L-8,-4 Z" fill="#de8a56" stroke={INK} strokeWidth={1.4} />
        <Pencil x={10} y={6} rot={-40} s={0.62} />
      </g>
    </svg>
  );
}

/** A push-pin seen from the front: a round head with its facet and a glint. */
export function PushPin({ color = '#c9574a', dark = '#a8463b', size = 26, seed = 1 }: { color?: string; dark?: string; size?: number; seed?: number }) {
  const d = blob(0, 0, 9, 8.6, { wob: 0.03, n: 9, seed });
  return (
    <svg viewBox="-13 -13 28 28" width={size} height={size} aria-hidden="true" className="push-pin">
      <path d={d} transform="translate(2.5 3.5)" fill={SHADOW} />
      <Facet id={`pin-${seed}`} d={d} light={color} dark={dark} shift={[-2.5, -2.5]} sw={2.2} />
      <path d="M-5,-3 q2,-3 5,-3.5" fill="none" stroke={PAPER} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

/** The pins' colours: their head and its facet. */
export const PIN_COLORS: readonly [string, string][] = [['#c9574a', '#a8463b'], ['#7298c1', '#5a7fa6'], ['#f0d27a', '#d3b25a'], ['#a4b86d', '#879b52'], ['#de8a56', '#bf6f3f']];

/** The corkboard, small: a cork square in its wooden frame with a pinned card. */
export function CorkIcon({ size = 44 }: { size?: number }) {
  return (
    <svg viewBox="-24 -22 48 44" width={size} height={size * 44 / 48} aria-hidden="true" className="doodle">
      <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
        <path d="M-21,-17 L20,-18 L21,16 L-20,17 Z" transform="translate(2 3)" fill={SHADOW} />
        <path d="M-21,-17 L20,-18 L21,16 L-20,17 Z" fill="#b98a5c" stroke={INK} strokeWidth={2.2} />
        <path d="M-16,-12 L15,-13 L16,11 L-15,12 Z" fill="#dcbd8e" stroke={INK} strokeWidth={1.6} />
        {[[-10, 6], [9, -8], [11, 7], [-12, -7]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.1} fill="#b0895a" stroke="none" />)}
        <path d={wobblyPoly([[-8, -8], [8, -9], [9, 8], [-7, 9]], { wob: 0.4, bow: 0.6, seed: 6 })} fill={PAPER} stroke={INK} strokeWidth={1.8} transform="rotate(-6)" />
        <path d="M-5,2 L-1,-3 L3,1 L6,-4" fill="none" stroke={PEN} strokeWidth={1.6} />
        <circle cx={0} cy={-9} r={3.4} fill="#c9574a" stroke={INK} strokeWidth={1.6} />
      </g>
    </svg>
  );
}

/** "Pin it": a paper card with a board on it and a red push-pin going in (the test page's next button). */
export function PinCardArt() {
  const card = wobblyPoly([[10, 14], [58, 12], [60, 70], [8, 72]], { wob: 0.8, bow: 1.1, seed: 8 });
  return (
    <svg viewBox="0 0 70 80" aria-hidden="true" className="next-art pin-card-art">
      <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
        <path d={card} transform="translate(3 4)" fill={SHADOW} />
        <path d={card} fill={PAPER} stroke={INK} strokeWidth={2.6} />
        <path d="M17,26 L51,25 L52,56 L16,57 Z" fill="#f6efdf" stroke={INK} strokeWidth={1.8} />
        {[28, 40].map((x) => <path key={x} d={`M${x},26 L${x},56`} stroke={INK} strokeWidth={1.2} opacity={0.4} />)}
        <path d="M17,41 L51,40" stroke={INK} strokeWidth={1.2} opacity={0.4} />
        <path d={blob(22, 50, 4, 3.2, { seed: 3, n: 8 })} fill="#de8a56" stroke={INK} strokeWidth={1.6} />
        <path d="M46,33 q2,-5 5,-2" fill="none" stroke={INK} strokeWidth={1.4} />
        <path d={blob(46, 34, 3.6, 3, { seed: 4, n: 8 })} fill="#f0d27a" stroke={INK} strokeWidth={1.6} />
        <path d="M34,4 L35,16" stroke={PEN} strokeWidth={2.6} strokeDasharray="1 5" />
        <path d="M29,10 L35,17 L41,10" fill="none" stroke={PEN} strokeWidth={2.6} />
        <circle cx={35} cy={20} r={8} fill="#c9574a" stroke={INK} strokeWidth={2.4} />
        <path d="M31,17 q2,-3 5,-3" fill="none" stroke={PAPER} strokeWidth={2} />
      </g>
    </svg>
  );
}

// ------------------------------------------------------------------ the corkboard's cards

/**
 * How many times a level was played on this device, in pencil tally marks
 * (four strokes and a fifth across), after the ▶ of Probar. First graders
 * count tally marks; the digit is there for the adult.
 */
export const Tally = memo(function Tally({ n }: { n: number }) {
  const shown = Math.min(n, 15);
  const groups = Math.ceil(shown / 5);
  const w = 14 + groups * 30;
  return (
    <svg viewBox={`0 0 ${w} 26`} width={w} height={26} aria-hidden="true" className="tally">
      <path d="M2,7 L11,13 L2,19 Z" fill="#fbf6ea" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
      <g stroke={PENCIL} strokeWidth={2.2} strokeLinecap="round" fill="none">
        {Array.from({ length: shown }, (_, i) => {
          const g = Math.floor(i / 5), k = i % 5, x0 = 18 + g * 30;
          return k < 4
            ? <path key={i} d={wobblyLine(x0 + k * 5.5, 4, x0 + k * 5.5 + 0.6, 22, { bow: 0.8, seed: i + 3 })} />
            : <path key={i} d={wobblyLine(x0 - 3, 18, x0 + 20, 7, { bow: 0.8, seed: i + 3 })} />;
        })}
      </g>
    </svg>
  );
});

/** A star sticker: this level was made here. */
export function StarSticker() {
  const pts: [number, number][] = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 6.4 : 14;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  const d = wobblyPoly(pts, { wob: 0.5, bow: 0.4, seed: 9 });
  return (
    <svg viewBox="-17 -17 36 36" width={34} height={34} aria-hidden="true" className="star-sticker">
      <path d={d} transform="translate(2 3)" fill={SHADOW} />
      <Facet id="star-sticker" d={d} light="#f0d27a" dark="#d3b25a" shift={[-2, -2]} sw={2.2} />
    </svg>
  );
}

/** A character's face in a round window (a classmate's badge, the child's own). */
export function AvatarFace({ character, className }: { character: string; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const def = CHARACTERS.find((c) => c.id === character) ?? CHARACTERS[0];
  useEffect(() => { if (ref.current) drawPortrait(def, ref.current, { x: 0.1, y: 0.2 }); }, [def]);
  return <svg ref={ref} className={className} viewBox="-46 -86 92 92" aria-hidden="true" />;
}

/** A limited level (sheet 15): the repeat's tape and as many dashed lines as its notebook has. */
export function LimitBadge({ lines }: { lines: number }) {
  const shown = Math.min(lines, 4);
  return (
    <span className="limit-badge" aria-hidden="true">
      <TapeGlyph size={30} />
      <svg viewBox={`0 0 18 ${shown * 8 + 2}`} width={18} height={shown * 8 + 2}>
        {Array.from({ length: shown }, (_, i) => <rect key={i} x={1} y={1 + i * 8} width={16} height={6} rx={2} fill="rgba(251,247,238,0.8)" stroke="rgba(43,38,34,0.55)" strokeWidth={1.2} strokeDasharray="2.5 2" />)}
      </svg>
    </span>
  );
}
