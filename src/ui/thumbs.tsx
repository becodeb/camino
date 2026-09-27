// Small drawings of boards: the home's page cards, the boss page of a sheet.
// A board drawn at 40 units a cell: grid, start mark, stone, rocks, seeds,
// the goal; in the fog only what Brote sees.

import { memo } from 'react';
import { blob, leaf, rng, wobblyLine, wobblyPoly } from '../ink/ink.js';
import type { LevelDef } from '../game/levels';
import { visibleFrom, type Board } from '../game/model';

const INK = '#2b2622';

/** A small drawing of a level: its board, or its worlds stacked (2do page 2). */
export function LevelThumb({ level }: { level: LevelDef }) {
  if (level.worlds.length === 1) return <BoardThumb b={level.worlds[0]} fog={level.fog} rain={!!level.realtime?.spawner} keys={level.mode === 'realtime'} />;
  return (
    <span className="thumb-stack">
      {level.worlds.map((b, i) => <BoardThumb key={i} b={b} />)}
    </span>
  );
}

/**
 * A small drawing of a board: grid, start mark, rocks, seeds, the goal; in the
 * fog only what Brote sees. Inside another SVG it takes a `place`.
 */
export const BoardThumb = memo(function BoardThumb({ b, fog, rain, keys, place }: { b: Board; fog?: boolean; rain?: boolean; keys?: boolean; place?: { x: number; y: number; width: number; height: number } }) {
  const S = 40, w = b.cols * S, h = b.rows * S;
  const stone = b.obstacles.filter((o) => o.kind === 'earth');
  // the river: water cells and stepping stones on a sandy bank
  const water = [...b.obstacles.filter((o) => o.kind === 'water'), ...(b.ford ?? [])];
  const R = rng(b.seed);
  const cx = (c: number) => c * S + S / 2, cy = (r: number) => r * S + S / 2;
  const seen = fog ? visibleFrom(b, b.start) : [];
  const fogged: [number, number][] = [];
  if (fog) for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) if (!seen.some((x) => x.c === c && x.r === r)) fogged.push([c, r]);
  return (
    <svg className="thumb" viewBox={`-6 -6 ${w + 12} ${h + 12}`} aria-hidden="true" {...place}>
      <defs><clipPath id={`thumb-clip-${b.seed}`}><rect x={0} y={0} width={w} height={h} /></clipPath></defs>
      <g filter="url(#rough)">
        <rect x={0} y={0} width={w} height={h} fill={b.look === 'river' ? '#f3e8cf' : '#f6efdf'} />
        {stone.map((o, i) => <rect key={`s${i}`} x={o.c * S - 0.5} y={o.r * S - 0.5} width={S + 1} height={S + 1} fill="#d6c9b0" />)}
        {water.map((o, i) => <rect key={`w${i}`} x={o.c * S - 0.5} y={o.r * S - 0.5} width={S + 1} height={S + 1} fill="#9dbbd8" />)}
        {(b.ford ?? []).map((o, i) => <path key={`f${i}`} d={blob(cx(o.c), cy(o.r) + 5, 15, 10, { wob: 0.07, n: 9, seed: b.seed + i })} fill="#ddd4c3" stroke={INK} strokeWidth={1.8} />)}
        {Array.from({ length: b.cols - 1 }, (_, i) => (
          <path key={`c${i}`} d={wobblyLine((i + 1) * S, 2, (i + 1) * S + (R() - 0.5) * 2, h - 2, { bow: 1, seed: i + b.seed })} stroke={INK} strokeOpacity={0.35} strokeWidth={1.4} fill="none" />
        ))}
        {Array.from({ length: b.rows - 1 }, (_, i) => (
          <path key={`r${i}`} d={wobblyLine(2, (i + 1) * S, w - 2, (i + 1) * S + (R() - 0.5) * 2, { bow: 1, seed: i + 9 + b.seed })} stroke={INK} strokeOpacity={0.35} strokeWidth={1.4} fill="none" />
        ))}
        <path d={wobblyPoly([[0, 0], [w, 0], [w, h], [0, h]], { wob: 0.8, bow: 1.2, seed: b.seed })} fill="none" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
        <ellipse cx={cx(b.start.c)} cy={cy(b.start.r) + 13} rx={14} ry={4.5} fill="none" stroke="#3d6ea5" strokeWidth={2} strokeDasharray="1.5 4.5" strokeLinecap="round" />
        <ThumbBrote x={cx(b.start.c)} y={cy(b.start.r)} />
        {stone.map((o, i) => (o.r > 0 && !stone.some((x) => x.c === o.c && x.r === o.r - 1)
          ? <path key={`t${i}`} d={wobblyLine(o.c * S, o.r * S, o.c * S + S, o.r * S, { bow: 0.6, seed: o.seed })} stroke={INK} strokeWidth={2.2} fill="none" />
          : null))}
        {stone.map((o, i) => (o.c > 0 && !stone.some((x) => x.c === o.c - 1 && x.r === o.r)
          ? <path key={`v${i}`} d={wobblyLine(o.c * S, o.r * S, o.c * S, o.r * S + S, { bow: 0.6, seed: o.seed + 1 })} stroke={INK} strokeWidth={2.2} fill="none" />
          : null))}
        {b.obstacles.filter((o) => o.kind !== 'earth' && o.kind !== 'water').map((o, i) => (
          <path key={i} d={blob(cx(o.c), cy(o.r) + 4, 13, 9, { wob: 0.09, n: 8, seed: o.seed })} fill="#bdb09c" stroke={INK} strokeWidth={2} />
        ))}
        {rain && [[1, 0.2], [3, 1.3], [4, 0.6]].map(([c, r], i) => (
          <g key={`rain${i}`}>
            <path d={`M${cx(c)},${cy(r) - 30} L${cx(c)},${cy(r) - 12}`} stroke="#3d6ea5" strokeWidth={2} strokeDasharray="0.1 5" strokeLinecap="round" />
            <ThumbSeed x={cx(c)} y={cy(r)} />
          </g>
        ))}
        {keys && (
          <g transform={`translate(${w - 34} ${h - 10})`} stroke={INK} strokeLinejoin="round">
            <rect x={-4} y={-30} width={16} height={14} rx={3} fill="#fbf7ee" strokeWidth={1.6} />
            {[-22, -4, 14].map((x) => <rect key={x} x={x} y={-13} width={16} height={14} rx={3} fill="#fbf7ee" strokeWidth={1.6} />)}
          </g>
        )}
        {b.pickups.map((p, i) => <ThumbSeed key={i} x={cx(p.c)} y={cy(p.r)} />)}
        {b.goalKind === 'none' ? null : b.goalKind === 'pot' ? (
          <g>
            <path d={wobblyPoly([[cx(b.goal.c) - 10, cy(b.goal.r) - 2], [cx(b.goal.c) + 10, cy(b.goal.r) - 2], [cx(b.goal.c) + 7, cy(b.goal.r) + 13], [cx(b.goal.c) - 7, cy(b.goal.r) + 13]], { wob: 0.3, bow: 0.4, seed: 2 })} fill="#d98a5f" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
            <rect x={cx(b.goal.c) - 12} y={cy(b.goal.r) - 7} width={24} height={6} rx={2} fill="#de8a56" stroke={INK} strokeWidth={2} />
          </g>
        ) : <ThumbSeed x={cx(b.goal.c)} y={cy(b.goal.r)} big />}
        {fog && (
          <g clipPath={`url(#thumb-clip-${b.seed})`}>
            {fogged.map(([c, r]) => {
              const d = blob(cx(c), cy(r), S * 0.7, S * 0.68, { wob: 0.1, n: 9, seed: b.seed + c * 7 + r * 13 });
              return <g key={`${c},${r}`}><path d={d} fill="#e3dac6" /><path d={d} fill="url(#fog-hatch)" /></g>;
            })}
          </g>
        )}
      </g>
    </svg>
  );
});

/** Brote, tiny: an orange seed with its sprout, on the start cell. */
function ThumbBrote({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} stroke={INK} strokeLinejoin="round" strokeLinecap="round">
      <path d="M0,-6 C-1,-11 1,-13 0,-16" fill="none" strokeWidth={1.6} />
      <path d={leaf(0, -15, -7, -19, 3)} fill="#a4b86d" strokeWidth={1.3} />
      <path d={leaf(0, -15, 7, -19, 3)} fill="#a4b86d" strokeWidth={1.3} />
      <path d={blob(0, 2, 9, 11, { seed: 6, n: 9 })} fill="#de8a56" strokeWidth={2} />
      <circle cx={-3} cy={0} r={1.3} fill={INK} stroke="none" />
      <circle cx={3} cy={0} r={1.3} fill={INK} stroke="none" />
    </g>
  );
}

function ThumbSeed({ x, y, big }: { x: number; y: number; big?: boolean }) {
  const k = big ? 1.25 : 0.95;
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`} stroke={INK} strokeLinejoin="round" strokeLinecap="round">
      <path d={leaf(0, -5, -9, -11, 3.6)} fill="#a4b86d" strokeWidth={1.6} />
      <path d={leaf(0, -6, 8, -12, 3.6)} fill="#a4b86d" strokeWidth={1.6} />
      <path d={blob(0, 3, 7.5, 6.5, { seed: 4, n: 8 })} fill="#f0d27a" strokeWidth={2} />
    </g>
  );
}
