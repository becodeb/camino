// Drawings of the showcase (sheet 17), when the child shows the year to the
// family: bunting across the riverbank, and its four stations: a clothesline
// with the pages the child picked hanging from pegs, a big chair and a small
// one in front of a page on an easel (the family plays, the child explains),
// the garden's little gate among flowers, and the poster of the year rolled
// up with a ribbon; their small pictures for the bar. Same ink, weights and
// flat facets as the rest (docs/style-guide.md).

import { memo, type ReactNode } from 'react';
import { leaf, wobblyLine, wobblyPoly } from '../ink/ink.js';

const INK = '#2b2622';
const PEN = '#3d6ea5';
const SHADOW = 'rgba(84, 62, 38, 0.2)';
const PAPER = '#fbf7ee';
const WOOD = '#c9955f';
const WOOD_DARK = '#a57c55';
const FLAGS = ['#de8a56', '#7298c1', '#f0d27a', '#e7a3a0', '#a4b86d'];

/** Bunting on a string from (x0, y0) to (x1, y1), sagging `sag`. */
export function Bunting({ x0, y0, x1, y1, sag = 40, n = 9, seed = 1 }: { x0: number; y0: number; x1: number; y1: number; sag?: number; n?: number; seed?: number }) {
  const at = (t: number) => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + sag * 4 * t * (1 - t)] as const;
  return (
    <g className="bunting" strokeLinejoin="round" strokeLinecap="round">
      <path d={`M${x0},${y0} Q${(x0 + x1) / 2},${(y0 + y1) / 2 + sag * 2} ${x1},${y1}`} fill="none" stroke={INK} strokeWidth={1.8} />
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = at((i + 0.5) / n);
        return <path key={i} d={wobblyPoly([[x - 11, y], [x + 11, y + 1], [x + 1, y + 24]], { wob: 0.6, bow: 0.6, seed: seed + i })} fill={FLAGS[(i + seed) % FLAGS.length]} stroke={INK} strokeWidth={1.8} />;
      })}
    </g>
  );
}

/** A clothes peg holding something at (0, 0). */
function Peg() {
  return (
    <g strokeLinejoin="round">
      <path d="M-3,-8 L3,-8 L3.4,8 L-3.4,8 Z" fill="#e3c79a" stroke={INK} strokeWidth={1.6} />
      <path d="M-3.2,0 L3.2,0" stroke={INK} strokeWidth={1.2} opacity={0.6} />
    </g>
  );
}

/**
 * Station 1: a clothesline between two posts, the pages the child picked
 * hanging from pegs (`pages`: their drawings), dashed empty pages for the ones
 * still to pick.
 */
export function Clothesline({ pages }: { pages: (ReactNode | null)[] }) {
  const xs = [-92, 0, 92];
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx={4} cy={4} rx={140} ry={10} fill="url(#hatch)" />
      {[-140, 140].map((x) => (
        <g key={x}>
          <path d={`M${x},2 L${x},-196`} stroke={INK} strokeWidth={9} />
          <path d={`M${x},2 L${x},-196`} stroke={WOOD} strokeWidth={5} />
        </g>
      ))}
      <path d="M-140,-186 Q0,-160 140,-186" fill="none" stroke={INK} strokeWidth={2} />
      {xs.map((x, i) => {
        const y = -186 + 26 * (1 - Math.pow(x / 140, 2));
        const page = wobblyPoly([[-38, 0], [38, 0], [38, 86], [-38, 86]], { wob: 0.8, bow: 1, seed: i + 3 });
        return (
          <g key={i} transform={`translate(${x} ${y + 4}) rotate(${(i - 1) * 3})`}>
            {pages[i] ? (
              <>
                <path d={page} transform="translate(3 4)" fill={SHADOW} />
                <path d={page} fill={PAPER} stroke={INK} strokeWidth={2.4} />
                <g transform="translate(-32 10)">{pages[i]}</g>
              </>
            ) : (
              <path d={page} fill="#f3ecdc" stroke={INK} strokeOpacity={0.45} strokeWidth={2.2} strokeDasharray="5 6" />
            )}
            <Peg />
          </g>
        );
      })}
    </g>
  );
}

/** A wooden chair, `s` its size (the family's big one, the child's small one), facing the page. */
function Chair({ x, s, seed }: { x: number; s: number; seed: number }) {
  const seat = wobblyPoly([[-26, -40], [26, -42], [26, -32], [-26, -30]], { wob: 0.5, bow: 0.6, seed });
  const back = wobblyPoly([[-24, -110], [24, -112], [24, -48], [-24, -46]], { wob: 0.6, bow: 0.8, seed: seed + 1 });
  return (
    <g transform={`translate(${x} 0) scale(${s})`} strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx={4} cy={2} rx={34} ry={6} fill="url(#hatch)" />
      {[-22, 22].map((lx) => <path key={lx} d={`M${lx},-32 L${lx},0`} stroke={INK} strokeWidth={7} />)}
      {[-22, 22].map((lx) => <path key={`w${lx}`} d={`M${lx},-32 L${lx},0`} stroke={WOOD_DARK} strokeWidth={3.6} />)}
      <path d={back} fill={WOOD} stroke={INK} strokeWidth={2.6} />
      {[-72, -58].map((y) => <path key={y} d={wobblyLine(-18, y, 18, y - 1, { bow: 0.6, seed: y + seed })} stroke={INK} strokeWidth={1.4} opacity={0.45} fill="none" />)}
      <path d={seat} fill="#d9ab7a" stroke={INK} strokeWidth={2.6} />
    </g>
  );
}

/** Station 2: a page on a small easel, a big chair and a small one in front of it. */
export function FamilyChairs({ page }: { page?: ReactNode }) {
  const sheet = wobblyPoly([[-44, -178], [44, -180], [46, -96], [-42, -94]], { wob: 0.8, bow: 1, seed: 21 });
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d="M0,-186 L-30,0 M0,-186 L30,0 M0,-186 L0,-60" stroke={INK} strokeWidth={7} />
      <path d="M0,-186 L-30,0 M0,-186 L30,0" stroke={WOOD} strokeWidth={3.6} />
      <path d={sheet} transform="translate(4 5)" fill={SHADOW} />
      <path d={sheet} fill={PAPER} stroke={INK} strokeWidth={2.6} />
      {page ? <g transform="translate(-36 -170)">{page}</g> : [-160, -144, -128, -112].map((y) => <path key={y} d={`M-34,${y} L34,${y}`} stroke={PEN} strokeOpacity={0.3} strokeWidth={2} />)}
      <path d="M-50,-92 L50,-94" stroke={INK} strokeWidth={6} />
      <path d="M-50,-92 L50,-94" stroke={WOOD} strokeWidth={3} />
      <Chair x={-62} s={1.25} seed={31} />
      <Chair x={64} s={0.82} seed={33} />
    </g>
  );
}

/** A little flower of the gate's border. */
function Flower({ x, y, c }: { x: number; y: number; c: string }) {
  return (
    <g transform={`translate(${x} ${y})`} strokeLinejoin="round">
      <path d="M0,0 C-1,-8 1,-14 0,-20" fill="none" stroke={INK} strokeWidth={1.8} />
      <path d={leaf(0, -8, -8, -12, 3)} fill="#a4b86d" stroke={INK} strokeWidth={1.3} />
      {[0, 1, 2, 3, 4].map((k) => { const a = (k / 5) * Math.PI * 2; return <circle key={k} cx={Math.cos(a) * 4} cy={-23 + Math.sin(a) * 4} r={3.4} fill={c} stroke={INK} strokeWidth={1.2} />; })}
      <circle cy={-23} r={2.2} fill="#f0d27a" stroke={INK} strokeWidth={1} />
    </g>
  );
}

/** Station 3: the garden's little wooden gate, a bit of fence each side, flowers along it. */
export function GardenGate() {
  const pickets = (x0: number, n: number, seed: number) => Array.from({ length: n }, (_, i) => {
    const x = x0 + i * 22;
    return <path key={`${seed}-${i}`} d={wobblyPoly([[x - 7, 0], [x + 7, 0], [x + 7, -70], [x, -80], [x - 7, -70]], { wob: 0.4, bow: 0.5, seed: seed + i })} fill="#e3c79a" stroke={INK} strokeWidth={2.2} />;
  });
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx={4} cy={3} rx={150} ry={9} fill="url(#hatch)" />
      {[-24, -56].map((y) => <path key={y} d={`M-140,${y} L-50,${y} M50,${y} L140,${y}`} stroke={INK} strokeWidth={6} />)}
      {[-24, -56].map((y) => <path key={`r${y}`} d={`M-140,${y} L-50,${y} M50,${y} L140,${y}`} stroke={WOOD} strokeWidth={3} />)}
      {pickets(-136, 4, 40)}
      {pickets(70, 4, 50)}
      {[-50, 50].map((x) => (
        <g key={x}>
          <path d={`M${x},2 L${x},-104`} stroke={INK} strokeWidth={11} />
          <path d={`M${x},2 L${x},-104`} stroke={WOOD_DARK} strokeWidth={7} />
          <circle cx={x} cy={-108} r={7} fill={WOOD} stroke={INK} strokeWidth={2.2} />
        </g>
      ))}
      {/* the gate, a little open */}
      <g transform="translate(-44 0) skewY(-6)">
        <path d={wobblyPoly([[0, -6], [62, -6], [62, -84], [0, -84]], { wob: 0.6, bow: 0.8, seed: 61 })} fill="none" stroke={INK} strokeWidth={2.4} />
        {[8, 22, 36, 50].map((x) => <path key={x} d={`M${x},-6 L${x},-84`} stroke={INK} strokeWidth={6} />)}
        {[8, 22, 36, 50].map((x) => <path key={`g${x}`} d={`M${x},-6 L${x},-84`} stroke="#e3c79a" strokeWidth={3.4} />)}
        <path d="M2,-20 L60,-72" stroke={INK} strokeWidth={6} />
        <path d="M2,-20 L60,-72" stroke={WOOD} strokeWidth={3} />
      </g>
      {[[-128, 6, '#e7a3a0'], [-100, 4, '#f0d27a'], [-72, 6, '#7298c1'], [84, 5, '#de8a56'], [112, 6, '#e7a3a0'], [138, 4, '#f0d27a']].map(([x, y, c], i) => <Flower key={i} x={x as number} y={y as number} c={c as string} />)}
    </g>
  );
}

/** Station 4: the poster of the year, rolled up and tied with a red ribbon, a gold star sticker on it. */
export function RolledPoster() {
  const roll = wobblyPoly([[-70, -60], [70, -64], [72, -18], [-68, -14]], { wob: 0.6, bow: 1, seed: 71 });
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx={4} cy={4} rx={86} ry={9} fill="url(#hatch)" />
      {/* the easel holding it up */}
      <path d="M-40,2 L-10,-150 M40,2 L10,-150 M0,-150 L0,-10" stroke={INK} strokeWidth={7} />
      <path d="M-40,2 L-10,-150 M40,2 L10,-150" stroke={WOOD} strokeWidth={3.6} />
      <g transform="translate(0 -70)">
        <path d={roll} transform="translate(4 5)" fill={SHADOW} />
        <path d={roll} fill={PAPER} stroke={INK} strokeWidth={2.6} />
        <ellipse cx={-70} cy={-37} rx={8} ry={23} fill="#efe6d2" stroke={INK} strokeWidth={2.4} />
        <path d="M-72,-50 q5,12 0,26" fill="none" stroke={INK} strokeWidth={1.4} opacity={0.5} />
        <path d="M6,-64 L10,-16" stroke="#c9574a" strokeWidth={9} />
        <path d="M6,-64 L10,-16" stroke={INK} strokeWidth={1.4} opacity={0.4} />
        <path d="M8,-38 q-14,-14 -22,-4 q8,10 22,4 q14,-14 22,-4 q-8,10 -22,4 Z" fill="#c9574a" stroke={INK} strokeWidth={2} />
        <path d="M8,-38 l-10,26 M8,-38 l12,24" stroke="#c9574a" strokeWidth={4} />
        <g transform="translate(44 -40) rotate(-12)"><Star /></g>
      </g>
    </g>
  );
}

function Star({ r = 13 }: { r?: number }) {
  const pts: [number, number][] = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, k = i % 2 ? r * 0.46 : r;
    return [Math.cos(a) * k, Math.sin(a) * k];
  });
  return <path d={wobblyPoly(pts, { wob: 0.4, bow: 0.3, seed: 8 })} fill="#f0d27a" stroke={INK} strokeWidth={2} />;
}

// ------------------------------------------------------------------ the bar's small pictures

const icon = (children: ReactNode, vb = '-26 -24 52 48', size = 44) => (
  <svg viewBox={vb} width={size} height={size * (Number(vb.split(' ')[3]) / Number(vb.split(' ')[2]))} aria-hidden="true" className="doodle">
    <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round" stroke={INK}>{children}</g>
  </svg>
);

/** The showcase's bunting, small (its mark). */
export const BuntingIcon = memo(function BuntingIcon({ size = 44 }: { size?: number }) {
  return icon(<>
    <path d="M-22,-16 L-22,20 M22,-16 L22,20" strokeWidth={2.4} />
    <path d="M-22,-14 Q0,-2 22,-14" fill="none" strokeWidth={1.4} />
    {[-14, -3, 8].map((x, i) => <path key={x} d={`M${x - 5},${-10 + (i === 1 ? 3 : 1)} L${x + 5},${-10 + (i === 1 ? 3 : 1)} L${x},${2 + (i === 1 ? 3 : 1)} Z`} fill={FLAGS[i]} strokeWidth={1.4} />)}
  </>, '-26 -22 52 46', size);
});

/** "Pick your pages", small: two pages on a line with pegs. */
export const PickIcon = memo(function PickIcon({ size = 44 }: { size?: number }) {
  return icon(<>
    <path d="M-24,-14 Q0,-6 24,-14" fill="none" strokeWidth={1.6} />
    {[-11, 11].map((x, i) => <g key={x} transform={`translate(${x} ${-10 + i}) rotate(${i ? 4 : -4})`}><path d="M-8,0 L8,0 L8,20 L-8,20 Z" fill={PAPER} strokeWidth={1.8} /><path d="M-4,8 L4,8 M-4,13 L4,13" stroke={PEN} strokeOpacity={0.5} strokeWidth={1.4} /><path d="M-1.5,-4 L1.5,-4 L1.6,3 L-1.6,3 Z" fill="#e3c79a" strokeWidth={1} /></g>)}
  </>, '-26 -20 52 40', size);
});

/** "Your family plays", small: a big chair and a small one. */
export const ChairsIcon = memo(function ChairsIcon({ size = 44 }: { size?: number }) {
  return icon(<>
    <path d="M-20,-18 L-4,-18 L-4,2 L-20,2 Z" fill={WOOD} strokeWidth={1.8} />
    <path d="M-22,2 L-2,2 L-2,6 L-22,6 Z" fill="#d9ab7a" strokeWidth={1.8} />
    <path d="M-20,6 L-20,18 M-4,6 L-4,18" strokeWidth={2.2} />
    <path d="M6,-4 L18,-4 L18,8 L6,8 Z" fill={WOOD} strokeWidth={1.6} />
    <path d="M5,8 L19,8 L19,11 L5,11 Z" fill="#d9ab7a" strokeWidth={1.6} />
    <path d="M6,11 L6,18 M18,11 L18,18" strokeWidth={2} />
  </>, '-26 -22 52 44', size);
});

/** "Your garden", small: the gate between two flowers. */
export const GateIcon = memo(function GateIcon({ size = 44 }: { size?: number }) {
  return icon(<>
    <path d="M-10,16 L-10,-14 M10,16 L10,-14" strokeWidth={3.4} />
    {[-5, 0, 5].map((x) => <path key={x} d={`M${x},14 L${x},-8`} strokeWidth={2.4} stroke={INK} />)}
    <path d="M-10,0 L10,-6" strokeWidth={2} />
    {[[-18, '#e7a3a0'], [18, '#f0d27a']].map(([x, c]) => <g key={x as number}><path d={`M${x},16 L${x},4`} strokeWidth={1.6} /><circle cx={x as number} cy={1} r={4.6} fill={c as string} strokeWidth={1.4} /></g>)}
  </>, '-26 -20 52 40', size);
});

/** "Your year", small: the rolled poster with its ribbon. */
export const PosterIcon = memo(function PosterIcon({ size = 44 }: { size?: number }) {
  return icon(<>
    <path d="M-20,-8 L20,-10 L20,8 L-20,10 Z" fill={PAPER} strokeWidth={1.8} />
    <ellipse cx={-20} cy={1} rx={3.4} ry={9} fill="#efe6d2" strokeWidth={1.6} />
    <path d="M2,-10 L3,9" stroke="#c9574a" strokeWidth={4} />
    <path d="M10,-3 l2,-4 2,4 -4,-2 h4 z" fill="#f0d27a" strokeWidth={1.2} />
  </>, '-26 -18 52 36', size);
});

