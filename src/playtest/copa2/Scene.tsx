// Copa v2 garage: the track and the karts. The same road, kart and animal art as
// 1ro's "La carrera" (raceArt.tsx, reused as-is), drawn from a Copa v2 `TrackSpec`
// instead of a race stretch. One tile of the track is one road piece (150 world
// units), so tile `i` lies between course units `1 + i` and `2 + i`: a kart that
// has completed `pos` tiles stands in the middle of the last one, `0.5 + pos`.
//
// Two ways to look at it: the PREVIEW (the whole lap, small, with the tiles
// numbered, the karts parked at the line revving) and the RUN (zoomed in, the
// camera following the kart). The Garage tweens between the two.

import { memo, useMemo } from 'react';
import type { CritterId } from '../../curriculum/motivation';
import { courseOf, type Course, type RoadDir, type RaceDef } from '../race';
import { Backdrop, Clouds, CritterDriver, Dust, Flames, MeDriver, SEG, TRACK_H, TrackRoad, surfaceY } from '../raceArt';
import { HazardMark, TrackKart } from '../copaTrack';
import { eligiblePuddleTiles, type TrackDef } from './track';
import type { LogView } from './playback';
import { FALL_MS } from './playback';

const INK = '#2b2622';

/** Course units: where a parked kart waits, and the distance a kart coasts after the finish line. */
export const PARK_U = { me: 0.5, r0: 0, r1: -0.45 } as const;
export const COAST_U = 1.6;

const DIR: Record<string, RoadDir> = { flat: 'right', rise: 'up', drop: 'down' };

/** The course for `laps` laps of the track in ONE stretch (so tile `i` is course unit `1 + i`), with the arch right after the last tile. */
export function courseFor(track: Pick<TrackDef, 'tiles'>, laps: number): { course: Course; road: RoadDir[]; total: number } {
  const lap = track.tiles.map((t) => DIR[t.kind]);
  const road = Array.from({ length: laps }, () => lap).flat();
  const stretch = { road, turbo: false };
  const base = courseOf({ tier: 1, seed: 1, stretches: [stretch] } as RaceDef);
  const total = road.length;
  return { course: { ...base, finish: 1 + total }, road, total };
}

/** The kart's place in course units. */
export const uOfPos = (pos: number): number => PARK_U.me + pos;

/** The leftmost the camera goes: leaves room for the parked rivals behind the line. */
export const CAM_MIN = -SEG * 1.3;

/** The camera that follows the kart (in px), kept inside the road. */
export function camFor(u: number, viewW: number, finishU: number): number {
  const want = Math.max(CAM_MIN, u * SEG - viewW * 0.34);
  const cap = Math.max(CAM_MIN, (finishU + 3) * SEG - viewW);
  return Math.min(want, cap);
}

/** The preview's width: the whole lap, a little of the road before and after. */
export const previewWidth = (finishU: number): number => (finishU + 3.4) * SEG - CAM_MIN;
/** The run's width (zoomed in: about 11 tiles on screen). */
export const RUN_W = 1700;

export interface KartLook {
  u: number;
  lift?: number;
  turbo?: boolean;
  skidding?: boolean;
  sputter?: boolean;
  crashed?: boolean;
  braking?: boolean;
  revving?: boolean;
}

export interface SceneProps {
  course: Course;
  road: readonly RoadDir[];
  /** Tiles in one lap (the numbers under the road restart each lap). */
  lapTiles: number;
  viewW: number;
  cam: number;
  me: KartLook;
  rivals: readonly [KartLook, KartLook];
  pair: readonly [CritterId, CritterId];
  /** Real puddles (absolute tile indices), or the tiles where one MAY be (a track whose puddles move). */
  puddles: { real: readonly number[] } | { maybe: readonly number[] };
  logs: readonly LogView[];
  numbers: boolean;
  /** Bumps when the kart skids again (restarts the spin). */
  spinKey?: number;
  /** Who drives the main kart (default: the child's own character). Ayudá al ciervo: the deer; Espiá: the rival. */
  meDriver?: React.ReactNode;
  /** Only the main kart on the road (Ayudá al ciervo, Espiá). */
  hideRivals?: boolean;
}

/** Where a tile's hazard sits (course unit of its left edge: HazardMark centres itself in the piece). */
const hazardU = (tile: number) => 1 + tile;

function Smoke() {
  return (
    <g className="gx-smoke" aria-hidden="true">
      {[[40, -56, 24, 0], [62, -74, 20, 0.5], [30, -86, 18, 1.0]].map(([x, y, r, d], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#8a847c" stroke={INK} strokeWidth={2.4} style={{ animationDelay: `${d}s` }} />
      ))}
    </g>
  );
}

function Splash() {
  return (
    <g className="gx-splash" aria-hidden="true">
      {[[-50, -50], [-20, -70], [20, -72], [52, -52], [-64, -22], [64, -24]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={7} fill="#5fa8d3" stroke={INK} strokeWidth={1.8} style={{ animationDelay: `${(i % 3) * 0.12}s` }} />
      ))}
    </g>
  );
}

function Puffs() {
  return (
    <g className="gx-puffs" aria-hidden="true">
      {[0, 1, 2].map((i) => <circle key={i} cx={-70 - i * 6} cy={-14 - i * 5} r={6 + i * 2} fill="#cfc7bb" stroke={INK} strokeWidth={1.6} style={{ animationDelay: `${i * 0.18}s` }} />)}
    </g>
  );
}

function Spark() {
  return (
    <g className="gx-spark" aria-hidden="true" fill="none" stroke="#c9574a" strokeWidth={5} strokeLinecap="round">
      <path d="M66,-40 L90,-52 M70,-24 L98,-24 M66,-8 L90,4" />
    </g>
  );
}

/** One kart with all its effects. */
function Kart({ course, look, lane, tone, driver, seed }: {
  course: Course; look: KartLook; lane: 'me' | 'r0' | 'r1'; tone: 'me' | 'r0' | 'r1'; driver: React.ReactNode; seed: number; spinKey?: number;
}) {
  const extra = (
    <>
      {look.turbo && <Flames />}
      {look.revving && <Puffs />}
      {look.sputter && <Puffs />}
      {look.skidding && <Splash />}
      {look.crashed && <><Smoke /><Spark /></>}
      {look.braking && <g aria-hidden="true" stroke="#c9574a" strokeWidth={6} strokeLinecap="round"><path d="M-62,-30 L-76,-30 M-62,-18 L-76,-18" /></g>}
    </>
  );
  const cls = [look.revving ? 'gx-rev' : '', look.skidding ? 'gx-spin' : '', look.crashed ? 'gx-crashed' : ''].filter(Boolean).join(' ');
  return (
    <g className={cls || undefined} transform={`translate(0 ${-(look.lift ?? 0) * 74})`}>
      <TrackKart course={course} u={look.u} lane={lane} tone={tone} seed={seed} driver={driver} extra={extra} />
    </g>
  );
}

export const Scene = memo(function Scene(p: SceneProps) {
  const { course, road, viewW, cam } = p;
  const stretches = useMemo(() => [{ road: [...road], turbo: false }], [road]);
  const maybe = 'maybe' in p.puddles ? p.puddles.maybe : [];
  const real = 'real' in p.puddles ? p.puddles.real : [];
  return (
    <svg className="gx-scene" viewBox={`0 0 ${viewW.toFixed(0)} ${TRACK_H}`} preserveAspectRatio="xMinYMid meet" role="img" aria-label="La pista" style={{ aspectRatio: `${viewW.toFixed(0)} / ${TRACK_H}` }}>
      <g transform={`translate(${(-cam * 0.15).toFixed(1)} 0)`}><Clouds width={course.length * SEG + 2000} /></g>
      <g transform={`translate(${(-cam * 0.45).toFixed(1)} 0)`}><Backdrop width={course.length * SEG * 0.6 + 2000} /></g>
      <g transform={`translate(${(-cam).toFixed(1)} 0)`}>
        <TrackRoad c={course} stretches={stretches} />
        {p.numbers && road.map((_, i) => (
          <text key={`n${i}`} className="gx-tilenum" x={(1 + i) * SEG + SEG / 2} y={surfaceY(course, 1 + i + 0.5) + 58} textAnchor="middle">{(i % p.lapTiles) + 1}</text>
        ))}
        {maybe.map((i) => (
          <g key={`m${i}`} className="gx-maybe">
            <g opacity={0.4}><HazardMark course={course} u={hazardU(i)} kind="puddle" /></g>
            <text x={(1 + i) * SEG + SEG / 2} y={surfaceY(course, 1 + i + 0.5) + 14} textAnchor="middle" className="gx-q">?</text>
          </g>
        ))}
        {real.map((i) => <HazardMark key={`p${i}`} course={course} u={hazardU(i)} kind="puddle" />)}
        {p.logs.map((l) => {
          const fall = Math.max(0, 1 - l.age / FALL_MS);
          return (
            <g key={`l${l.tile}`} transform={`translate(0 ${-(fall * fall) * 260})`} className={l.age < FALL_MS ? 'gx-logfall' : 'gx-logland'}>
              <HazardMark course={course} u={hazardU(l.tile)} kind="log" />
            </g>
          );
        })}
        {!p.hideRivals && <Kart course={course} look={p.rivals[1]} lane="r1" tone="r1" seed={3} driver={<CritterDriver id={p.pair[1]} />} />}
        {!p.hideRivals && <Kart course={course} look={p.rivals[0]} lane="r0" tone="r0" seed={2} driver={<CritterDriver id={p.pair[0]} />} />}
        <g key={p.spinKey ?? 0}>
          <Kart course={course} look={p.me} lane="me" tone="me" seed={1} driver={p.meDriver ?? <MeDriver />} />
        </g>
        {p.me.skidding && <g transform={`translate(${p.me.u * SEG} ${surfaceY(course, p.me.u) + 22})`}><Dust /></g>}
      </g>
    </svg>
  );
});

/** The tiles where a puddle MAY be, for a track whose puddles move (never the first tile, never a ramp or a straight). */
export const maybePuddles = (track: Pick<TrackDef, 'tiles'>): number[] => eligiblePuddleTiles(track.tiles);
