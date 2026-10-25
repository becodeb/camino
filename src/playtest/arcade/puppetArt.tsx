// The posable monster (T45/T46): the same friendly blue bean as the recipe's
// monster (monsterArt.tsx), with noodle arms and stubby legs that move, so it
// can dance ("Copiá el baile") and act out everyday routines ("¿Qué salió
// mal?"). Notebook style: ink #2b2622 boiled by #rough, flat colours, one
// darker facet, a flat hatched shadow, no text.
//
// A pose is a handful of numbers (PoseParams): the arms' angles, the feet,
// the hips' height, a lean, a squash, a hop and a fall (the tumble). The
// four dance poses are drawn to read apart at a glance by their silhouette
// alone: arms up (tall), a star (wide X), a squat (short and wide), on one
// foot (lopsided). usePoseTween moves between poses smoothly.
//
// Coordinates: feet at (0, 0), about 200 units tall standing.

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { blob } from '../../ink/ink.js';
import { REDUCED } from '../../ui/runtime';
import type { Pose } from './dance';

const INK = '#2b2622';
const CREAM = '#fbf6ea';
const MOUTH = '#7b3129';
const SW = 3;

const TONE = { body: '#7298c1', facet: '#5f82ab', belly: '#a9c3de', horn: '#de8a56', foot: '#5a7aa0' };
const BODY = 'M-82,-14 C-104,-86 -84,-178 0,-182 C84,-178 104,-86 82,-14 C62,6 -62,6 -82,-14 Z';

export interface PoseParams {
  /** Arm angles in degrees from hanging down (0) through out to the side (90) to straight up (180). */
  la: number;
  ra: number;
  /** Feet (x, y), y ≤ 0 lifts a foot. */
  lf: [number, number];
  rf: [number, number];
  /** How high the hips are (the legs' length). */
  hip: number;
  /** The upper body's lean (degrees, + to the right). */
  lean: number;
  /** The body's squash. */
  sx: number;
  sy: number;
  /** A hop (negative is up). */
  lift: number;
  /** The tumble: the whole monster tips over its right foot (degrees). */
  fall: number;
}

export const REST: PoseParams = { la: 22, ra: 22, lf: [-40, 0], rf: [40, 0], hip: 26, lean: 0, sx: 1, sy: 1, lift: 0, fall: 0 };

/** The four dance poses. */
export const POSE_PARAMS: Record<Pose, PoseParams> = {
  up: { ...REST, la: 174, ra: 174, lf: [-26, 0], rf: [26, 0], hip: 36, sx: 0.94, sy: 1.06, lift: -12 },
  star: { ...REST, la: 128, ra: 128, lf: [-92, 0], rf: [92, 0], hip: 22, sx: 1.03, sy: 0.97 },
  squat: { ...REST, la: 68, ra: 68, lf: [-70, 0], rf: [70, 0], hip: 6, sx: 1.2, sy: 0.72 },
  flamingo: { ...REST, la: 172, ra: 96, lf: [-86, -56], rf: [24, 0], hip: 34, lean: 10 },
};

/** Other moments: pointing at the cards (your turn), the tumble, the win's hop. */
export const POINT: PoseParams = { ...REST, la: 18, ra: 70, lean: 6 };
export const TUMBLE: PoseParams = { ...REST, la: 150, ra: 160, lf: [-40, -16], rf: [40, 0], fall: 84, lift: 0 };
export const HOP: PoseParams = { ...REST, la: 160, ra: 160, lift: -34, sy: 1.04, sx: 0.97 };

/** The card colour of each pose (the card's paper, the floor's flash). */
export const POSE_COLOR: Record<Pose, string> = { up: '#f6dd8f', star: '#bcd4ea', squat: '#f1bdb8', flamingo: '#cddca5' };

export type Face = 'watch' | 'dance' | 'yay' | 'dizzy' | 'point' | 'sad' | 'cold' | 'puzzled' | 'sleepy';

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function mix(a: PoseParams, b: PoseParams, k: number): PoseParams {
  return {
    la: lerp(a.la, b.la, k), ra: lerp(a.ra, b.ra, k),
    lf: [lerp(a.lf[0], b.lf[0], k), lerp(a.lf[1], b.lf[1], k)], rf: [lerp(a.rf[0], b.rf[0], k), lerp(a.rf[1], b.rf[1], k)],
    hip: lerp(a.hip, b.hip, k), lean: lerp(a.lean, b.lean, k), sx: lerp(a.sx, b.sx, k), sy: lerp(a.sy, b.sy, k), lift: lerp(a.lift, b.lift, k), fall: lerp(a.fall, b.fall, k),
  };
}
/** A little overshoot, so a pose lands with a bounce. */
const easeOutBack = (k: number) => { const c = 1.5; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; };

/** Moves smoothly to `target` (a new object or a constant): `ms` long, with a little bounce. */
export function usePoseTween(target: PoseParams, ms = 240): PoseParams {
  const [cur, setCur] = useState(target);
  const now = useRef(target);
  const key = JSON.stringify(target);
  useEffect(() => {
    if (REDUCED) { now.current = target; setCur(target); return; }
    const from = now.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const v = mix(from, target, k >= 1 ? 1 : easeOutBack(k));
      now.current = v;
      setCur(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // the target's values, not its identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ms]);
  return cur;
}

const rad = (d: number) => (d * Math.PI) / 180;

/** One noodle limb: an ink outline with the body's colour inside, round ends. */
function Limb({ d, fill, w = 18 }: { d: string; fill: string; w?: number }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke={INK} strokeWidth={w + 6} />
      <path d={d} stroke={fill} strokeWidth={w} />
    </g>
  );
}

/**
 * The posable monster, feet at (0, 0). `face` its expression; `look` where
 * its eyes go (x, y in −1…1); `hand` something it holds in its right hand
 * (drawn at the hand, upright); `wear` drawn over the body (clothes, in
 * body coordinates, before the arms); `feet` drawn over each foot (socks,
 * shoes), `(side) => node` at the foot's centre.
 */
export function Puppet({ p, face = 'watch', look = [0, 0], hand, handL, wear, feet, className }: {
  p: PoseParams; face?: Face; look?: [number, number]; hand?: ReactNode; handL?: ReactNode; wear?: ReactNode; feet?: (side: -1 | 1) => ReactNode; className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const c = TONE;
  // the arms hang from the shoulders, which ride the squashed body
  const sh = (side: -1 | 1) => [side * 74 * p.sx, -110 * p.sy] as const;
  const arm = (side: -1 | 1, a: number) => {
    const [x0, y0] = sh(side);
    const L = 84;
    const x1 = x0 + side * Math.sin(rad(a)) * L;
    const y1 = y0 + Math.cos(rad(a)) * L;
    // a slight elbow bend, away from the body
    const mx = (x0 + x1) / 2 + side * Math.cos(rad(a)) * 9;
    const my = (y0 + y1) / 2 - Math.sin(rad(a)) * 4;
    return { d: `M${x0.toFixed(1)},${y0.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`, x: x1, y: y1 };
  };
  const L = arm(-1, p.la);
  const R = arm(1, p.ra);
  const leg = (side: -1 | 1, f: [number, number]) => {
    const hx = side * 34;
    const hy = -p.hip - 4;
    return `M${hx},${hy.toFixed(1)} Q${(hx + f[0]) / 2 + side * 4},${((hy + f[1]) / 2).toFixed(1)} ${f[0].toFixed(1)},${(f[1] - 6).toFixed(1)}`;
  };
  return (
    <g className={`pz-puppet is-${face}${className ? ` ${className}` : ''}`} data-face={face}>
      <ellipse cx={0} cy={2} rx={96} ry={12} fill="url(#hatch)" opacity={0.65} />
      <g transform={`rotate(${p.fall.toFixed(1)} 60 0) translate(0 ${p.lift.toFixed(1)})`}>
        <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
          {/* legs and feet */}
          {p.hip > 8 && <Limb d={leg(-1, p.lf)} fill={c.foot} w={20} />}
          {p.hip > 8 && <Limb d={leg(1, p.rf)} fill={c.foot} w={20} />}
          <path d={blob(p.lf[0] - 4, p.lf[1] - 6, 28, 13, { seed: 3, wob: 0.06 })} fill={c.foot} stroke={INK} strokeWidth={SW} />
          <path d={blob(p.rf[0] + 4, p.rf[1] - 6, 28, 13, { seed: 4, wob: 0.06 })} fill={c.foot} stroke={INK} strokeWidth={SW} />
        </g>
        {feet && <g transform={`translate(${p.lf[0] - 4} ${p.lf[1] - 6})`}>{feet(-1)}</g>}
        {feet && <g transform={`translate(${p.rf[0] + 4} ${p.rf[1] - 6})`}>{feet(1)}</g>}
        <g transform={`translate(0 ${(-p.hip).toFixed(1)}) rotate(${p.lean.toFixed(1)} 0 -90)`}>
          <g transform={`scale(${p.sx.toFixed(3)} ${p.sy.toFixed(3)})`}>
            <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
              <path d="M-52,-160 Q-66,-196 -46,-206 Q-40,-184 -30,-170 Z" fill={c.horn} stroke={INK} strokeWidth={SW} />
              <path d="M52,-160 Q66,-196 46,-206 Q40,-184 30,-170 Z" fill={c.horn} stroke={INK} strokeWidth={SW} />
              <clipPath id={`pzb-${uid}`}><path d={BODY} /></clipPath>
              <path d={BODY} fill={c.facet} />
              <g clipPath={`url(#pzb-${uid})`}>
                <path d={BODY} fill={face === 'cold' ? '#a9c9e6' : c.body} transform="translate(-14 -6)" />
                {wear && <g>{wear}</g>}
              </g>
              {!wear && <path d={blob(0, -54, 50, 38, { seed: 6, wob: 0.07 })} fill={c.belly} opacity={0.9} />}
              <path d={BODY} fill="none" stroke={INK} strokeWidth={SW} />
              {(face === 'yay' || face === 'dance') && <ellipse cx={-56} cy={-98} rx={13} ry={8} fill="#e7a3a0" opacity={0.75} />}
              {(face === 'yay' || face === 'dance') && <ellipse cx={56} cy={-98} rx={13} ry={8} fill="#e7a3a0" opacity={0.75} />}
            </g>
            <FaceArt face={face} look={look} />
          </g>
          <g filter="url(#rough)">
            <Limb d={L.d} fill={c.body} />
            <Limb d={R.d} fill={c.body} />
            <circle cx={L.x} cy={L.y} r={13} fill={c.body} stroke={INK} strokeWidth={SW} />
            <circle cx={R.x} cy={R.y} r={13} fill={c.body} stroke={INK} strokeWidth={SW} />
          </g>
          {handL && <g transform={`translate(${L.x.toFixed(1)} ${L.y.toFixed(1)})`}>{handL}</g>}
          {hand && <g transform={`translate(${R.x.toFixed(1)} ${R.y.toFixed(1)})`}>{hand}</g>}
        </g>
      </g>
    </g>
  );
}

function FaceArt({ face, look }: { face: Face; look: [number, number] }) {
  const px = Math.max(-1, Math.min(1, look[0])) * 6;
  const py = Math.max(-1, Math.min(1, look[1])) * 5;
  const eye = (cx: number, cy: number, r: number, k: number) => {
    if (face === 'yay') return <path key={k} d={`M${cx - r * 0.8},${cy + 3} Q${cx},${cy - r} ${cx + r * 0.8},${cy + 3}`} fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />;
    if (face === 'dizzy') {
      return <path key={k} d={`M${cx},${cy} m-2,0 a2,2 0 1,1 4,0 a5,5 0 1,1 -9,0 a8,8 0 1,1 15,0 a11,11 0 1,1 -21,0`} fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />;
    }
    if (face === 'cold' || face === 'sleepy') {
      return <path key={k} d={`M${cx - r * 0.75},${cy} Q${cx},${cy + r * 0.5} ${cx + r * 0.75},${cy}`} fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />;
    }
    return (
      <g key={k}>
        <ellipse cx={cx} cy={cy} rx={r} ry={r * 1.08} fill={CREAM} stroke={INK} strokeWidth={2.4} />
        <circle cx={cx + px * (r / 20)} cy={cy + 3 + py * (r / 20)} r={r * 0.4} fill={INK} />
        <circle cx={cx + px * (r / 20) - r * 0.14} cy={cy - r * 0.04 + py * (r / 20)} r={r * 0.12} fill={CREAM} />
      </g>
    );
  };
  let mouth: ReactNode;
  switch (face) {
    case 'dance':
    case 'point':
    case 'watch':
      mouth = (
        <g>
          <path d="M-36,-86 Q0,-52 36,-86 Q0,-76 -36,-86 Z" fill={MOUTH} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d="M-8,-81 L-3,-72 L2,-80 Z" fill={CREAM} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
        </g>
      );
      break;
    case 'yay':
      mouth = (
        <g>
          <path d="M-46,-90 Q0,-36 46,-90 Q0,-78 -46,-90 Z" fill={MOUTH} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d="M-20,-66 Q0,-56 20,-66 Q0,-74 -20,-66 Z" fill="#e7a3a0" />
        </g>
      );
      break;
    case 'dizzy':
      mouth = <path d="M-30,-76 Q-20,-86 -10,-76 Q0,-66 10,-76 Q20,-86 30,-76" fill="none" stroke={INK} strokeWidth={SW + 0.4} strokeLinecap="round" />;
      break;
    case 'sad':
      mouth = <path d="M-26,-70 Q0,-92 26,-70" fill="none" stroke={INK} strokeWidth={SW + 0.6} strokeLinecap="round" />;
      break;
    case 'cold':
      // chattering teeth
      mouth = (
        <g>
          <rect x={-26} y={-88} width={52} height={18} rx={5} fill={CREAM} stroke={INK} strokeWidth={2.6} />
          <path d="M-26,-79 L26,-79 M-13,-88 L-13,-70 M0,-88 L0,-70 M13,-88 L13,-70" stroke={INK} strokeWidth={1.8} />
        </g>
      );
      break;
    case 'puzzled':
      mouth = <path d="M-22,-78 Q-8,-84 4,-78 Q14,-72 24,-80" fill="none" stroke={INK} strokeWidth={SW + 0.4} strokeLinecap="round" />;
      break;
    case 'sleepy':
      mouth = <ellipse cx={0} cy={-78} rx={9} ry={7} fill={MOUTH} stroke={INK} strokeWidth={SW} />;
      break;
  }
  return (
    <g>
      {face === 'puzzled' && <path d="M8,-152 Q24,-162 44,-150" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />}
      {face === 'sad' && <path d="M-50,-150 L-14,-142 M14,-140 L44,-148" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />}
      {eye(-30, -126, 21, 0)}
      {eye(30, -122, 15, 1)}
      {mouth}
    </g>
  );
}

// ------------------------------------------------------------------ the pose cards and the menu card

/** A pose card's drawing: the monster in that pose, whole, on a little floor. */
export function PoseCardArt({ pose }: { pose: Pose }) {
  return (
    <svg className="dz-card-art" viewBox="-150 -270 300 290" aria-hidden="true">
      <Puppet p={POSE_PARAMS[pose]} face="dance" />
    </svg>
  );
}

/** The arcade menu's card for "Copiá el baile": the monster dancing on a little stage, two pose cards beside it. */
export function DanceCardArt() {
  return (
    <svg className="pp-fp-art" viewBox="0 0 260 190" aria-hidden="true">
      <path d="M16,160 L244,160 L236,178 L24,178 Z" fill="#c98a4b" stroke={INK} strokeWidth={2.4} filter="url(#rough)" />
      <path d="M40,8 L92,160 L168,160 L220,8 Z" fill="#f6dd8f" opacity={0.45} />
      <g transform="translate(130 158) scale(0.62)"><Puppet p={POSE_PARAMS.star} face="dance" /></g>
      <g fill="none" stroke="#3d6ea5" strokeWidth={3} strokeLinecap="round">
        <path d="M44,96 Q36,104 44,112 M216,96 Q224,104 216,112" />
        <path d="M30,84 Q18,104 30,124 M230,84 Q242,104 230,124" />
      </g>
    </svg>
  );
}
