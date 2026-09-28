// Drawings of 1ro's year: the forest and the river of the map, the stops of
// the path (notebook pages in the forest, flat stones by the river), the
// doors of a sheet with their sprouts, the boss page, and the seed pouch.
// Same ink, weights and flat facets as the board (docs/05): one outline
// colour, a darker flat facet for volume, a flat offset shadow, no gradients.

import { memo, type ReactNode } from 'react';
import { blob, leaf, penLoop, rng, smoothOpen, wobblyLine, wobblyPoly } from '../ink/ink.js';

export const INK = '#2b2622';
export const PEN = '#3d6ea5';
const SHADOW = 'rgba(84, 62, 38, 0.2)';
const TAPE = 'rgba(222, 204, 158, 0.85)';
const PAPER = '#fbf7ee';

type Pt = [number, number];

/**
 * A shape with a flat facet (docs/05 §5): the shape clipped, filled with the
 * dark tone, the light tone drawn over it shifted up-left, the outline on top.
 */
function Faceted({ id, d, light, dark, shift = [-5, -4], sw = 2.8 }: { id: string; d: string; light: string; dark: string; shift?: Pt; sw?: number }) {
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

/** Three short strokes from one point, like the board's grass. */
export function Tuft({ x, y, seed = 1, s = 1 }: { x: number; y: number; seed?: number; s?: number }) {
  const R = rng(seed);
  const a = -0.5 - R() * 0.3, b = 0.4 + R() * 0.3;
  return (
    <path
      d={`M${x - 3 * s},${y} l${(a * 10 * s).toFixed(1)},${(-9 * s).toFixed(1)} M${x},${y} l${((R() - 0.5) * 3 * s).toFixed(1)},${(-12 * s).toFixed(1)} M${x + 3 * s},${y} l${(b * 10 * s).toFixed(1)},${(-8 * s).toFixed(1)}`}
      stroke={INK} strokeWidth={2} strokeLinecap="round" opacity={0.7} fill="none"
    />
  );
}

/** A leafy tree standing on (x, y): trunk, a round canopy with its facet and a few leaf marks. */
export const Tree = memo(function Tree({ x, y, s = 1, seed }: { x: number; y: number; s?: number; seed: number }) {
  const R = rng(seed);
  const h = 44 * s, cw = (40 + R() * 10) * s, ch = (36 + R() * 8) * s;
  const trunk = wobblyPoly([[-7 * s, 0], [7 * s, 0], [5 * s, -h], [-5 * s, -h]], { wob: 0.8, bow: 1, seed });
  const canopy = blob(0, -h - ch * 0.62, cw, ch, { wob: 0.1, n: 9, seed: seed + 1 });
  return (
    <g transform={`translate(${x} ${y})`} strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx={3 * s} cy={2} rx={30 * s} ry={6 * s} fill="url(#hatch)" />
      <Faceted id={`tr-${seed}`} d={trunk} light="#b08560" dark="#8d6844" shift={[-3, 0]} sw={2.6} />
      <Faceted id={`tc-${seed}`} d={canopy} light="#a4b86d" dark="#879b52" />
      {[0, 1, 2].map((i) => {
        const lx = (R() - 0.5) * cw * 1.1, ly = -h - ch * 0.62 + (R() - 0.5) * ch * 0.9;
        return <path key={i} d={`M${(lx - 5).toFixed(1)},${ly.toFixed(1)} q5,6 10,0`} fill="none" stroke={INK} strokeWidth={1.6} opacity={0.45} />;
      })}
    </g>
  );
});

/** A pine: three stacked tiers, darker on the right. */
export const Pine = memo(function Pine({ x, y, s = 1, seed }: { x: number; y: number; s?: number; seed: number }) {
  const tiers = [[0, 42, 30], [-26, 34, 28], [-50, 24, 26]] as const;
  return (
    <g transform={`translate(${x} ${y})`} strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx={2 * s} cy={2} rx={24 * s} ry={5 * s} fill="url(#hatch)" />
      <Faceted id={`pt-${seed}`} d={wobblyPoly([[-5 * s, 0], [5 * s, 0], [4 * s, -16 * s], [-4 * s, -16 * s]], { wob: 0.6, bow: 0.8, seed })} light="#b08560" dark="#8d6844" shift={[-2, 0]} sw={2.4} />
      {tiers.map(([dy, w, h], i) => {
        const base = -14 * s + dy * s;
        const d = wobblyPoly([[-w * s, base], [w * s, base], [0, base - h * 1.9 * s]], { wob: 1.2, bow: 2, seed: seed + i + 1 });
        return <Faceted key={i} id={`pp-${seed}-${i}`} d={d} light="#93aa6e" dark="#768d57" shift={[-7, -2]} sw={2.6} />;
      })}
    </g>
  );
});

/** A low bush of two blobs. */
export const Bush = memo(function Bush({ x, y, s = 1, seed }: { x: number; y: number; s?: number; seed: number }) {
  const d = blob(0, -16 * s, 34 * s, 18 * s, { wob: 0.12, n: 10, seed });
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx={0} cy={1} rx={34 * s} ry={5 * s} fill="url(#hatch)" />
      <Faceted id={`bu-${seed}`} d={d} light="#b4c47f" dark="#98ab66" shift={[-6, -3]} sw={2.6} />
      <path d={`M${-12 * s},${-18 * s} q5,5 10,0 M${6 * s},${-24 * s} q4,4 8,0`} fill="none" stroke={INK} strokeWidth={1.5} opacity={0.45} strokeLinecap="round" />
    </g>
  );
});

/** A red mushroom with cream dots. */
export function Mushroom({ x, y, s = 1, seed = 1 }: { x: number; y: number; s?: number; seed?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} stroke={INK} strokeLinejoin="round" strokeLinecap="round">
      <path d="M-5,0 L-4,-12 L4,-12 L5,0 Z" fill={PAPER} strokeWidth={2} />
      <path d={`M-15,-11 Q-14,-27 0,-28 Q14,-27 15,-11 Z`} fill="#c9574a" strokeWidth={2.4} />
      <circle cx={-6} cy={-19} r={2.6} fill={PAPER} stroke="none" />
      <circle cx={5} cy={-22} r={2} fill={PAPER} stroke="none" />
      <circle cx={8} cy={-15} r={1.6} fill={PAPER} stroke="none" opacity={seed % 2 ? 1 : 0} />
    </g>
  );
}

/** Reeds by the water: thin stems, two with brown tops. */
export function Reeds({ x, y, seed = 1 }: { x: number; y: number; seed?: number }) {
  const R = rng(seed);
  const stems = [-8, -2, 5, 11].map((dx, i) => ({ dx, h: 34 + R() * 22, lean: (R() - 0.5) * 8, top: i % 2 === 0 }));
  return (
    <g transform={`translate(${x} ${y})`} stroke={INK} strokeLinecap="round">
      {stems.map((st, i) => (
        <g key={i}>
          <path d={`M${st.dx},0 Q${st.dx + st.lean / 2},${-st.h / 2} ${st.dx + st.lean},${-st.h}`} fill="none" strokeWidth={2} opacity={0.8} />
          {st.top && <path d={blob(st.dx + st.lean, -st.h + 6, 3.4, 8, { seed: seed + i, n: 7 })} fill="#9c6b43" strokeWidth={1.8} />}
        </g>
      ))}
    </g>
  );
}

/** A lily pad with its notch. */
export function LilyPad({ x, y, r = 16, seed = 1 }: { x: number; y: number; r?: number; seed?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={`${blob(0, 0, r, r * 0.55, { seed, n: 9 })}`} fill="#a4b86d" stroke={INK} strokeWidth={2} />
      <path d={`M0,0 L${r * 0.9},${-r * 0.2}`} stroke="#9dbbd8" strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}

/** A wooden signpost; its board shows a little drawing (a tree for the forest, waves for the river). */
export function Signpost({ x, y, sign, seed = 1 }: { x: number; y: number; sign: 'tree' | 'waves'; seed?: number }) {
  const board = wobblyPoly([[-30, -76], [30, -78], [31, -46], [-29, -44]], { wob: 1, bow: 1.4, seed });
  return (
    <g transform={`translate(${x} ${y})`} stroke={INK} strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx={2} cy={2} rx={16} ry={4} fill="url(#hatch)" stroke="none" />
      <path d={wobblyPoly([[-4, 0], [4, 0], [4, -48], [-4, -48]], { wob: 0.6, bow: 0.6, seed: seed + 1 })} fill="#a57c55" strokeWidth={2.4} />
      <path d={board} transform="translate(3 4)" fill={SHADOW} stroke="none" />
      <path d={board} fill="#d9b98c" strokeWidth={2.6} />
      {sign === 'tree' ? (
        <g>
          <path d="M0,-50 L0,-56" strokeWidth={2.2} />
          <path d={blob(0, -64, 11, 9, { seed: seed + 2, n: 8 })} fill="#a4b86d" strokeWidth={2} />
        </g>
      ) : (
        [-54, -63].map((wy) => <path key={wy} d={`M-18,${wy} q4.5,-5 9,0 t9,0 t9,0 t9,0`} fill="none" stroke={PEN} strokeWidth={2.4} />)
      )}
    </g>
  );
}

// ------------------------------------------------------------------ the river

/** The river across the top of the map: water between two wavy banks, cream ripples, an ink edge on each bank. */
export function River({ w, top, bottom, seed = 1 }: { w: number; top: number; bottom: number; seed?: number }) {
  const R = rng(seed);
  const edge = (y: number, amp: number): Pt[] => Array.from({ length: 9 }, (_, i) => [(i / 8) * (w + 40) - 20, y + Math.sin(i * 1.3 + seed) * amp + (R() - 0.5) * amp]);
  const up = edge(top, 10), down = edge(bottom, 12);
  const water = `${smoothOpen(up)} L${w + 20},${down[8][1]} ${smoothOpen([...down].reverse()).replace(/^M/, 'L')} Z`;
  const ripples = Array.from({ length: 12 }, (_, i) => {
    const x = 60 + ((i * 137) % (w - 120)), y = top + 28 + ((i * 53) % Math.max(20, bottom - top - 50));
    return <path key={i} d={`M${x},${y} q10,-6 20,0 t20,0`} fill="none" stroke={PAPER} strokeWidth={2.6} strokeLinecap="round" opacity={0.9} />;
  });
  return (
    <g>
      <path d={water} fill="#9dbbd8" />
      {ripples}
      <path d={smoothOpen(up)} fill="none" stroke={INK} strokeWidth={2.6} opacity={0.75} strokeLinecap="round" />
      <path d={smoothOpen(down)} fill="none" stroke={INK} strokeWidth={2.6} opacity={0.75} strokeLinecap="round" />
    </g>
  );
}

// ------------------------------------------------------------------ the scenes of a sheet's pages

/** Two clouds and the sun in pencil over the doors, like the sky of a lone path on the board. */
export function PencilSky() {
  const clouds: [number, number, number][] = [[330, 118, 1], [640, 80, 4]];
  return (
    <g opacity={0.75} stroke={INK} strokeLinecap="round">
      {clouds.map(([x, y, sd]) => [blob(x, y, 40, 18, { seed: sd, n: 9 }), blob(x + 34, y - 11, 30, 18, { seed: sd + 3, n: 8 }), blob(x - 30, y - 4, 22, 13, { seed: sd + 6, n: 8 })]
        .map((d, i) => <path key={`${x}-${i}`} d={d} fill="#fbf7ee" strokeWidth={2} />))}
      <circle cx={1090} cy={92} r={26} fill="#f0d27a" strokeWidth={2.2} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <path key={i} d={`M${(1090 + Math.cos(a) * 35).toFixed(1)},${(92 + Math.sin(a) * 35).toFixed(1)} L${(1090 + Math.cos(a) * 47).toFixed(1)},${(92 + Math.sin(a) * 47).toFixed(1)}`} strokeWidth={2} />;
      })}
    </g>
  );
}

/**
 * A river sheet's scene (its doors page, the comodín's choices): the sandy
 * bank in front, the river running behind with its lily pads, the far bank
 * with reeds, flat stones and reeds on the near bank instead of the forest's
 * trees. Drawn in a 1200 × 600 page; things stand on the bank at `ground`.
 */
export function RiverScenery({ ground: GROUND = 468 }: { ground?: number }) {
  const stones: [number, number, number][] = [[92, GROUND + 38, 1.2], [590, GROUND + 60, 1], [1150, GROUND + 44, 1.1]];
  return (
    <g className="doors-scenery is-river">
      <clipPath id="doors-river-clip"><rect x={0} y={0} width={1200} height={600} /></clipPath>
      <PencilSky />
      <path d="M0,196 Q300,186 600,194 T1200,190 L1200,300 L0,300 Z" fill="#f3e8cf" />
      <path d={`M0,392 L1200,392 L1200,600 L0,600 Z`} fill="#f3e8cf" />
      {/* the river's banks run a little past the page: clipped to it */}
      <g clipPath="url(#doors-river-clip)"><River w={1200} top={262} bottom={404} seed={6} /></g>
      {[[150, 312, 17], [650, 352, 14], [1050, 300, 16]].map(([x, y, r], i) => <LilyPad key={i} x={x} y={y} r={r} seed={i + 3} />)}
      {[[40, 262], [470, 258], [860, 264], [1180, 258]].map(([x, y], i) => <Reeds key={`far${i}`} x={x} y={y} seed={i + 11} />)}
      {stones.map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`} stroke={INK} strokeLinejoin="round">
          <path d={blob(3, 5, 40, 17, { seed: i + 30, n: 10 })} fill="rgba(84, 62, 38, 0.2)" stroke="none" />
          <path d={blob(0, 0, 40, 17, { seed: i + 30, n: 10 })} fill="#ddd4c3" strokeWidth={2.6} />
          <path d={`M-18,-6 q10,-5 22,-3`} fill="none" stroke="#fbf7ee" strokeWidth={2.4} strokeLinecap="round" />
        </g>
      ))}
      {[[345, GROUND + 6], [598, GROUND + 4], [860, GROUND + 6], [22, GROUND + 70], [1100, GROUND + 100]].map(([x, y], i) => <Reeds key={`near${i}`} x={x} y={y} seed={i + 21} />)}
      {[[250, 540], [720, 548], [960, 530]].map(([x, y], i) => (
        <g key={`p${i}`} stroke={INK} strokeWidth={1.4} fill="#d8c9a6" opacity={0.8}>
          <ellipse cx={x} cy={y} rx={5} ry={3.5} />
          <ellipse cx={x + 12} cy={y + 5} rx={3.5} ry={2.5} />
        </g>
      ))}
    </g>
  );
}

// ------------------------------------------------------------------ the stops of the path

export type StopLook = 'page' | 'stone';

/** What a stop carries besides its number (the kind of class, drawn, no words). */
export type StopMark = 'none' | 'pencil' | 'note' | 'kite' | 'bunting';

/** A notebook page lying on the path (forest), or a flat stone (river), with the sheet's number. */
export function StopArt({ n, look, soon, mark, seed }: { n: number; look: StopLook; soon: boolean; mark: StopMark; seed: number }) {
  const R = rng(seed);
  const tilt = (R() - 0.5) * 8;
  const dash = soon ? '5 7' : undefined;
  const numberFill = soon ? 'rgba(43,38,34,0.45)' : INK;
  if (look === 'stone') {
    const d = blob(0, 4, 46, 31, { wob: 0.07, n: 10, seed });
    // the workshop's pencil lies on its stone; the kite and the bunting stand behind theirs
    const onTop = mark === 'pencil';
    return (
      <g>
        {mark !== 'none' && !onTop && <Mark mark={mark} look={look} />}
        <path d={d} transform="translate(4 6)" fill={SHADOW} />
        {soon ? <path d={d} fill="rgba(236,230,217,0.92)" stroke={INK} strokeOpacity={0.5} strokeWidth={2.6} strokeDasharray={dash} /> : <Faceted id={`st-${seed}`} d={d} light="#ddd4c3" dark="#b8ab95" shift={[-4, -5]} />}
        <text x={0} y={15} className="stop-no" fill={numberFill} textAnchor="middle">{n}</text>
        {onTop && <Mark mark={mark} look={look} />}
      </g>
    );
  }
  const page = wobblyPoly([[-32, -39], [20, -39], [32, -27], [32, 39], [-32, 39]], { wob: 0.8, bow: 1.2, seed });
  return (
    <g transform={`rotate(${tilt.toFixed(1)})`}>
      <path d={page} transform="translate(5 6)" fill={soon ? 'none' : SHADOW} />
      <path d={page} fill={soon ? 'rgba(251,247,238,0.9)' : PAPER} stroke={INK} strokeOpacity={soon ? 0.5 : 1} strokeWidth={2.6} strokeDasharray={dash} strokeLinejoin="round" />
      {!soon && <path d="M20,-39 L20,-27 L32,-27" fill="none" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />}
      {!soon && [-14, 0, 14, 28].map((y) => <path key={y} d={`M-24,${y} L24,${y}`} stroke={PEN} strokeOpacity={0.22} strokeWidth={1.6} />)}
      {!soon && <path d="M-14,-47 L14,-44 L13,-33 L-15,-36 Z" fill={TAPE} />}
      <text x={0} y={12} className="stop-no" fill={numberFill} textAnchor="middle">{n}</text>
      {mark !== 'none' && <Mark mark={mark} look={look} />}
    </g>
  );
}

/** The drawn sign of a stop's kind of class: a pencil (workshop), a note (music recess), a kite (free choice), bunting (the showcase). */
function Mark({ mark, look }: { mark: StopMark; look: StopLook }) {
  if (mark === 'pencil') {
    return (
      <g transform={look === 'page' ? 'translate(-22 30) rotate(-32)' : 'translate(-24 38) rotate(-10)'} stroke={INK} strokeLinejoin="round" strokeLinecap="round">
        <path d="M0,-5 L34,-5 L34,5 L0,5 Z" fill="#f0d27a" strokeWidth={2} />
        <path d="M34,-5 L44,-5 L44,5 L34,5 Z" fill="#e7a3a0" strokeWidth={2} />
        <path d="M0,-5 L-12,0 L0,5 Z" fill="#ecd3ad" strokeWidth={2} />
        <path d="M-12,0 L-7,-2 L-7,2 Z" fill={INK} strokeWidth={1.2} />
      </g>
    );
  }
  if (mark === 'note') {
    return (
      <g transform="translate(-19 -22)" stroke={INK} strokeLinecap="round" strokeLinejoin="round">
        <path d="M-4,8 L-4,-10 L8,-13 L8,5" fill="none" strokeWidth={2.2} />
        <path d="M-4,-10 L8,-13" strokeWidth={4} />
        <ellipse cx={-7} cy={8} rx={4} ry={3} fill={INK} transform="rotate(-20 -7 8)" />
        <ellipse cx={5} cy={5} rx={4} ry={3} fill={INK} transform="rotate(-20 5 5)" />
      </g>
    );
  }
  if (mark === 'kite') {
    return (
      <g transform="translate(58 -66)" stroke={INK} strokeLinejoin="round" strokeLinecap="round">
        <path d="M0,20 Q-14,50 -40,60" fill="none" strokeWidth={1.4} opacity={0.7} strokeDasharray="1 4" />
        <path d="M0,-18 L13,0 L0,22 L-13,0 Z" fill="#e7a3a0" strokeWidth={2.2} />
        <path d="M0,-18 L0,22 M-13,0 L13,0" strokeWidth={1.4} opacity={0.6} />
        <path d="M0,-18 L13,0 L0,0 Z" fill="#7298c1" strokeWidth={1.6} />
        <path d="M0,22 q-6,8 0,14 q6,6 0,12" fill="none" strokeWidth={1.6} />
      </g>
    );
  }
  // the showcase: bunting on a string between two sticks
  const flags = ['#de8a56', '#7298c1', '#f0d27a', '#e7a3a0', '#a4b86d'];
  return (
    <g stroke={INK} strokeLinejoin="round" strokeLinecap="round">
      <path d="M-56,20 L-56,-58 M56,20 L56,-58" strokeWidth={2.6} />
      <path d="M-56,-56 Q0,-34 56,-56" fill="none" strokeWidth={1.6} />
      {flags.map((f, i) => {
        const t = (i + 0.5) / flags.length, x = -56 + 112 * t, y = -56 + 22 * 4 * t * (1 - t) * 0.95;
        return <path key={i} d={`M${x - 8},${y} L${x + 8},${y + 1} L${x + 1},${y + 17} Z`} fill={f} strokeWidth={1.8} />;
      })}
    </g>
  );
}

/** The blue pen loop around the stop Brote waits on. */
export function StopRing({ seed = 1 }: { seed?: number }) {
  return <path d={penLoop(0, 2, 56, 58, { seed })} fill="none" stroke={PEN} strokeWidth={3.4} strokeLinecap="round" />;
}

// ------------------------------------------------------------------ the doors of a sheet

export type DoorSize = 'easy' | 'medium' | 'hard';

/**
 * What grows on a door: a tiny sprout (easy), a taller one with four leaves
 * (medium), a little tree in flower (hard). Drawn standing on (0, 0).
 */
export function Sprout({ size }: { size: DoorSize }) {
  const leaves: [number, number, number, number, number][] = size === 'easy'
    ? [[0, -10, -11, -16, 4.4], [0, -11, 10, -18, 4.4]]
    : size === 'medium'
      ? [[0, -9, -12, -13, 4.6], [0, -10, 12, -15, 4.6], [0, -20, -12, -27, 5], [0, -21, 12, -29, 5]]
      : [[0, -9, -13, -12, 4.8], [0, -10, 13, -14, 4.8], [0, -19, -15, -24, 5.2], [0, -20, 15, -26, 5.2], [0, -29, -12, -37, 5], [0, -30, 12, -38, 5]];
  const h = size === 'easy' ? 12 : size === 'medium' ? 22 : 33;
  return (
    <g stroke={INK} strokeLinecap="round" strokeLinejoin="round">
      <path d={`M0,2 C-2,${-h / 3} 2,${-h * 0.66} 0,${-h}`} fill="none" strokeWidth={2.4} />
      {leaves.map(([a, b, c, d2, w], i) => <path key={i} d={leaf(a, b, c, d2, w)} fill="#a4b86d" strokeWidth={2} />)}
      {size === 'hard' && (
        <g transform={`translate(0 ${-h - 4})`}>
          {[0, 1, 2, 3, 4].map((i) => {
            const an = (i / 5) * Math.PI * 2 - Math.PI / 2;
            return <circle key={i} cx={Math.cos(an) * 4.4} cy={Math.sin(an) * 4.4} r={3.4} fill="#e7a3a0" strokeWidth={1.5} />;
          })}
          <circle r={2.4} fill="#f0d27a" strokeWidth={1.3} />
        </g>
      )}
    </g>
  );
}

/**
 * A round-topped wooden door in its frame, a knob, and its sprout on the
 * lintel. `open` swings the leaf a little (hover, a door that leads
 * somewhere); `shut` draws a wooden bar across it (not open yet).
 */
export function DoorArt({ size, shut, seed = 1 }: { size: DoorSize; shut?: boolean; seed?: number }) {
  const frame = `M-34,40 L-34,-14 C-34,-52 34,-52 34,-14 L34,40 Z`;
  const hole = `M-25,40 L-25,-12 C-25,-40 25,-40 25,-12 L25,40 Z`;
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d={frame} transform="translate(4 5)" fill={SHADOW} />
      <Faceted id={`df-${size}-${seed}`} d={frame} light="#c7bda9" dark="#a99d86" shift={[-4, -3]} />
      <path d={hole} fill="#4a3b30" stroke={INK} strokeWidth={2.4} />
      <g className="door-leaf">
        <path d={hole} fill="#c9955f" stroke={INK} strokeWidth={2.6} />
        {[-12, 0, 12].map((x) => <path key={x} d={wobblyLine(x, x === 0 ? -34 : -30, x, 38, { bow: 0.6, seed: seed + x })} stroke={INK} strokeWidth={1.5} opacity={0.45} fill="none" />)}
        <path d="M-25,4 L25,4" stroke={INK} strokeWidth={1.5} opacity={0.35} />
        <circle cx={15} cy={10} r={4} fill="#f0d27a" stroke={INK} strokeWidth={2} />
      </g>
      {shut && <path d={wobblyPoly([[-31, 6], [31, 2], [31, 12], [-31, 16]], { wob: 0.6, bow: 0.8, seed: seed + 7 })} fill="#8d6844" stroke={INK} strokeWidth={2.4} />}
      <g transform="translate(0 -44)"><Sprout size={size} /></g>
    </g>
  );
}

/** The boss page: a page in a wreath of leaves with a flag on it (a summit to reach). */
export function BossPageArt({ seed = 3, children }: { seed?: number; children?: ReactNode }) {
  const d = wobblyPoly([[-34, -42], [22, -42], [34, -30], [34, 42], [-34, 42]], { wob: 0.8, bow: 1.2, seed });
  const sprigs: [number, number, number][] = [[-34, -42, -135], [34, -34, -45], [34, 42, 45], [-34, 42, 135]];
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d={d} transform="translate(5 6)" fill={SHADOW} />
      <path d={d} fill="#fff9ea" stroke={INK} strokeWidth={2.6} />
      <path d={wobblyPoly([[-27, -35], [20, -35], [27, -28], [27, 35], [-27, 35]], { wob: 0.6, bow: 0.8, seed: seed + 1 })} fill="none" stroke="#879b52" strokeWidth={1.8} strokeDasharray="1 5" />
      <path d="M22,-42 L22,-30 L34,-30" fill="none" stroke={INK} strokeWidth={2.2} />
      {sprigs.map(([x, y, a], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${a})`} stroke={INK}>
          <path d={leaf(0, 0, 18, -6, 5)} fill="#a4b86d" strokeWidth={1.8} />
          <path d={leaf(0, 0, 16, 8, 5)} fill="#a4b86d" strokeWidth={1.8} />
          <circle cx={4} cy={0} r={3.2} fill="#c9574a" strokeWidth={1.4} />
        </g>
      ))}
      {children ?? (
        <g stroke={INK}>
          <path d={wobblyPoly([[-20, 24], [-2, -6], [8, 8], [14, 0], [24, 24]], { wob: 0.6, bow: 0.6, seed: seed + 2 })} fill="#d6c9b0" strokeWidth={2.2} />
          <path d="M-2,-6 L-2,-26" strokeWidth={2.2} />
          <path d="M-2,-26 L12,-21 L-2,-16 Z" fill="#c9574a" strokeWidth={1.8} />
        </g>
      )}
    </g>
  );
}

// ------------------------------------------------------------------ the seed pouch

/** A cloth pouch tied with string, seeds peeking out: where the seeds of solved levels go. */
export const PouchArt = memo(function PouchArt() {
  const bag = 'M-10,-10 C-22,-4 -24,14 -16,22 C-8,28 8,28 16,22 C24,14 22,-4 10,-10 Z';
  return (
    <svg viewBox="-28 -34 56 64" aria-hidden="true" className="pouch-art">
      <g strokeLinejoin="round" strokeLinecap="round">
        <path d={bag} transform="translate(3 4)" fill={SHADOW} />
        <path d={blob(-5, -16, 5.5, 4.6, { seed: 5, n: 8 })} fill="#f0d27a" stroke={INK} strokeWidth={2} />
        <path d={blob(5, -18, 5.5, 4.6, { seed: 6, n: 8 })} fill="#f0d27a" stroke={INK} strokeWidth={2} />
        <path d={leaf(5, -22, 12, -30, 3)} fill="#a4b86d" stroke={INK} strokeWidth={1.6} />
        <Faceted id="pouch-bag" d={bag} light="#dcbf93" dark="#c09e70" shift={[-5, -3]} sw={2.6} />
        <path d="M-12,-9 Q0,-4 12,-9" fill="none" stroke="#9c6b43" strokeWidth={3} />
        <path d="M2,-7 q7,2 9,9 M2,-7 q-3,7 1,12" fill="none" stroke="#9c6b43" strokeWidth={2} />
        <path d="M-8,8 q4,3 8,0" fill="none" stroke={INK} strokeWidth={1.4} opacity={0.4} />
      </g>
    </svg>
  );
});
