// The Copa's live race view (C03 rework): the same side-scrolling road,
// kart and critters as 1ro's own "La carrera" (race.ts/Race.tsx/raceArt.tsx),
// reused as-is rather than rebuilt, so a circuit never reads as a bare quiz.
// Every circuit drives a real `Course` (race.ts's own `courseOf`) and draws
// it with `TrackRoad`/`Kart`/`CritterDriver`; the two rivals are NOT the
// rubber band — they drive continuously at their fixed honest pace
// (honestRace.ts's `honestPosition`) from the moment a circuit starts,
// independent of the child, so the fox visibly pulls ahead when the child
// is slow and the turbo visibly overtakes it.

import { type ReactNode } from 'react';
import type { CritterId } from '../curriculum/motivation';
import { courseOf, slopeAt, type Course, type RaceDef, type Stretch } from './race';
import { Backdrop, Clouds, CritterDriver, Dust, Flames, Kart, LANES, MeDriver, SEG, STEP, TRACK_H, TrackRoad, surfaceY } from './raceArt';
import { honestPosition, type RivalTier } from './honestRace';

/** A `Course` from plain stretches (tier/seed are unused by `courseOf`, only the geometry matters here). */
export const buildCourse = (stretches: readonly Stretch[]): Course =>
  courseOf({ tier: 1, seed: 1, stretches: stretches as Stretch[] } as RaceDef);

/** The two rivals' live positions, `elapsedMs` into the circuit — never the rubber band. */
export const rivalPositions = (tiers: readonly [RivalTier, RivalTier], elapsedMs: number, finish: number): [number, number] =>
  [honestPosition(tiers[0], elapsedMs, finish), honestPosition(tiers[1], elapsedMs, finish)];

/** The camera's next position: eased toward the child's kart, same formula as Race.tsx's own `draw()`. */
export const nextCam = (cam: number, me: number, viewW: number, dt: number): number => {
  const want = Math.max(-SEG * 0.6, me * SEG - viewW * 0.34);
  return cam ? cam + (want - cam) * Math.min(1, dt * 6) : want;
};

const angleAt = (c: Course, u: number) => (-Math.atan2(slopeAt(c, u) * STEP, SEG) * 180) / Math.PI;

/** One kart, positioned and tilted on the course; `extra` overlays flames/driver-side effects. */
function TrackKart({ course, u, lane, tone, seed, driver, extra }: {
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

export interface SceneDust { id: number; kind: 'dust' | 'bump'; u: number }

/** The live scene: the road, the finish, the two hazards and the three karts, panned by `cam`. */
export function RaceScene({ course, stretches, me, rivals, pair, viewW, cam, turboOn, meJump, meSkid, puddles, logs, fx }: {
  course: Course; stretches: readonly Stretch[]; me: number; rivals: readonly [number, number];
  pair: readonly [CritterId, CritterId]; viewW: number; cam: number; turboOn?: boolean; meJump?: boolean; meSkid?: boolean;
  puddles?: readonly number[]; logs?: readonly number[]; fx?: readonly SceneDust[];
}) {
  const meY = meJump ? -34 : 0;
  return (
    <svg className="rc-scene copa-scene" viewBox={`0 0 ${viewW} ${TRACK_H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="La pista">
      <g transform={`translate(${(-cam * 0.15).toFixed(1)} 0)`}><Clouds width={course.length * SEG + 2000} /></g>
      <g transform={`translate(${(-cam * 0.45).toFixed(1)} 0)`}><Backdrop width={course.length * SEG * 0.6 + 2000} /></g>
      <g transform={`translate(${(-cam).toFixed(1)} 0)`}>
        <TrackRoad c={course} stretches={stretches} />
        {puddles?.map((u) => <HazardMark key={`p${u}`} course={course} u={u} kind="puddle" />)}
        {logs?.map((u) => <HazardMark key={`l${u}`} course={course} u={u} kind="log" />)}
        <TrackKart course={course} u={rivals[1]} lane="r1" tone="r1" seed={3} driver={<CritterDriver id={pair[1]} />} />
        <TrackKart course={course} u={rivals[0]} lane="r0" tone="r0" seed={2} driver={<CritterDriver id={pair[0]} />} />
        {fx?.filter((f) => f.kind === 'dust').map((f) => (
          <g key={f.id} transform={`translate(${f.u * SEG} ${surfaceY(course, f.u) + LANES.me.dy})`}><Dust /></g>
        ))}
        <g transform={`translate(0 ${meY})`} className={meSkid ? 'copa-skid' : undefined}>
          <TrackKart
            course={course} u={me} lane="me" tone="me" seed={1} driver={<MeDriver />}
            extra={turboOn && <Flames />}
          />
        </g>
      </g>
    </svg>
  );
}
