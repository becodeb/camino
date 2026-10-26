// The Copa's road pieces (C03, trimmed in C10): one kart placed and tilted on a
// course, and a puddle or a log drawn on the road. Both are used by the Copa v2
// garage scene (copa2/Scene.tsx); the rest of C03's live-race view went with the
// single-slot circuits when Copa v2 replaced them.

import type { ReactNode } from 'react';
import { slopeAt, type Course } from './race';
import { LANES, SEG, STEP, surfaceY } from './raceArt';
import { Kart } from './raceArt';

const angleAt = (c: Course, u: number) => (-Math.atan2(slopeAt(c, u) * STEP, SEG) * 180) / Math.PI;

/** One kart, positioned and tilted on the course; `extra` overlays flames/driver-side effects. */
export function TrackKart({ course, u, lane, tone, seed, driver, extra }: {
  course: Course; u: number; lane: keyof typeof LANES; tone: 'me' | 'r0' | 'r1'; seed: number; driver: ReactNode; extra?: ReactNode;
}) {
  const L = LANES[lane];
  const x = u * SEG, y = surfaceY(course, u) + L.dy;
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angleAt(course, u).toFixed(1)}) scale(${L.s})`} className={`rc-kart rc-${tone}`}>
      <g className="rc-kart-in">{extra}<Kart tone={tone} seed={seed} driver={driver} /></g>
    </g>
  );
}

/** A puddle or a log drawn right on the road, at course unit `u`. */
export function HazardMark({ course, u, kind }: { course: Course; u: number; kind: 'puddle' | 'log' }) {
  const x = u * SEG + SEG / 2, y = surfaceY(course, u + 0.5);
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true">
      {kind === 'puddle' ? (
        <ellipse cx={0} cy={6} rx={42} ry={15} fill="#5fa8d3" stroke="#2b2622" strokeWidth={3} />
      ) : (
        <g>
          <rect x={-38} y={-6} width={76} height={24} rx={12} fill="#8a5a33" stroke="#2b2622" strokeWidth={3} />
          <circle cx={-34} cy={6} r={11} fill="#c69765" stroke="#2b2622" strokeWidth={3} />
          <circle cx={34} cy={6} r={11} fill="#c69765" stroke="#2b2622" strokeWidth={3} />
        </g>
      )}
    </g>
  );
}
