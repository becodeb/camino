// Drawings of the child's garden (Mi jardín): the page (the river across the
// top, its sandy bank, the meadow, a pond), the beds of ten and what grows in
// them (a sprout, a leafy plant with its bud, a flower in one of the
// palette's colours), a rare gold flower in its pot, a finished sheet's tree
// or flowering bush with its wooden stake, and the bosses' special plants (a
// sunflower, a ring of mushrooms, a dandelion, a fern, reeds with a
// dragonfly, a water lily, a ceibo in flower). Same ink, weights and flat
// facets as the rest (docs/style-guide.md); the page never uses a filter on
// its many plants, their wobble is in the drawing.

import { memo, type ReactNode } from 'react';
import { blob, leaf, rng, smoothOpen, wobblyLine, wobblyPoly } from '../ink/ink.js';
import type { RareId } from '../curriculum/motivation';
import type { BigKind, Stage } from '../curriculum/garden';
import { Bush, LilyPad, Mushroom, Pine, Reeds, River, Tree, Tuft } from './forestArt';

const INK = '#2b2622';
const PEN = '#3d6ea5';
const SHADOW = 'rgba(84, 62, 38, 0.2)';
const PAPER = '#fbf7ee';
const LEAF = '#a4b86d';
const LEAF_DARK = '#879b52';
const GOLD = '#f0d27a';
const GOLD_INK = '#b3822a';
/** The flowers' colours: the palette's pink, yellow, orange, blue and red. */
export const FLOWER = ['#e7a3a0', '#f0d27a', '#de8a56', '#7298c1', '#c9574a'] as const;
const FLOWER_EYE = ['#f0d27a', '#de8a56', '#f0d27a', '#f0d27a', '#f0d27a'] as const;

/** A shape with its darker flat facet. */
function Faceted({ id, d, light, dark, shift = [-4, -3], sw = 2.6 }: { id: string; d: string; light: string; dark: string; shift?: [number, number]; sw?: number }) {
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

// ------------------------------------------------------------------ the page

/** The river across the top, the far bank's reeds, the sandy near bank, the meadow and a small pond at the front. */
export const GardenScenery = memo(function GardenScenery() {
  const meadow = `M0,600 L0,150 ${smoothOpen([[0, 150], [220, 140], [520, 156], [860, 142], [1200, 152]]).replace(/^M[^C]*/, '')} L1200,600 Z`;
  const bank = `M0,62 ${smoothOpen([[0, 104], [300, 96], [640, 110], [980, 94], [1200, 104]]).replace(/^M/, 'L')} L1200,62 Z`;
  return (
    <g className="garden-scenery">
      <clipPath id="garden-clip"><rect x={0} y={0} width={1200} height={600} /></clipPath>
      <g clipPath="url(#garden-clip)">
        <path d={bank} fill="#f3e8cf" />
        <path d={`M0,150 L1200,150 L1200,96 L0,96 Z`} fill="#f3e8cf" />
        <River w={1200} top={-12} bottom={92} seed={11} />
        {[[180, 40, 15], [690, 22, 12], [1010, 56, 14]].map(([x, y, r], i) => <LilyPad key={i} x={x} y={y} r={r} seed={i + 21} />)}
        <path d={meadow} fill="#eef0da" />
        <path d={smoothOpen([[0, 150], [220, 140], [520, 156], [860, 142], [1200, 152]])} fill="none" stroke={INK} strokeWidth={2.2} opacity={0.5} />
        {[[60, 118], [340, 124], [900, 116], [1150, 122]].map(([x, y], i) => <Reeds key={i} x={x} y={y} seed={i + 41} />)}
        {[[1150, 136, 0.9], [36, 142, 1]].map(([x, y, s], i) => (
          <g key={`st${i}`} transform={`translate(${x} ${y}) scale(${s})`} stroke={INK} strokeLinejoin="round">
            <path d={blob(3, 4, 30, 12, { seed: i + 50, n: 10 })} fill={SHADOW} stroke="none" />
            <path d={blob(0, 0, 30, 12, { seed: i + 50, n: 10 })} fill="#ddd4c3" strokeWidth={2.4} />
          </g>
        ))}
        {/* the pond at the front, on the right */}
        <path d={blob(1068, 562, 92, 30, { seed: 7, n: 12, wob: 0.05 })} fill="#9dbbd8" stroke={INK} strokeWidth={2.6} />
        <path d="M1010,560 q8,-5 16,0 t16,0 M1080,574 q8,-5 16,0 t16,0" fill="none" stroke={PAPER} strokeWidth={2.4} strokeLinecap="round" />
        {[[160, 598], [760, 596], [1180, 420], [24, 300], [610, 228], [1000, 350]].map(([x, y], i) => <Tuft key={`t${i}`} x={x} y={y} seed={i + 70} s={1.2} />)}
      </g>
    </g>
  );
});

// ------------------------------------------------------------------ the beds and what grows in them

/** A bed dug in the meadow: tilled earth with its furrows; `open`: dotted spots where the next seeds go. */
export const BedSoil = memo(function BedSoil({ x, y, s, i, open }: { x: number; y: number; s: number; i: number; open: boolean }) {
  const d = blob(0, 0, 76, 27, { seed: 30 + i, n: 12, wob: 0.04 });
  return (
    <g className={`bed${open ? ' is-open' : ''}`} transform={`translate(${x} ${y}) scale(${s})`} data-bed={i}>
      <path d={d} transform="translate(3 5)" fill={SHADOW} />
      <Faceted id={`bed-${i}`} d={d} light="#c2a07c" dark="#a8845f" shift={[0, -5]} sw={2.4} />
      <path d={wobblyLine(-62, -1, 62, 0, { bow: 1.2, seed: i + 3 })} stroke={INK} strokeWidth={1.4} opacity={0.35} fill="none" />
      {[[-48, 18], [30, -17], [58, 10]].map(([px, py], k) => <ellipse key={k} cx={px} cy={py} rx={3} ry={2.2} fill="#ddd4c3" stroke={INK} strokeWidth={1} />)}
      {open && Array.from({ length: 10 }, (_, k) => {
        const col = k % 5, row = Math.floor(k / 5);
        return <ellipse key={`o${k}`} cx={(col - 2) * 27} cy={row ? 12 : -12} rx={6} ry={4.2} fill="none" stroke={PEN} strokeWidth={2} strokeDasharray="1.5 4" strokeLinecap="round" />;
      })}
    </g>
  );
});

/** A seed as it grows: a sprout, a leafy plant with its bud, a flower (`color`: one of FLOWER). Standing on (x, y). */
export const SeedPlant = memo(function SeedPlant({ x, y, s, stage, color, i }: { x: number; y: number; s: number; stage: Stage; color: number; i: number }) {
  const R = rng(i * 13 + 7);
  const lean = (R() - 0.5) * 8;
  const g = (children: ReactNode) => (
    <g className={`garden-plant is-${stage}`} transform={`translate(${x} ${y}) scale(${s})`} data-plant={i} data-stage={stage} strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx={1} cy={1} rx={stage === 'sprout' ? 6 : 9} ry={2.4} fill="#8d6844" opacity={0.5} />
      <g transform={`rotate(${lean.toFixed(1)})`}>{children}</g>
    </g>
  );
  if (stage === 'sprout') {
    return g(<>
      <path d="M0,0 C-1,-4 1,-8 0,-12" fill="none" stroke={INK} strokeWidth={2} />
      <path d={leaf(0, -10, -8, -15, 3.4)} fill={LEAF} stroke={INK} strokeWidth={1.6} />
      <path d={leaf(0, -11, 8, -16, 3.4)} fill={LEAF} stroke={INK} strokeWidth={1.6} />
    </>);
  }
  if (stage === 'plant') {
    return g(<>
      <path d="M0,0 C-2,-9 2,-18 0,-26" fill="none" stroke={INK} strokeWidth={2.2} />
      <path d={leaf(0, -7, -11, -12, 4)} fill={LEAF} stroke={INK} strokeWidth={1.6} />
      <path d={leaf(0, -9, 11, -15, 4)} fill={LEAF} stroke={INK} strokeWidth={1.6} />
      <path d={leaf(0, -17, -9, -22, 3.6)} fill={LEAF} stroke={INK} strokeWidth={1.6} />
      <path d={blob(0, -29, 3.6, 5, { seed: i + 3, n: 7 })} fill={FLOWER[color]} stroke={INK} strokeWidth={1.6} />
      <path d="M-3,-26 L0,-24 L3,-26" fill="none" stroke={LEAF_DARK} strokeWidth={1.6} />
    </>);
  }
  const petal = FLOWER[color];
  return g(<>
    <path d="M0,0 C-2,-12 2,-24 0,-33" fill="none" stroke={INK} strokeWidth={2.2} />
    <path d={leaf(0, -8, -12, -13, 4.2)} fill={LEAF} stroke={INK} strokeWidth={1.6} />
    <path d={leaf(0, -12, 12, -18, 4.2)} fill={LEAF} stroke={INK} strokeWidth={1.6} />
    <g transform="translate(0 -36)">
      {Array.from({ length: 5 }, (_, k) => {
        const a = (k / 5) * Math.PI * 2 - Math.PI / 2 + (R() - 0.5) * 0.2;
        return <circle key={k} cx={(Math.cos(a) * 5.4).toFixed(1)} cy={(Math.sin(a) * 5.4).toFixed(1)} r={4.6} fill={petal} stroke={INK} strokeWidth={1.5} />;
      })}
      <circle r={3.2} fill={FLOWER_EYE[color]} stroke={INK} strokeWidth={1.4} />
    </g>
  </>);
});

/** A gold page's rare flower: a golden bloom in a clay pot, glints of blue pen round it. */
export const GoldPot = memo(function GoldPot({ x, y, i }: { x: number; y: number; i: number }) {
  const petals = Array.from({ length: 8 }, (_, k) => {
    const a = (k / 8) * Math.PI * 2;
    return leaf(0, 0, Math.cos(a) * 12, Math.sin(a) * 12, 5);
  });
  return (
    <g className="gold-pot" transform={`translate(${x} ${y})`} data-gold-pot={i} strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx={3} cy={2} rx={17} ry={4} fill="url(#hatch)" />
      <path d="M0,-22 C-2,-32 2,-40 0,-48" fill="none" stroke={INK} strokeWidth={2.2} />
      <path d={leaf(0, -30, -11, -36, 4)} fill={LEAF} stroke={INK} strokeWidth={1.6} />
      <path d={wobblyPoly([[-13, -22], [13, -22], [9, 0], [-9, 0]], { wob: 0.5, bow: 0.8, seed: i + 3 })} fill="#d98a5f" stroke={INK} strokeWidth={2.2} />
      <path d={wobblyPoly([[-16, -28], [16, -28], [15, -20], [-15, -20]], { wob: 0.4, bow: 0.6, seed: i + 4 })} fill="#de8a56" stroke={INK} strokeWidth={2.2} />
      <g transform="translate(0 -54)">
        {petals.map((d, k) => <path key={k} d={d} fill={k % 2 ? '#d9b24e' : GOLD} stroke={GOLD_INK} strokeWidth={1.6} />)}
        <circle r={4.4} fill="#de8a56" stroke={INK} strokeWidth={1.6} />
      </g>
      <g className="gold-glint" stroke={PEN} strokeWidth={2}>
        <path d="M-19,-66 L-15,-62 M-22,-57 L-17,-57" />
        <path d="M18,-68 L14,-64 M21,-59 L16,-59" />
      </g>
    </g>
  );
});

// ------------------------------------------------------------------ a finished sheet's tree or bush

/** Something bigger for a finished sheet: a tree or a pine (the forest), a bush or a flowering one (the river), with a stake with the sheet's number. */
export const SheetPlant = memo(function SheetPlant({ kind, sheet, s }: { kind: BigKind; sheet: number; s: number }) {
  const seed = 600 + sheet * 7;
  return (
    <g>
      {kind === 'tree' ? <Tree x={0} y={0} s={s} seed={seed} />
        : kind === 'pine' ? <Pine x={0} y={0} s={s} seed={seed} />
          : <Bush x={0} y={0} s={s * 1.15} seed={seed} />}
      {kind === 'bloom' && [[-20, -24, 0], [6, -34, 1], [22, -18, 2], [-4, -14, 3], [-30, -12, 1]].map(([fx, fy, c], k) => (
        <g key={k} transform={`translate(${fx * s} ${fy * s})`}>
          {[0, 1, 2, 3, 4].map((j) => { const a = (j / 5) * Math.PI * 2; return <circle key={j} cx={Math.cos(a) * 3.4} cy={Math.sin(a) * 3.4} r={2.8} fill={['#e7a3a0', '#f0d27a', PAPER, '#e7a3a0'][c]} stroke={INK} strokeWidth={1.1} />; })}
          <circle r={1.8} fill="#de8a56" stroke={INK} strokeWidth={0.9} />
        </g>
      ))}
      <Stake n={sheet} x={kind === 'pine' || kind === 'tree' ? 22 * s : 30 * s} />
    </g>
  );
});

/** A little wooden stake with a paper tag: the sheet it grew from. */
function Stake({ n, x }: { n: number; x: number }) {
  return (
    <g transform={`translate(${x} 4)`} strokeLinejoin="round" strokeLinecap="round">
      <path d="M0,0 L0,-24" stroke={INK} strokeWidth={4.4} />
      <path d="M0,0 L0,-24" stroke="#b08560" strokeWidth={2.2} />
      <path d={wobblyPoly([[-11, -36], [11, -37], [11, -22], [-11, -21]], { wob: 0.4, bow: 0.6, seed: n })} fill={PAPER} stroke={INK} strokeWidth={1.8} />
      <text x={0} y={-24.5} textAnchor="middle" className="stake-no">{n}</text>
    </g>
  );
}

// ------------------------------------------------------------------ the bosses' special plants

/** A sunflower, taller than the rest: big leaves, a dark disc of seeds, yellow petals with their facet. */
function Girasol() {
  const petals = Array.from({ length: 14 }, (_, k) => {
    const a = (k / 14) * Math.PI * 2;
    return leaf(Math.cos(a) * 11, Math.sin(a) * 11, Math.cos(a) * 30, Math.sin(a) * 30, 8);
  });
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx={3} cy={2} rx={22} ry={5} fill="url(#hatch)" />
      <path d="M0,0 C-4,-40 4,-80 0,-118" fill="none" stroke={INK} strokeWidth={4.6} />
      <path d="M0,0 C-4,-40 4,-80 0,-118" fill="none" stroke={LEAF_DARK} strokeWidth={2.2} />
      <path d={leaf(0, -34, -30, -52, 11)} fill={LEAF} stroke={INK} strokeWidth={2.2} />
      <path d={leaf(0, -58, 30, -74, 11)} fill={LEAF} stroke={INK} strokeWidth={2.2} />
      <g className="sway" transform="translate(0 -126)">
        <g transform="rotate(-10)">
          {petals.map((d, k) => <path key={k} d={d} fill={k % 2 ? '#e8c35a' : GOLD} stroke={INK} strokeWidth={1.8} />)}
          <circle r={14} fill="#8d6844" stroke={INK} strokeWidth={2.4} />
          {Array.from({ length: 9 }, (_, k) => { const a = k * 2.4, r = 3 + (k % 3) * 3; return <circle key={k} cx={Math.cos(a) * r} cy={Math.sin(a) * r} r={1.2} fill="#5c4632" />; })}
        </g>
      </g>
    </g>
  );
}

/** A ring of red mushrooms on the grass. */
function Hongos() {
  const ring: [number, number, number][] = [[-38, -2, 1], [-18, -12, 0.8], [8, -14, 1.1], [34, -6, 0.85], [30, 12, 1.05], [2, 16, 0.9], [-28, 12, 0.95]];
  return (
    <g>
      <ellipse cx={0} cy={2} rx={48} ry={16} fill="#d7dcb4" opacity={0.6} />
      {[...ring].sort((a, b) => a[1] - b[1]).map(([x, y, s], k) => <Mushroom key={k} x={x} y={y} s={s * 1.1} seed={k} />)}
    </g>
  );
}

/** A dandelion: jagged leaves, a yellow flower and a white puffball whose seeds fly off. */
function Diente() {
  const R = rng(5);
  const rays = Array.from({ length: 18 }, (_, k) => (k / 18) * Math.PI * 2);
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx={2} cy={2} rx={20} ry={4} fill="url(#hatch)" />
      {[-1, 1].map((sd) => <path key={sd} d={wobblyPoly([[0, 0], [sd * 12, -6], [sd * 16, -4], [sd * 22, -12], [sd * 26, -10], [sd * 30, -18], [sd * 20, -12], [sd * 8, -4]], { wob: 0.4, bow: 0.6, seed: sd + 9 })} fill={LEAF} stroke={INK} strokeWidth={1.8} />)}
      <path d="M-2,0 C-4,-20 2,-40 -2,-62" fill="none" stroke={INK} strokeWidth={2} />
      <path d="M2,0 C6,-14 12,-24 14,-34" fill="none" stroke={INK} strokeWidth={2} />
      <g transform="translate(14 -38)">
        {Array.from({ length: 10 }, (_, k) => { const a = (k / 10) * Math.PI * 2; return <path key={k} d={leaf(0, 0, Math.cos(a) * 8, Math.sin(a) * 8, 3)} fill={GOLD} stroke={INK} strokeWidth={1.1} />; })}
        <circle r={2.6} fill="#de8a56" stroke={INK} strokeWidth={1} />
      </g>
      <g transform="translate(-2 -70)">
        {rays.map((a, k) => (
          <g key={k}>
            <path d={`M0,0 L${(Math.cos(a) * 14).toFixed(1)},${(Math.sin(a) * 14).toFixed(1)}`} stroke={INK} strokeWidth={0.9} opacity={0.55} />
            <circle cx={(Math.cos(a) * 15).toFixed(1)} cy={(Math.sin(a) * 15).toFixed(1)} r={1.7 + R() * 0.6} fill={PAPER} stroke={INK} strokeWidth={0.9} />
          </g>
        ))}
        <circle r={3} fill="#d9b98c" stroke={INK} strokeWidth={1.2} />
      </g>
      <g className="float-seed" transform="translate(16 -92)">
        <path d="M0,0 L0,7" stroke={INK} strokeWidth={0.9} />
        <path d="M-4,-2 L0,0 L4,-2 M0,0 L0,-4" stroke={INK} strokeWidth={0.9} />
      </g>
    </g>
  );
}

/** A fern: arched fronds whose leaflets alternate side to side (a zigzag, the pattern of sheet 8), one frond still curled. */
function Helecho() {
  const frond = (dir: number, len: number, rise: number, k: number) => {
    const pts: [number, number][] = Array.from({ length: 10 }, (_, i) => {
      const t = i / 9;
      return [dir * len * t, -rise * Math.sin(Math.PI * t * 0.86)];
    });
    return (
      <g key={k}>
        <path d={smoothOpen(pts)} fill="none" stroke={INK} strokeWidth={2.6} />
        {pts.slice(1).map(([x, y], i) => {
          const w = 17 * (1 - i / 11), up = i % 2 === 0;
          const tip: [number, number] = up ? [x + dir * 4, y - w] : [x + dir * 7, y + w * 0.75];
          return <path key={i} d={leaf(x, y, tip[0], tip[1], w * 0.46)} fill={up ? LEAF : LEAF_DARK} stroke={INK} strokeWidth={1.3} />;
        })}
      </g>
    );
  };
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx={2} cy={2} rx={40} ry={6} fill="url(#hatch)" />
      {frond(-1, 66, 44, 1)}
      {frond(1, 64, 48, 2)}
      {frond(-1, 42, 70, 3)}
      {frond(1, 38, 74, 4)}
      <path d="M2,0 C3,-22 6,-44 16,-50 C24,-54 26,-44 19,-42 C14,-41 15,-46 18,-46" fill="none" stroke={INK} strokeWidth={2.4} />
    </g>
  );
}

/** Tall reeds by the water, a blue dragonfly hovering over them. */
function Juncos() {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <g transform="scale(1.7)"><Reeds x={0} y={0} seed={77} /></g>
      <g transform="translate(20 -44) scale(1.3)"><Reeds x={0} y={0} seed={78} /></g>
      <g className="dragonfly" transform="translate(-6 -112)">
        <g className="hover">
          <path d="M-2,-4 C-18,-14 -26,-4 -14,0 Z M2,-4 C18,-14 26,-4 14,0 Z" fill="rgba(220, 230, 240, 0.85)" stroke={INK} strokeWidth={1.4} />
          <path d="M-2,0 C-16,6 -22,14 -10,10 Z M2,0 C16,6 22,14 10,10 Z" fill="rgba(220, 230, 240, 0.85)" stroke={INK} strokeWidth={1.4} />
          <path d="M0,-8 L0,22" stroke={INK} strokeWidth={4.4} />
          <path d="M0,-8 L0,22" stroke="#7298c1" strokeWidth={2.2} />
          <circle cy={-9} r={3.6} fill="#5a7fa6" stroke={INK} strokeWidth={1.4} />
        </g>
      </g>
    </g>
  );
}

/** A water lily in flower on its pad (it lives in the pond). */
function Nenufar() {
  const outer = Array.from({ length: 8 }, (_, k) => { const a = Math.PI + (k / 7) * Math.PI; return leaf(0, 0, Math.cos(a) * 17, Math.sin(a) * 12 - 1, 6); });
  const inner = Array.from({ length: 5 }, (_, k) => { const a = Math.PI * 1.15 + (k / 4) * Math.PI * 0.7; return leaf(0, -2, Math.cos(a) * 11, Math.sin(a) * 14 - 2, 5); });
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <LilyPad x={-8} y={4} r={26} seed={31} />
      <g transform="translate(-4 -2)">
        {outer.map((d, k) => <path key={k} d={d} fill={k % 2 ? '#e7a3a0' : '#f3c4c0'} stroke={INK} strokeWidth={1.5} />)}
        {inner.map((d, k) => <path key={`i${k}`} d={d} fill="#f7d9d4" stroke={INK} strokeWidth={1.4} />)}
        <circle cy={-4} r={3.4} fill={GOLD} stroke={INK} strokeWidth={1.3} />
      </g>
    </g>
  );
}

/** A small ceibo in flower: a twisted trunk, a few leaves, red flowers like little beaks. */
function Ceibo() {
  const trunk = wobblyPoly([[-7, 0], [7, 0], [6, -34], [14, -58], [8, -60], [1, -42], [-6, -62], [-12, -58], [-5, -34]], { wob: 0.6, bow: 1.2, seed: 41 });
  const clusters: [number, number][] = [[-16, -74], [4, -86], [22, -70], [-6, -62], [14, -56]];
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx={3} cy={2} rx={30} ry={6} fill="url(#hatch)" />
      <Faceted id="ceibo-trunk" d={trunk} light="#9a7654" dark="#7a5a3e" shift={[-3, 0]} sw={2.4} />
      {clusters.map(([x, y], k) => (
        <g key={k} transform={`translate(${x} ${y})`}>
          <path d={leaf(0, 4, -14, 0, 5)} fill={LEAF} stroke={INK} strokeWidth={1.4} />
          <path d={leaf(0, 4, 13, -2, 5)} fill={LEAF_DARK} stroke={INK} strokeWidth={1.4} />
          {[-6, 0, 6].map((dx, j) => <path key={j} d={`M${dx},4 C${dx - 3},-4 ${dx + 1},-10 ${dx + 5},-12 C${dx + 4},-6 ${dx + 3},0 ${dx + 1},4 Z`} fill="#c9574a" stroke={INK} strokeWidth={1.4} />)}
        </g>
      ))}
    </g>
  );
}

const RARE: Record<RareId, () => ReactNode> = {
  girasol: Girasol, hongos: Hongos, diente: Diente, helecho: Helecho, juncos: Juncos, nenufar: Nenufar, ceibo: Ceibo,
};

/** A boss's special plant, standing on (0, 0). */
export const RarePlantArt = memo(function RarePlantArt({ id }: { id: RareId }) {
  const Art = RARE[id];
  return <g className={`rare rare-${id}`}><Art /></g>;
});

/** How tall a special plant stands (the tour and the silhouettes frame it). */
export const RARE_BOX: Record<RareId, { w: number; h: number }> = {
  girasol: { w: 80, h: 160 }, hongos: { w: 110, h: 50 }, diente: { w: 70, h: 100 }, helecho: { w: 130, h: 90 },
  juncos: { w: 70, h: 130 }, nenufar: { w: 70, h: 40 }, ceibo: { w: 70, h: 100 },
};

