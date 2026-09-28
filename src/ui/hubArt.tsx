// Drawings of the comodín (sheet 16): its three choices standing on the
// riverbank (a wooden footbridge over a stream for "recuperar", the
// xylophone for the free song, the class corkboard on an easel), the bridge
// of the catch-up page, and their small pictures for the bar. Same ink,
// weights and flat facets as the rest (docs/style-guide.md).

import { memo } from 'react';
import { blob, wobblyLine, wobblyPoly } from '../ink/ink.js';
import { PITCHES } from '../game/music';
import { BAR_DARK, BAR_FILL, BAR_LEN, barPath } from './noteArt';

const INK = '#2b2622';
const PEN = '#3d6ea5';
const SHADOW = 'rgba(84, 62, 38, 0.2)';
const PAPER = '#fbf7ee';
const WOOD = '#c9955f';
const WOOD_DARK = '#a57c55';
const WATER = '#9dbbd8';

/** A shape with its darker flat facet, outlined. */
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

/** A page with a folded corner and a red ribbon bookmark (an essential page), small, standing at (0, 0). */
export function PendingPage({ seed = 1, s = 1 }: { seed?: number; s?: number }) {
  const d = wobblyPoly([[-13, -36], [7, -36], [13, -30], [13, 0], [-13, 0]], { wob: 0.5, bow: 0.6, seed });
  return (
    <g transform={`scale(${s})`} strokeLinejoin="round" strokeLinecap="round">
      <path d={d} transform="translate(2 3)" fill={SHADOW} />
      <path d={d} fill={PAPER} stroke={INK} strokeWidth={2} />
      <path d="M7,-36 L7,-30 L13,-30" fill="none" stroke={INK} strokeWidth={1.6} />
      {[-24, -17, -10].map((y) => <path key={y} d={`M-8,${y} L8,${y}`} stroke={PEN} strokeOpacity={0.35} strokeWidth={1.4} />)}
      <path d="M-9,-37 L-3,-37 L-3,-26 L-6,-29 L-9,-26 Z" fill="#c9574a" stroke={INK} strokeWidth={1.2} />
    </g>
  );
}

/**
 * The wooden footbridge of "recuperar": an arched deck of planks over a
 * stream, a railing on posts. The essential pages still pending stand on it
 * (up to four; none: one review page with a gold star).
 */
export const BridgeChoice = memo(function BridgeChoice({ pending }: { pending: number }) {
  const deckTop = 'M-150,-8 Q0,-84 150,-8';
  const deck = `${deckTop} L150,8 Q0,-66 -150,8 Z`;
  const rail = 'M-140,-52 Q0,-128 140,-52';
  const posts = [-120, -60, 0, 60, 120].map((x) => {
    const t = (x + 150) / 300, yDeck = (1 - t) * (1 - t) * -8 + 2 * t * (1 - t) * -84 + t * t * -8;
    return { x, y: yDeck + 2 };
  });
  const shown = Math.min(pending, 4);
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {/* the stream under it */}
      <path d={blob(0, 26, 176, 26, { seed: 3, n: 12, wob: 0.05 })} fill={WATER} stroke={INK} strokeWidth={2.4} />
      {[[-110, 24], [-20, 34], [70, 22], [124, 34]].map(([x, y], i) => <path key={i} d={`M${x},${y} q8,-5 16,0 t16,0`} fill="none" stroke={PAPER} strokeWidth={2.4} opacity={0.9} />)}
      {/* the posts and the railing, behind the pages */}
      {posts.map((p, i) => <path key={i} d={`M${p.x},${p.y} L${p.x},${p.y - 48}`} stroke={INK} strokeWidth={7} />)}
      {posts.map((p, i) => <path key={`w${i}`} d={`M${p.x},${p.y} L${p.x},${p.y - 48}`} stroke={WOOD} strokeWidth={3.4} />)}
      <path d={rail} fill="none" stroke={INK} strokeWidth={9} />
      <path d={rail} fill="none" stroke={WOOD} strokeWidth={5} />
      {/* the deck, its planks */}
      <path d={deck} transform="translate(3 5)" fill={SHADOW} />
      <Facet id="bridge-deck" d={deck} light={WOOD} dark={WOOD_DARK} shift={[0, -5]} sw={2.6} />
      {Array.from({ length: 11 }, (_, i) => {
        const x = -125 + i * 25, t = (x + 150) / 300, y = (1 - t) * (1 - t) * -8 + 2 * t * (1 - t) * -84 + t * t * -8;
        return <path key={i} d={wobblyLine(x, y + 1, x + 1, y + 15, { bow: 0.4, seed: i + 7 })} stroke={INK} strokeWidth={1.4} opacity={0.5} fill="none" />;
      })}
      {/* what waits on it */}
      {shown > 0
        ? Array.from({ length: shown }, (_, i) => {
          const x = (i - (shown - 1) / 2) * 44, t = (x + 150) / 300, y = (1 - t) * (1 - t) * -8 + 2 * t * (1 - t) * -84 + t * t * -8;
          return <g key={i} transform={`translate(${x} ${y + 2}) rotate(${(i % 2 ? 4 : -5)})`}><PendingPage seed={i + 2} s={1.25} /></g>;
        })
        : (
          <g transform="translate(0 -44)">
            <PendingPage seed={9} s={1.35} />
            <g transform="translate(14 -48)"><GoldStar /></g>
          </g>
        )}
    </g>
  );
});

/** A small gold star (a review page, a surprise). */
function GoldStar() {
  const pts: [number, number][] = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 5.6 : 12;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  return <path d={wobblyPoly(pts, { wob: 0.4, bow: 0.3, seed: 5 })} fill="#f0d27a" stroke={INK} strokeWidth={2} />;
}

/** The free song: the xylophone on the sand, notes floating up from it. */
export const XyloChoice = memo(function XyloChoice() {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx={4} cy={6} rx={150} ry={12} fill="url(#hatch)" />
      {[-1, 1].map((k) => (
        <path key={k} d={wobblyPoly([[-150, -34 + k * 24 - 6], [150, -34 + k * 14 - 6], [150, -34 + k * 14 + 6], [-150, -34 + k * 24 + 6]], { wob: 0.6, bow: 0.8, seed: k + 4 })} fill="#b08560" stroke={INK} strokeWidth={2.4} />
      ))}
      {PITCHES.map((p, i) => {
        const x = -108 + i * 54, h = BAR_LEN[p] * 0.72;
        const d = barPath(x, -34, 42, h, 6, i + 3);
        return (
          <g key={p}>
            <path d={d} transform="translate(3 4)" fill={SHADOW} />
            <Facet id={`hub-bar-${p}`} d={d} light={BAR_FILL[p]} dark={BAR_DARK[p]} shift={[-4, -3]} sw={2.4} />
            <circle cx={x} cy={-34 - h * 0.32} r={3} fill={INK} />
            <circle cx={x} cy={-34 + h * 0.32} r={3} fill={INK} />
          </g>
        );
      })}
      {/* the mallet, lying on the sand in front of it */}
      <path d="M66,22 L142,4" stroke={INK} strokeWidth={4.6} />
      <path d="M66,22 L142,4" stroke="#d9b98c" strokeWidth={2} />
      <circle cx={62} cy={23} r={9} fill="#c9574a" stroke={INK} strokeWidth={2.2} />
      {/* notes floating up */}
      {[[-96, -140, 1, -8], [-40, -176, 0.85, 6], [120, -150, 0.95, -4]].map(([x, y, s, r], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s}) rotate(${r})`} stroke={INK} fill={INK}>
          <path d={i === 1 ? 'M-4,8 L-4,-14 L12,-18 L12,4' : 'M4,8 L4,-16'} fill="none" strokeWidth={2.8} />
          {i === 1 ? <path d="M-4,-14 L12,-18" strokeWidth={5} /> : <path d="M4,-16 q10,4 8,14" fill="none" strokeWidth={2.6} />}
          <ellipse cx={-1} cy={8} rx={6} ry={4.5} transform="rotate(-20 -1 8)" />
          {i === 1 && <ellipse cx={8} cy={4} rx={6} ry={4.5} transform="rotate(-20 8 4)" />}
        </g>
      ))}
    </g>
  );
});

/** The class corkboard on an easel, three cards pinned on it. */
export const CorkChoice = memo(function CorkChoice() {
  const frame = wobblyPoly([[-104, -218], [104, -222], [106, -70], [-102, -66]], { wob: 1, bow: 1.4, seed: 12 });
  const cork = wobblyPoly([[-88, -204], [88, -207], [90, -84], [-86, -81]], { wob: 0.8, bow: 1, seed: 13 });
  const card = (x: number, y: number, r: number, pin: string, i: number) => (
    <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
      <path d={wobblyPoly([[-26, -20], [26, -21], [27, 22], [-25, 23]], { wob: 0.6, bow: 0.8, seed: i + 20 })} transform="translate(2 3)" fill={SHADOW} />
      <path d={wobblyPoly([[-26, -20], [26, -21], [27, 22], [-25, 23]], { wob: 0.6, bow: 0.8, seed: i + 20 })} fill={PAPER} stroke={INK} strokeWidth={2} />
      <path d="M-18,-10 L18,-10 L18,14 L-18,14 Z" fill="#f6efdf" stroke={INK} strokeWidth={1.2} />
      {[-6, 6].map((gx) => <path key={gx} d={`M${gx},-10 L${gx},14`} stroke={INK} strokeWidth={1} opacity={0.35} />)}
      <path d="M-18,2 L18,2" stroke={INK} strokeWidth={1} opacity={0.35} />
      <circle cx={-12} cy={8} r={3.2} fill="#de8a56" stroke={INK} strokeWidth={1.2} />
      <circle cx={12} cy={-4} r={3.2} fill="#f0d27a" stroke={INK} strokeWidth={1.2} />
      <circle cx={0} cy={-20} r={5} fill={pin} stroke={INK} strokeWidth={1.8} />
    </g>
  );
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx={4} cy={4} rx={96} ry={10} fill="url(#hatch)" />
      {/* the easel: two legs in front, one behind */}
      <path d="M0,-230 L60,2" stroke={INK} strokeWidth={9} />
      <path d="M0,-230 L60,2" stroke={WOOD_DARK} strokeWidth={5} />
      <path d="M-64,2 L-20,-236 M64,2 L20,-236" stroke={INK} strokeWidth={10} />
      <path d="M-64,2 L-20,-236 M64,2 L20,-236" stroke={WOOD} strokeWidth={6} />
      <path d={frame} transform="translate(4 6)" fill={SHADOW} />
      <Facet id="easel-frame" d={frame} light={WOOD} dark={WOOD_DARK} shift={[-5, -5]} sw={2.6} />
      <path d={cork} fill="#dcbd8e" stroke={INK} strokeWidth={2} />
      {[[-70, -186], [-30, -110], [40, -96], [72, -170], [6, -196], [-60, -98]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.6} fill="#b58c58" />)}
      {card(-46, -150, -5, '#c9574a', 1)}
      {card(18, -164, 4, '#7298c1', 2)}
      {card(56, -112, -3, '#a4b86d', 3)}
      <path d="M-74,-64 L74,-62" stroke={INK} strokeWidth={8} />
      <path d="M-74,-64 L74,-62" stroke={WOOD} strokeWidth={4} />
    </g>
  );
});

// ------------------------------------------------------------------ the bar's small pictures

/** The comodín's kite (its mark on the map). */
export function KiteIcon({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="-22 -24 44 48" width={size} height={size * 48 / 44} aria-hidden="true" className="doodle">
      <g filter="url(#rough)" stroke={INK} strokeLinejoin="round" strokeLinecap="round">
        <path d="M0,-20 L14,-2 L0,20 L-14,-2 Z" transform="translate(2 3)" fill={SHADOW} stroke="none" />
        <path d="M0,-20 L14,-2 L0,20 L-14,-2 Z" fill="#e7a3a0" strokeWidth={2.2} />
        <path d="M0,-20 L14,-2 L0,-2 Z" fill="#7298c1" strokeWidth={1.6} />
        <path d="M0,-20 L0,20 M-14,-2 L14,-2" strokeWidth={1.3} opacity={0.6} />
        <path d="M0,20 q-6,5 -2,10 q5,4 -1,8" fill="none" strokeWidth={1.6} />
      </g>
    </svg>
  );
}

/** "Recuperar", small: the arched footbridge with a page on it. */
export function BridgeIcon({ size = 44 }: { size?: number }) {
  return (
    <svg viewBox="-26 -22 52 40" width={size} height={size * 40 / 52} aria-hidden="true" className="doodle">
      <g filter="url(#rough)" stroke={INK} strokeLinejoin="round" strokeLinecap="round">
        <path d="M-24,12 Q0,4 24,12 L24,17 L-24,17 Z" fill={WATER} strokeWidth={1.6} />
        <path d="M-22,-10 Q0,-26 22,-10" fill="none" strokeWidth={4.4} />
        <path d="M-22,-10 Q0,-26 22,-10" fill="none" stroke={WOOD} strokeWidth={2} />
        {[-16, 0, 16].map((x) => <path key={x} d={`M${x},${x ? 0 : -6} L${x},${x ? -12 : -18}`} strokeWidth={2.4} />)}
        <path d="M-24,4 Q0,-12 24,4 L24,9 Q0,-7 -24,9 Z" fill={WOOD} strokeWidth={2} />
        <g transform="translate(0 -6) scale(0.5)"><path d="M-13,-36 L7,-36 L13,-30 L13,0 L-13,0 Z" fill={PAPER} strokeWidth={3} /><path d="M-9,-37 L-3,-37 L-3,-26 L-6,-29 L-9,-26 Z" fill="#c9574a" strokeWidth={2} /></g>
      </g>
    </svg>
  );
}

/** The free song, small: three xylophone bars and a note. */
export function XyloIcon({ size = 44 }: { size?: number }) {
  return (
    <svg viewBox="-26 -22 52 44" width={size} height={size * 44 / 52} aria-hidden="true" className="doodle">
      <g filter="url(#rough)" stroke={INK} strokeLinejoin="round" strokeLinecap="round">
        <path d="M-24,4 L22,-1 L22,3 L-24,8 Z" fill="#b08560" strokeWidth={1.6} />
        {(['do', 'mi', 'sol'] as const).map((p, i) => <path key={p} d={barPath(-14 + i * 13, 4, 10, [26, 21, 16][i], 2, i + 2)} fill={BAR_FILL[p]} strokeWidth={1.8} />)}
        <path d="M16,-8 L16,-20 q6,2 5,8" fill="none" strokeWidth={2} />
        <ellipse cx={13.5} cy={-8} rx={3.4} ry={2.6} fill={INK} transform="rotate(-20 13.5 -8)" />
      </g>
    </svg>
  );
}
