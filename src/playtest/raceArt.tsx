// "La carrera" (T33): its art, drawn in code in the notebook's style (docs
// style-guide: ink #2b2622 with the #rough edge, flat colours with one
// darker facet, flat hatched shadows, blue-pen annotations). The karts (a
// soap-box cart: a backrest, a tub, two spoked wheels, a little steering
// wheel; the driver sits between backrest and tub), the road seen from the
// side with its three lanes, hills, ramps and turbo chevrons, the
// roadside, the start line and the finish arch with the seed that waits
// there, the stretch's mini map for the panel, the bump bush and its
// leaves, the dust and the turbo flames, the cup, the podium, the shelf of
// cups, the menu card, and the "¡Otra carrera!" drawing.

import { memo, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { blob, leaf, penLoop, wobblyPoly } from '../ink/ink.js';
import type { CritterId } from '../curriculum/motivation';
import { CritterArt } from '../ui/critterArt';
import { drawPortrait } from '../ui/board/BoardView';
import { usePlayer } from '../screens/player';
import { START_LINE, heightAt, type Course, type RoadDir, type Stretch } from './race';

export const INK = '#2b2622';
const PEN = '#3d6ea5';
const SHADOW = 'rgba(84, 62, 38, 0.2)';
const PAPER = '#fbf7ee';
const DIRT = '#e8d5ac';
const DIRT_DARK = '#d6bd8c';
const GRASS = '#dfe4bf';
const GREEN = '#a4b86d';
const GREEN_DARK = '#879c52';
const GOLD = '#f0d27a';
const GOLD_DARK = '#d4ac4a';
const WOOD = '#c9955f';
const WOOD_DARK = '#a8763f';

/** The karts' colours (a flat fill and its darker facet): the child's orange, the critters' blue and yellow. */
export const KART = {
  me: { fill: '#de8a56', dark: '#c26c3a' },
  r0: { fill: '#7298c1', dark: '#557ca6' },
  r1: { fill: '#f0d27a', dark: '#d4ac4a' },
} as const;
export type KartTone = keyof typeof KART;

// ------------------------------------------------------------------ the track's geometry (world units)

/** One road piece is SEG wide; one step of height is STEP tall. */
export const SEG = 150;
export const STEP = 26;
/** The middle lane's road surface at height 0. */
export const BASE = 268;
/** The track's drawing height (its width follows the screen). */
export const TRACK_H = 340;
/** Each lane: where its karts touch the road (relative to the middle surface) and how big they look (depth). */
export const LANES = { r1: { dy: -46, s: 0.92 }, r0: { dy: -16, s: 1.06 }, me: { dy: 22, s: 1.24 } } as const;
const ROAD_TOP = -66;
const ROAD_BOTTOM = 40;

export const surfaceY = (c: Course, u: number) => BASE - heightAt(c, u) * STEP;

/** A row of points along an edge of the road (`dy` from the middle surface), from u0 to u1, one per piece. */
function edge(c: Course, u0: number, u1: number, dy: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let u = u0; u <= u1; u++) pts.push([u * SEG, surfaceY(c, u) + dy]);
  return pts;
}
const line = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/** Three short strokes from a point: the grass of the reference. */
const tuft = (x: number, y: number, s = 1) => `M${x},${y} l${-5 * s},${-10 * s} M${x + 2},${y} l${1 * s},${-12 * s} M${x + 4},${y} l${6 * s},${-9 * s}`;

/**
 * The whole road of a race (drawn once): the grass under it, the dirt road
 * with its ink edges and dashed lanes, the ramps, turbo chevrons, the gates
 * of each stretch, the start line and the finish arch, roadside tufts and
 * stones.
 */
export const TrackRoad = memo(function TrackRoad({ c, stretches }: { c: Course; stretches: readonly Stretch[] }) {
  const u0 = -4, u1 = c.length + 10;
  const top = edge(c, u0, u1, ROAD_TOP);
  const bottom = edge(c, u0, u1, ROAD_BOTTOM);
  const road = `${line(top)} ${line([...bottom].reverse()).replace(/^M/, 'L')} Z`;
  const ground = `${line(bottom)} L${u1 * SEG},${TRACK_H + 40} L${u0 * SEG},${TRACK_H + 40} Z`;
  // a hill under the back verge: the grass rises behind the road, so a raised road sits on a slope
  const verge = `${line(edge(c, u0, u1, ROAD_TOP + 2))} L${u1 * SEG},${TRACK_H + 40} L${u0 * SEG},${TRACK_H + 40} Z`;
  const decor: ReactNode[] = [];
  for (let u = u0; u < u1; u++) {
    const x = u * SEG + ((u * 53) % 70);
    decor.push(<path key={`t${u}`} d={tuft(x, surfaceY(c, u + 0.4) + ROAD_TOP - 1, 1)} />);
    if (u % 3 === 1) decor.push(<path key={`b${u}`} d={tuft(x + 60, surfaceY(c, u + 0.8) + ROAD_BOTTOM + 30, 1.2)} />);
    if (u % 4 === 2) {
      const sx = u * SEG + 90, sy = surfaceY(c, u + 0.6) + ROAD_BOTTOM + 52;
      decor.push(<path key={`s${u}`} d={blob(sx, sy, 11, 7, { seed: u + 3, n: 7 })} fill="#bdb09c" strokeWidth={2.2} />);
    }
  }
  return (
    <g className="rc-road" strokeLinecap="round" strokeLinejoin="round">
      <path d={verge} fill={GRASS} />
      <g filter="url(#rough)">
        <path d={ground} fill="#d3dbab" />
        <path d={road} fill={DIRT} />
        {/* the ramps' darker facet: the slope of every rising or falling piece */}
        {c.heights.slice(0, -1).map((h, u) => (c.heights[u + 1] === h ? null : (
          <path key={`r${u}`} d={`M${u * SEG},${surfaceY(c, u) + ROAD_BOTTOM} L${(u + 1) * SEG},${surfaceY(c, u + 1) + ROAD_BOTTOM} L${(u + 1) * SEG},${surfaceY(c, u + 1) + ROAD_BOTTOM - 10} L${u * SEG},${surfaceY(c, u) + ROAD_BOTTOM - 10} Z`} fill={DIRT_DARK} />
        )))}
        <path d={line(top)} fill="none" stroke={INK} strokeWidth={3} />
        <path d={line(bottom)} fill="none" stroke={INK} strokeWidth={3} />
        <path d={line(edge(c, u0, u1, -31))} fill="none" stroke={PAPER} strokeWidth={3} strokeDasharray="14 18" opacity={0.85} />
        <path d={line(edge(c, u0, u1, 3))} fill="none" stroke={PAPER} strokeWidth={3} strokeDasharray="14 18" opacity={0.85} />
      </g>
      {/* the turbo straights: chevrons painted on the road */}
      {stretches.map((s, k) => (s.turbo ? s.road.map((_, i) => {
        const u = c.starts[k] + i + 0.5;
        const y = surfaceY(c, u) - 8;
        return (
          <g key={`ch${k}-${i}`} transform={`translate(${u * SEG} ${y})`} fill="none" stroke={GOLD_DARK} strokeWidth={5} opacity={0.9}>
            <path d="M-26,-14 L-12,0 L-26,14 M-4,-14 L10,0 L-4,14" />
          </g>
        );
      }) : null))}
      <g stroke={INK} strokeWidth={2} fill="none" opacity={0.75}>{decor}</g>
      {/* the start line: a dashed white band across the road */}
      <path d={`M${START_LINE * SEG},${surfaceY(c, START_LINE) + ROAD_TOP + 3} L${START_LINE * SEG - 10},${surfaceY(c, START_LINE) + ROAD_BOTTOM - 3}`} stroke={PAPER} strokeWidth={9} strokeDasharray="10 7" />
      {/* the gates: a pennant on the back verge where each stretch begins */}
      {c.starts.map((s, k) => <Pennant key={`g${k}`} x={s * SEG} y={surfaceY(c, s) + ROAD_TOP} seed={k} />)}
      <FinishLine c={c} />
    </g>
  );
});

/** A small pennant on a stick (where a stretch begins). */
function Pennant({ x, y, seed }: { x: number; y: number; seed: number }) {
  return (
    <g transform={`translate(${x} ${y})`} filter="url(#rough)" strokeLinecap="round" strokeLinejoin="round">
      <path d="M0,0 L0,-46" stroke={INK} strokeWidth={2.6} />
      <path d={wobblyPoly([[1, -46], [24, -39], [1, -31]], { wob: 0.6, bow: 0.6, seed: seed + 5 })} fill={seed % 2 ? '#e7a3a0' : '#a9c3de'} stroke={INK} strokeWidth={2.2} />
    </g>
  );
}

/** The finish: a checkered band across the road and an arch with a banner, the seed that waits for the winner in its middle. */
function FinishLine({ c }: { c: Course }) {
  const x = c.finish * SEG;
  const y = surfaceY(c, c.finish);
  const checks: ReactNode[] = [];
  for (let r = 0; r < 7; r++) {
    for (let k = 0; k < 2; k++) {
      if ((r + k) % 2) continue;
      const yy = y + ROAD_TOP + 2 + r * 12;
      checks.push(<rect key={`${r}-${k}`} x={x - 12 + k * 12 - r * 1.2} y={yy} width={12} height={12} fill={INK} />);
    }
  }
  return (
    <g className="rc-finish" strokeLinecap="round" strokeLinejoin="round">
      <rect x={x - 12} y={y + ROAD_TOP + 2} width={24} height={ROAD_BOTTOM - ROAD_TOP - 4} fill={PAPER} opacity={0.95} />
      {checks}
      <g filter="url(#rough)">
        <path d={`M${x - 6},${y + ROAD_TOP} L${x - 6},${y - 170}`} stroke={INK} strokeWidth={5} />
        <path d={`M${x + 18},${y + ROAD_BOTTOM + 8} L${x + 18},${y - 150}`} stroke={INK} strokeWidth={5} />
        <path d={wobblyPoly([[x - 32, y - 184], [x + 44, y - 172], [x + 42, y - 140], [x - 34, y - 152]], { wob: 0.8, bow: 1.2, seed: 3 })} fill={PAPER} stroke={INK} strokeWidth={2.8} />
        {[0, 1, 2, 3, 4, 5].flatMap((i) => [0, 1].map((r) => ((i + r) % 2 ? null : (
          <rect key={`${i}-${r}`} x={x - 28 + i * 12} y={y - 180 + i * 1.9 + r * 13} width={12} height={13} fill={INK} />
        ))))}
        <path d={`M${x + 5},${y - 146} L${x + 5},${y - 128}`} stroke={INK} strokeWidth={2} />
        <g transform={`translate(${x + 5} ${y - 108})`}><SeedMark s={1.05} /></g>
      </g>
    </g>
  );
}

/** The seed with two leaves (the prize: a seed for the session's garden). */
export function SeedMark({ s = 1 }: { s?: number }) {
  return (
    <g transform={`scale(${s})`} strokeLinecap="round" strokeLinejoin="round">
      <path d="M0,4 C-2,-4 2,-9 0,-15" fill="none" stroke={INK} strokeWidth={2.4} />
      <path d="M0,-12 Q-10,-24 -14,-20 Q-9,-10 0,-12 Z" fill={GREEN} stroke={INK} strokeWidth={2} />
      <path d="M0,-14 Q10,-26 13,-23 Q9,-12 0,-14 Z" fill={GREEN} stroke={INK} strokeWidth={2} />
      <path d={blob(0, 8, 11, 9.5, { wob: 0.05, n: 9, seed: 4 })} fill={GOLD} stroke={INK} strokeWidth={2.6} />
    </g>
  );
}

/** The scenery behind the road (parallax): soft hills and round trees, seeded along the course. */
export const Backdrop = memo(function Backdrop({ width }: { width: number }) {
  const hills: ReactNode[] = [];
  const trees: ReactNode[] = [];
  for (let i = 0; i * 420 < width; i++) {
    hills.push(<path key={`h${i}`} d={blob(i * 420 + 160, 210, 300, 110, { seed: i + 2, n: 12, wob: 0.06 })} fill={i % 2 ? '#d6deb2' : '#cdd7a5'} />);
  }
  for (let i = 0; i * 230 < width; i++) {
    const x = i * 230 + ((i * 97) % 90);
    const y = 168 + ((i * 31) % 26);
    const s = 0.8 + ((i * 13) % 5) / 10;
    trees.push(
      <g key={`t${i}`} transform={`translate(${x} ${y}) scale(${s})`}>
        <path d="M-4,0 L-3,-40 L4,-40 L5,0 Z" fill={WOOD} stroke={INK} strokeWidth={2.4} />
        <path d={blob(0, -62, 34, 30, { seed: i + 9, n: 11, wob: 0.09 })} fill={i % 3 ? GREEN : '#b5c47e'} stroke={INK} strokeWidth={2.6} />
        <path d={blob(10, -54, 16, 12, { seed: i + 4, n: 8, wob: 0.1 })} fill={GREEN_DARK} opacity={0.55} />
      </g>,
    );
  }
  return (
    <g className="rc-backdrop" filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
      {hills}
      {trees}
    </g>
  );
});

/** A few clouds (they barely move). */
export const Clouds = memo(function Clouds({ width }: { width: number }) {
  return (
    <g className="rc-clouds" filter="url(#rough)">
      {Array.from({ length: Math.ceil(width / 520) + 1 }, (_, i) => (
        <path key={i} d={blob(i * 520 + 140 + ((i * 71) % 120), 62 + ((i * 37) % 30), 52, 17, { seed: i + 21, n: 10, wob: 0.12 })} fill={PAPER} stroke={INK} strokeWidth={2} opacity={0.8} />
      ))}
    </g>
  );
});

// ------------------------------------------------------------------ the karts

/** A driver: the child's own character, dressed (a portrait in a nested svg), sitting with its feet at (0, 0). */
export function MeDriver({ w = 78 }: { w?: number }) {
  const player = usePlayer();
  const ref = useRef<SVGSVGElement>(null);
  const key = `${player.def.id}:${JSON.stringify(player.outfit)}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (ref.current) drawPortrait(player.def, ref.current, { x: 0.45, y: 0.05 }, 'grin', player.outfit); }, [key]);
  return <svg ref={ref} x={-w / 2} y={-w * (100 / 104)} width={w} height={w} viewBox="-52 -100 104 104" overflow="visible" aria-hidden="true" data-player={player.def.id} />;
}

/** Each critter, sized and placed so it sits in the kart with its head over the tub (they differ in size). */
const SEAT: Record<CritterId, { s: number; dx: number; dy: number }> = {
  zorro: { s: 0.7, dx: 2, dy: 0 },
  coati: { s: 0.72, dx: -2, dy: -14 },
  rana: { s: 0.86, dx: 2, dy: -18 },
  carpincho: { s: 0.66, dx: -6, dy: -16 },
  lechuza: { s: 0.7, dx: 0, dy: -4 },
  carpintero: { s: 0.62, dx: 2, dy: -14 },
};

export function CritterDriver({ id }: { id: CritterId }) {
  const p = SEAT[id];
  return <g transform={`translate(${p.dx} ${p.dy}) scale(${p.s})`}><CritterArt id={id} bare /></g>;
}

/**
 * A soap-box kart, its wheels touching the road at (0, 0), facing right.
 * `driver` sits between the backrest and the tub. Wheels carry
 * `data-wheel` (the race turns them).
 */
export function Kart({ tone, driver, seed = 1 }: { tone: KartTone; driver: ReactNode; seed?: number }) {
  const k = KART[tone];
  const back = wobblyPoly([[-54, -14], [-46, -58], [-34, -58], [-30, -14]], { wob: 0.6, bow: 0.8, seed: seed + 1 });
  const tub = wobblyPoly([[-56, -12], [-50, -34], [26, -34], [56, -22], [54, -10]], { wob: 0.7, bow: 1.2, seed: seed + 2 });
  const facet = wobblyPoly([[-56, -12], [-54, -20], [55, -18], [54, -10]], { wob: 0.4, bow: 0.6, seed: seed + 3 });
  return (
    <g className={`rc-kart-body tone-${tone}`} strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx={0} cy={2} rx={60} ry={7} fill="url(#hatch)" opacity={0.75} />
      <g filter="url(#rough)">
        <path d={back} fill={k.dark} stroke={INK} strokeWidth={2.6} />
      </g>
      <g className="rc-driver" transform="translate(-8 -22)">{driver}</g>
      <g filter="url(#rough)">
        {/* the steering wheel on its stick */}
        <path d="M14,-34 L20,-46" stroke={INK} strokeWidth={2.6} />
        <ellipse cx={21} cy={-48} rx={4} ry={8} transform="rotate(-24 21 -48)" fill={PAPER} stroke={INK} strokeWidth={2.4} />
        <path d={tub} fill={k.fill} stroke={INK} strokeWidth={2.8} />
        <path d={facet} fill={k.dark} opacity={0.75} />
        <path d={tub} fill="none" stroke={INK} strokeWidth={2.8} />
        {/* a round sticker on the side: the kart's own mark */}
        <circle cx={-12} cy={-22} r={7} fill={PAPER} stroke={INK} strokeWidth={2} />
        <path d={leaf(-15, -19, -9, -25, 3.2)} fill={GREEN} stroke={INK} strokeWidth={1.2} />
      </g>
      <Wheel x={-34} r={14} seed={seed + 4} />
      <Wheel x={36} r={12} seed={seed + 5} />
    </g>
  );
}

function Wheel({ x, r, seed }: { x: number; r: number; seed: number }) {
  return (
    <g transform={`translate(${x} ${-r})`}>
      <g data-wheel="" filter="url(#rough)">
        <path d={blob(0, 0, r, r, { seed, n: 10, wob: 0.03 })} fill="#4a4440" stroke={INK} strokeWidth={2.6} />
        <circle r={r * 0.55} fill="#e6dccb" stroke={INK} strokeWidth={1.8} />
        <path d={`M${-r * 0.55},0 L${r * 0.55},0 M0,${-r * 0.55} L0,${r * 0.55}`} stroke={INK} strokeWidth={1.8} />
        <circle r={2.4} fill={INK} />
      </g>
    </g>
  );
}

/** Dust kicked up behind the wheels (a right block's nudge). */
export function Dust() {
  return (
    <g className="rc-dust" stroke={INK} strokeWidth={1.6}>
      {[[-62, -10, 9], [-76, -18, 7], [-70, -4, 6]].map(([x, y, r], i) => (
        <path key={i} d={blob(x, y, r, r * 0.8, { seed: i + 30, n: 8 })} fill={DIRT} style={{ animationDelay: `${i * 40}ms` }} />
      ))}
    </g>
  );
}

/** The turbo: flames out of the back of the kart, and speed lines. */
export function Flames() {
  return (
    <g className="rc-flames" strokeLinejoin="round" strokeLinecap="round">
      <g className="rc-flame" filter="url(#rough)">
        <path d="M-56,-30 C-74,-36 -92,-30 -112,-22 C-92,-18 -80,-12 -60,-14 Z" fill="#de8a56" stroke={INK} strokeWidth={2.4} />
        <path d="M-58,-26 C-70,-28 -82,-25 -94,-22 C-82,-19 -72,-17 -60,-18 Z" fill={GOLD} />
      </g>
      <g stroke={INK} strokeWidth={2.4} opacity={0.55} strokeDasharray="10 9">
        <path d="M-80,-48 L-150,-48" />
        <path d="M-96,-6 L-170,-6" />
        <path d="M-110,-30 L-190,-30" />
      </g>
    </g>
  );
}

/** A bush that pops up in front of the kart on a wrong block; it shakes, leaves fly. */
export function BumpBush() {
  return (
    <g className="rc-bush" strokeLinejoin="round" strokeLinecap="round">
      <g className="rc-bush-shake" filter="url(#rough)">
        <path d={blob(0, -26, 30, 26, { seed: 41, n: 11, wob: 0.12 })} fill={GREEN} stroke={INK} strokeWidth={2.8} />
        <path d={blob(9, -20, 15, 11, { seed: 42, n: 8, wob: 0.12 })} fill={GREEN_DARK} opacity={0.6} />
        <path d={blob(-10, -34, 7, 6, { seed: 43, n: 7 })} fill="#e7a3a0" stroke={INK} strokeWidth={1.6} />
        <path d={blob(12, -40, 6, 5, { seed: 44, n: 7 })} fill="#e7a3a0" stroke={INK} strokeWidth={1.6} />
      </g>
      {[[-40, -70, -50], [-10, -88, 30], [30, -76, 80], [46, -46, 140], [-46, -30, -120], [10, -60, 200]].map(([dx, dy, r], i) => (
        <path
          key={i} className="rc-leaf" d={leaf(0, 0, 14, -2, 5)} fill={i % 2 ? GREEN : '#b5c47e'} stroke={INK} strokeWidth={1.4}
          style={{ '--dx': `${dx}px`, '--dy': `${dy}px`, '--r': `${r}deg`, animationDelay: `${i * 25}ms` } as CSSProperties}
          transform="translate(0 -30)"
        />
      ))}
    </g>
  );
}

// ------------------------------------------------------------------ the stretch's mini map (the panel)

export const CELL = 120;
const MINI_STEP = 22;
const MINI_BAND = 26;

/**
 * The stretch ahead as a short road, one piece a cell: flat, a ramp up, a
 * ramp down (turbo pieces with chevrons). A piece already covered by the
 * tape takes its arrow's colour; the next one is circled in blue pen.
 * `h0`: the height the stretch starts at.
 */
export function MiniRoad({ road, turbo, h0, covered, next, colors }: {
  road: readonly RoadDir[]; turbo: boolean; h0: number; covered: number; next: number | null; colors: Record<RoadDir, string>;
}) {
  const hs = [h0];
  for (const d of road) hs.push(hs[hs.length - 1] + (d === 'up' ? 1 : d === 'down' ? -1 : 0));
  const lo = Math.min(...hs), hi = Math.max(...hs);
  const H = 30 + (hi - lo) * MINI_STEP + MINI_BAND + 14;
  const y = (h: number) => H - 14 - MINI_BAND / 2 - (h - lo) * MINI_STEP;
  const w = road.length * CELL;
  return (
    <svg className="rc-mini" width={w + 24} height={H} viewBox={`-12 0 ${w + 24} ${H}`} aria-hidden="true" data-pieces={road.length}>
      <g strokeLinejoin="round" strokeLinecap="round">
        {road.map((d, i) => {
          const x0 = i * CELL, x1 = (i + 1) * CELL;
          const a = y(hs[i]), b = y(hs[i + 1]);
          const piece = `M${x0},${a - MINI_BAND / 2} L${x1},${b - MINI_BAND / 2} L${x1},${b + MINI_BAND / 2} L${x0},${a + MINI_BAND / 2} Z`;
          const done = i < covered;
          return (
            <g key={i} className={`rc-piece${done ? ' is-covered' : ''}${i === next ? ' is-next' : ''}`} data-piece={i} data-dir={d} data-guide={i === next ? 'target' : undefined}>
              <g filter="url(#rough)">
                <path d={piece} fill={done ? colors[d] : DIRT} stroke={INK} strokeWidth={2.4} />
                <path d={`M${x0},${a + MINI_BAND / 2 + 2} L${x1},${b + MINI_BAND / 2 + 2} L${x1},${H - 4} L${x0},${H - 4} Z`} fill={GRASS} opacity={0.9} />
                <path d={`M${x0},${a + MINI_BAND / 2} L${x1},${b + MINI_BAND / 2}`} stroke={INK} strokeWidth={2.4} />
              </g>
              {turbo && <path d={`M${x0 + CELL / 2 - 12},${(a + b) / 2 - 7} L${x0 + CELL / 2 - 4},${(a + b) / 2} L${x0 + CELL / 2 - 12},${(a + b) / 2 + 7} M${x0 + CELL / 2 + 2},${(a + b) / 2 - 7} L${x0 + CELL / 2 + 10},${(a + b) / 2} L${x0 + CELL / 2 + 2},${(a + b) / 2 + 7}`} fill="none" stroke={GOLD_DARK} strokeWidth={3.4} />}
              {i === next && <path className="rc-piece-ring" d={penLoop((x0 + x1) / 2, (a + b) / 2, CELL / 2 - 4, Math.abs(a - b) / 2 + 20, { seed: i + 3 })} fill="none" stroke={PEN} strokeWidth={3} />}
            </g>
          );
        })}
        {/* where the stretch begins (a dot) and ends (a pennant) */}
        <circle cx={0} cy={y(hs[0])} r={5} fill={PEN} />
        <g transform={`translate(${w} ${y(hs[hs.length - 1]) - MINI_BAND / 2})`} filter="url(#rough)">
          <path d="M0,0 L0,-30" stroke={INK} strokeWidth={2.4} />
          <path d="M1,-30 L18,-25 L1,-20 Z" fill="#a9c3de" stroke={INK} strokeWidth={2} />
        </g>
      </g>
    </svg>
  );
}

/** The blue-pen bracket under the pieces a repeat covers ("these, all at once"). */
export function RepeatBracket({ n }: { n: number }) {
  const w = n * CELL - 16;
  return (
    <svg className="rc-bracket" width={w} height={18} viewBox={`0 0 ${w} 18`} aria-hidden="true">
      <path d={`M3,3 Q3,13 14,13 L${w / 2 - 8},13 Q${w / 2},13 ${w / 2},17 Q${w / 2},13 ${w / 2 + 8},13 L${w - 14},13 Q${w - 3},13 ${w - 3},3`} fill="none" stroke={PEN} strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

// ------------------------------------------------------------------ cups, podium, shelf

/** A cup: gold with a flat darker facet, two handles, a base; a leaf stamped on it. */
export function Cup({ seed = 1 }: { seed?: number }) {
  const bowl = wobblyPoly([[-22, -64], [22, -64], [18, -38], [8, -28], [-8, -28], [-18, -38]], { wob: 0.6, bow: 1.6, seed });
  return (
    <g className="rc-cup" strokeLinejoin="round" strokeLinecap="round" filter="url(#rough)">
      <path d="M-20,-58 C-36,-58 -34,-38 -16,-40" fill="none" stroke={INK} strokeWidth={6} />
      <path d="M-20,-58 C-36,-58 -34,-38 -16,-40" fill="none" stroke={GOLD} strokeWidth={3} />
      <path d="M20,-58 C36,-58 34,-38 16,-40" fill="none" stroke={INK} strokeWidth={6} />
      <path d="M20,-58 C36,-58 34,-38 16,-40" fill="none" stroke={GOLD} strokeWidth={3} />
      <path d="M-4,-28 L-5,-12 L5,-12 L4,-28 Z" fill={GOLD_DARK} stroke={INK} strokeWidth={2.2} />
      <path d={wobblyPoly([[-16, -12], [16, -12], [18, 0], [-18, 0]], { wob: 0.5, bow: 0.6, seed: seed + 1 })} fill={WOOD} stroke={INK} strokeWidth={2.4} />
      <path d={bowl} fill={GOLD} stroke={INK} strokeWidth={2.6} />
      <path d={wobblyPoly([[6, -63], [21, -63], [17, -39], [8, -30], [4, -31]], { wob: 0.4, bow: 0.6, seed: seed + 2 })} fill={GOLD_DARK} opacity={0.7} />
      <path d={bowl} fill="none" stroke={INK} strokeWidth={2.6} />
      <path d={leaf(-6, -42, 4, -54, 5)} fill={GREEN} stroke={INK} strokeWidth={1.4} />
      <path d="M-14,-58 L-12,-46" stroke={PAPER} strokeWidth={2.6} opacity={0.9} />
    </g>
  );
}

/** The cups won this session, standing on a wooden shelf (two rows when there are many). */
export function Shelf({ cups, fresh }: { cups: number; fresh: boolean }) {
  const perRow = 4;
  const rows = Math.max(1, Math.ceil(cups / perRow));
  const plank = (y: number, i: number) => (
    <g key={`p${i}`} filter="url(#rough)">
      <path d={wobblyPoly([[0, y], [250, y - 2], [252, y + 12], [2, y + 14]], { wob: 0.5, bow: 0.8, seed: i + 60 })} fill={WOOD} stroke={INK} strokeWidth={2.6} />
      <path d={`M36,${y + 13} L44,${y + 34} L54,${y + 13} M196,${y + 13} L204,${y + 34} L214,${y + 13}`} fill={WOOD_DARK} stroke={INK} strokeWidth={2.2} />
    </g>
  );
  const items: ReactNode[] = [];
  for (let i = 0; i < cups; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const last = i === cups - 1;
    items.push(
      <g key={i} transform={`translate(${34 + col * 61} ${100 + row * 96}) scale(0.82)`} className={last && fresh ? 'rc-cup-fresh' : undefined} data-cup={i + 1}>
        <Cup seed={i + 7} />
      </g>,
    );
  }
  return (
    <svg className="rc-shelf" viewBox={`-4 0 262 ${40 + rows * 96 + 20}`} aria-hidden="true" data-cups={cups}>
      {Array.from({ length: rows }, (_, i) => plank(100 + i * 96, i))}
      {items}
    </svg>
  );
}

/** The three steps of the podium (1 in the middle, tallest), seen from the front, with their digits. */
export function PodiumSteps() {
  const step = (x: number, w: number, top: number, n: number, fill: string, seed: number) => (
    <g key={n}>
      <path d={wobblyPoly([[x, top], [x + w, top], [x + w, 300], [x, 300]], { wob: 0.6, bow: 1, seed })} transform="translate(6 7)" fill={SHADOW} />
      <path d={wobblyPoly([[x, top], [x + w, top], [x + w, 300], [x, 300]], { wob: 0.6, bow: 1, seed })} fill={fill} stroke={INK} strokeWidth={3} />
      <path d={wobblyPoly([[x + w - 16, top + 2], [x + w - 2, top + 2], [x + w - 2, 298], [x + w - 16, 298]], { wob: 0.3, bow: 0.4, seed: seed + 1 })} fill="rgba(84, 62, 38, 0.18)" />
      <text x={x + w / 2 - 6} y={top + 60} textAnchor="middle" className="rc-podium-n">{n}</text>
    </g>
  );
  return (
    <g className="rc-podium-steps" filter="url(#rough)" strokeLinejoin="round">
      {step(150, 170, 200, 2, '#a9c3de', 71)}
      {step(320, 180, 140, 1, GOLD, 72)}
      {step(500, 170, 230, 3, '#e7a3a0', 73)}
    </g>
  );
}

// ------------------------------------------------------------------ small drawings

/** A cup, small (the bar's row of cups won). */
export function CupIcon({ size = 30 }: { size?: number }) {
  return <svg viewBox="-36 -70 72 74" width={size} height={size} aria-hidden="true"><Cup seed={3} /></svg>;
}

/** A checkered flag (the bar's drawn instruction: "to the finish"). */
export function FlagIcon({ size = 44 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <g filter="url(#rough)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10,44 L10,6" stroke={INK} strokeWidth={3} />
        <path d="M11,7 C20,3 28,11 40,7 L40,27 C28,31 20,23 11,27 Z" fill={PAPER} stroke={INK} strokeWidth={2.6} />
        <path d="M11,7 L18,6 L18,16 L11,17 Z M25,8 L32,9 L32,19 L25,18 Z M18,16 L25,17 L25,27 L18,25 Z M32,19 L40,17 L40,27 L32,29 Z" fill={INK} />
      </g>
    </svg>
  );
}

/** "¡Otra carrera!": a little kart with a blue-pen arrow curling back to the start. */
export function AgainArt() {
  return (
    <svg viewBox="-70 -86 150 100" className="rc-again-art" aria-hidden="true">
      <g transform="scale(0.85)">
        <Kart tone="me" seed={9} driver={<MeDriver w={58} />} />
      </g>
      <g fill="none" stroke={PEN} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" filter="url(#rough)">
        <path d="M40,-30 C70,-60 30,-96 -6,-80 C-30,-70 -40,-54 -40,-46" />
        <path d="M-50,-58 L-40,-44 L-28,-56" />
      </g>
    </svg>
  );
}

/** The menu's card for the race: a page with the road, the child's kart racing a critter's, the finish flag; a cup beside it. */
export function RaceCardArt() {
  const road = 'M6,104 L60,104 L96,84 L148,84';
  return (
    <svg className="pp-fp-art" viewBox="0 0 260 190" aria-hidden="true">
      <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
        <g transform="translate(12 22) rotate(-2 80 66)">
          <path d={wobblyPoly([[0, 0], [168, 0], [168, 140], [0, 140]], { wob: 0.7, bow: 1.1, seed: 33 })} transform="translate(5 6)" fill={SHADOW} />
          <path d={wobblyPoly([[0, 0], [168, 0], [168, 140], [0, 140]], { wob: 0.7, bow: 1.1, seed: 33 })} fill={PAPER} stroke={INK} strokeWidth={2.6} />
          <path d={`${road} L148,140 L6,140 Z`} fill="#d3dbab" />
          <path d={road} fill="none" stroke={DIRT} strokeWidth={26} />
          <path d={road} fill="none" stroke={INK} strokeWidth={2} transform="translate(0 13)" />
          <path d={road} fill="none" stroke={INK} strokeWidth={2} transform="translate(0 -13)" />
          <rect x={60} y={-9} width={48} height={16} rx={2} fill="rgba(222, 204, 158, 0.85)" transform="rotate(-6 84 -1)" />
        </g>
      </g>
      <g transform="translate(70 120) scale(0.42)"><Kart tone="r0" seed={4} driver={<CritterDriver id="zorro" />} /></g>
      <g transform="translate(112 112) scale(0.5)"><Kart tone="me" seed={5} driver={<MeDriver w={64} />} /></g>
      <g transform="translate(158 110) scale(0.9)"><FlagGlyph /></g>
      <g transform="translate(216 150) scale(1.15)"><Cup seed={5} /></g>
    </svg>
  );
}

function FlagGlyph() {
  return (
    <g filter="url(#rough)" strokeLinecap="round" strokeLinejoin="round">
      <path d="M0,0 L0,-60" stroke={INK} strokeWidth={3} />
      <path d="M1,-60 C12,-65 22,-55 36,-60 L36,-36 C22,-31 12,-41 1,-36 Z" fill={PAPER} stroke={INK} strokeWidth={2.6} />
      <path d="M1,-60 L9,-62 L9,-49 L1,-48 Z M17,-58 L26,-57 L26,-45 L17,-46 Z M9,-49 L17,-46 L17,-35 L9,-38 Z M26,-45 L36,-48 L36,-36 L26,-34 Z" fill={INK} />
    </g>
  );
}
