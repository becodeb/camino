// "¿Qué salió mal?" (T46): the drawn steps of the everyday routines (oops.ts),
// each a little picture of the posable monster (puppetArt.tsx) acting it out,
// in the notebook's style: ink #2b2622 boiled by #rough, flat warm colours,
// no text. A step reads without words: what the monster wears, holds or
// does, and where (inside by the window, out in the snow, in the street, at
// the table, in the bathroom). The funny results are drawn plainly: blue
// and shivering in a swimsuit in the snow, socks pulled over the shoes and
// slipping, soup dripping through a fork, yellow teeth and a stink.
//
// A step is drawn in a 240 × 230 box (StepArt), the monster's feet at
// (124, 206), two thirds of its size.

import type { ReactNode } from 'react';
import { blob, penLoop, wobblyLine, wobblyPoly } from '../../ink/ink.js';
import { Puppet, REST, type Face, type PoseParams } from './puppetArt';
import type { StepId } from './oops';

const INK = '#2b2622';
const CREAM = '#fbf6ea';
const PAPER = '#fbf7ee';
const RED = '#c9574a';
const YELLOW = '#f0d27a';
const ORANGE = '#de8a56';
const BLUE = '#7298c1';
const GREEN = '#a4b86d';
const MOUTH = '#7b3129';

export const STEP_W = 240;
export const STEP_H = 230;
const MX = 124, MY = 206, S = 0.66;

const ink = { stroke: INK, strokeWidth: 2.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
const pose = (o: Partial<PoseParams>): PoseParams => ({ ...REST, ...o });

// ------------------------------------------------------------------ places

function Room() {
  return (
    <g>
      <rect x={0} y={0} width={STEP_W} height={MY} fill="#f6efdf" />
      <rect x={0} y={MY} width={STEP_W} height={STEP_H - MY} fill="#eadfc8" />
      <path d={`M0,${MY} L${STEP_W},${MY}`} stroke={INK} strokeWidth={2} opacity={0.6} />
    </g>
  );
}

function Snowy({ flakes = true }: { flakes?: boolean }) {
  const f = [[20, 30], [60, 70], [110, 24], [170, 50], [214, 22], [36, 118], [200, 104], [150, 14], [90, 120], [224, 150], [14, 168]];
  return (
    <g>
      <rect x={0} y={0} width={STEP_W} height={STEP_H} fill="#d6e5f1" />
      <path d={`M0,186 Q60,172 120,184 T240,180 L240,230 L0,230 Z`} fill={PAPER} {...ink} strokeWidth={2.2} />
      <g filter="url(#rough)">
        <path d="M24,186 L44,120 L64,186 Z" fill="#7d9150" {...ink} />
        <path d="M30,150 Q44,144 58,150 M34,170 Q44,164 56,170" fill="none" stroke={PAPER} strokeWidth={5} strokeLinecap="round" />
      </g>
      {flakes && f.map(([x, y], i) => <circle key={i} className="oo-flake" cx={x} cy={y} r={i % 3 ? 3.4 : 4.6} fill={PAPER} stroke="#9db4c8" strokeWidth={1.2} />)}
    </g>
  );
}

function Street() {
  return (
    <g>
      <rect x={0} y={0} width={STEP_W} height={STEP_H} fill="#e3eef3" />
      <path d="M0,176 Q120,168 240,176 L240,230 L0,230 Z" fill="#cddca5" {...ink} strokeWidth={2.2} />
      <path d="M70,230 Q100,196 112,178 L150,178 Q170,198 210,230 Z" fill="#e9d9b8" stroke={INK} strokeWidth={1.8} opacity={0.9} />
      <g filter="url(#rough)">
        <circle cx={200} cy={34} r={18} fill={YELLOW} {...ink} />
        <path d="M18,176 L18,120" stroke="#8a6a44" strokeWidth={8} strokeLinecap="round" />
        <path d={blob(18, 104, 26, 24, { seed: 3, wob: 0.1 })} fill={GREEN} {...ink} />
      </g>
    </g>
  );
}

function Kitchen() {
  return (
    <g>
      <rect x={0} y={0} width={STEP_W} height={STEP_H} fill="#f6efdf" />
      <g opacity={0.3} stroke={INK} strokeWidth={1.2}>
        {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M0,${20 + i * 22} L240,${20 + i * 22}`} />)}
      </g>
    </g>
  );
}

/** The table in front of the monster (drawn after it), with the bowl. */
function Table({ bowl }: { bowl: 'full' | 'empty' | 'steam' }) {
  return (
    <g filter="url(#rough)">
      <rect x={-6} y={158} width={252} height={18} rx={4} fill="#c98a4b" {...ink} />
      <rect x={-6} y={176} width={252} height={60} fill="#b37a40" {...ink} />
      <g transform="translate(70 158)">
        {bowl === 'steam' && (
          <g className="oo-steam" fill="none" stroke="#9db4c8" strokeWidth={3} strokeLinecap="round">
            <path d="M-12,-30 Q-18,-42 -10,-52 M4,-30 Q-2,-44 6,-56 M18,-30 Q12,-40 20,-50" />
          </g>
        )}
        <path d="M-38,-22 Q-36,4 0,6 Q36,4 38,-22 Z" fill={CREAM} {...ink} />
        <path d="M-30,-10 Q0,-4 30,-10" fill="none" stroke={BLUE} strokeWidth={3} />
        {bowl !== 'empty' && <ellipse cx={0} cy={-22} rx={36} ry={7} fill={ORANGE} {...ink} />}
        {bowl === 'empty' && <ellipse cx={0} cy={-22} rx={36} ry={7} fill="#f1e6cf" {...ink} />}
      </g>
    </g>
  );
}

function Bath() {
  return (
    <g>
      <rect x={0} y={0} width={STEP_W} height={STEP_H} fill="#dcebf1" />
      <g opacity={0.45} stroke="#7a99ad" strokeWidth={1.2}>
        {Array.from({ length: 10 }, (_, i) => <path key={`h${i}`} d={`M0,${i * 24} L240,${i * 24}`} />)}
        {Array.from({ length: 10 }, (_, i) => <path key={`v${i}`} d={`M${i * 24},0 L${i * 24},230`} />)}
      </g>
      <g filter="url(#rough)">
        <rect x={10} y={22} width={58} height={74} rx={26} fill="#eef5f8" {...ink} />
        <path d="M24,40 L38,32 M24,56 L50,40" stroke="#ffffff" strokeWidth={4} strokeLinecap="round" />
      </g>
      <rect x={0} y={MY} width={STEP_W} height={STEP_H - MY} fill="#c8dbe5" />
    </g>
  );
}

// ------------------------------------------------------------------ clothes (body coordinates)

const COAT = (
  <g>
    <rect x={-120} y={-66} width={240} height={90} fill={RED} />
    <path d="M0,-66 L0,20" stroke={INK} strokeWidth={2.4} />
    {[-46, -26].map((y) => <circle key={y} cx={10} cy={y} r={4} fill={YELLOW} stroke={INK} strokeWidth={1.6} />)}
    <path d="M-120,-66 L120,-66" stroke={INK} strokeWidth={2.6} />
  </g>
);
const SCARF = (
  <g filter="url(#rough)">
    <path d="M-86,-76 Q0,-58 86,-76 L84,-60 Q0,-42 -84,-60 Z" fill={YELLOW} {...ink} />
    <path d="M34,-60 L30,-22 L50,-20 L52,-62 Z" fill={YELLOW} {...ink} />
    <path d="M34,-34 L50,-32" stroke={RED} strokeWidth={3} />
  </g>
);
const BEANIE = (
  <g filter="url(#rough)">
    <path d="M-46,-164 Q0,-222 46,-164 Z" fill={RED} {...ink} />
    <rect x={-50} y={-172} width={100} height={14} rx={6} fill={CREAM} {...ink} />
    <circle cx={0} cy={-206} r={11} fill={CREAM} {...ink} />
  </g>
);
const TRUNKS = (
  <g>
    <rect x={-120} y={-40} width={240} height={60} fill={YELLOW} />
    {[-90, -54, -18, 18, 54, 90].map((x) => <rect key={x} x={x} y={-40} width={14} height={60} fill={RED} />)}
    <path d="M-120,-40 L120,-40" stroke={INK} strokeWidth={2.6} />
  </g>
);
const SUNGLASSES = (
  <g filter="url(#rough)">
    <ellipse cx={-30} cy={-126} rx={25} ry={20} fill="#3b3a44" {...ink} />
    <ellipse cx={30} cy={-122} rx={20} ry={16} fill="#3b3a44" {...ink} />
    <path d="M-6,-128 Q0,-132 10,-126" fill="none" {...ink} />
    <path d="M-40,-134 L-30,-140" stroke="#ffffff" strokeWidth={3} strokeLinecap="round" opacity={0.7} />
  </g>
);
const STRAW_HAT = (
  <g filter="url(#rough)">
    <ellipse cx={0} cy={-168} rx={98} ry={20} fill={YELLOW} {...ink} />
    <path d="M-50,-170 Q-48,-222 0,-224 Q48,-222 50,-170 Z" fill={YELLOW} {...ink} />
    <path d="M-50,-180 Q0,-170 50,-180 L50,-170 Q0,-160 -50,-170 Z" fill={RED} {...ink} strokeWidth={1.8} />
  </g>
);
const RING = (
  <g filter="url(#rough)">
    <path d="M-116,-40 A116,34 0 1,0 116,-40 A116,34 0 1,0 -116,-40 Z M-78,-40 A78,16 0 1,1 78,-40 A78,16 0 1,1 -78,-40 Z" fill={YELLOW} fillRule="evenodd" {...ink} />
    <path d="M-104,-22 L-86,-30 M-20,-8 L-20,-22 M60,-10 L50,-24 M104,-28 L90,-34" stroke={RED} strokeWidth={10} strokeLinecap="butt" />
  </g>
);
/** A big grin with teeth (shining white, or yellow and stinky). */
function Teeth({ clean }: { clean: boolean }) {
  return (
    <g>
      <path d="M-48,-94 Q0,-36 48,-94 Q0,-82 -48,-94 Z" fill={MOUTH} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <path d="M-42,-91 Q0,-80 42,-91 L38,-80 Q0,-70 -38,-80 Z" fill={clean ? '#ffffff' : '#d9c26a'} stroke={INK} strokeWidth={2} />
      <path d="M-24,-88 L-22,-76 M-8,-86 L-7,-73 M8,-86 L7,-73 M24,-88 L22,-76" stroke={INK} strokeWidth={1.4} />
      {clean ? (
        <g className="oo-sparkle" fill="#ffffff" stroke={INK} strokeWidth={1.8} strokeLinejoin="round">
          {[[-62, -110, 1], [64, -100, 0.8], [52, -136, 0.6]].map(([x, y, s], i) => (
            <path key={i} transform={`translate(${x} ${y}) scale(${s})`} d="M0,-14 L4,-4 14,0 4,4 0,14 -4,4 -14,0 -4,-4 Z" />
          ))}
        </g>
      ) : (
        <g className="oo-stink" fill="none" stroke="#7d9150" strokeWidth={4} strokeLinecap="round">
          <path d={wobblyLine(-58, -96, -92, -150, { bow: 8, seed: 1 })} />
          <path d={wobblyLine(58, -96, 92, -150, { bow: -8, seed: 2 })} />
          <path d={wobblyLine(-70, -80, -112, -104, { bow: 6, seed: 3 })} />
          <path d={wobblyLine(70, -80, 112, -104, { bow: -6, seed: 4 })} />
        </g>
      )}
    </g>
  );
}
const FOAM = (
  <g fill="#ffffff" stroke="#9db4c8" strokeWidth={1.6}>
    {[[-40, -70, 9], [-26, -62, 7], [36, -72, 8], [24, -60, 6], [-10, -58, 6], [48, -86, 6]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}
  </g>
);
const RUMBLE = (
  <g fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" opacity={0.7}>
    <path d="M-104,-60 Q-114,-50 -104,-40 M-118,-66 Q-132,-50 -118,-34" />
    <path d="M104,-60 Q114,-50 104,-40 M118,-66 Q132,-50 118,-34" />
  </g>
);
const SHIVER = (
  <g fill="none" stroke="#5a86b5" strokeWidth={3} strokeLinecap="round">
    <path d="M-112,-130 L-122,-122 L-112,-114 L-122,-106 M112,-130 L122,-122 L112,-114 L122,-106" />
    <path d="M-8,-108 L-4,-96 L0,-108" fill="#dff0fb" stroke={INK} strokeWidth={1.6} />
  </g>
);

// ------------------------------------------------------------------ the feet

const SOCK = GREEN;
const SOCK_STRIPES = CREAM;
function Sock() {
  return (
    <g filter="url(#rough)">
      <path d="M-15,-10 L-15,-48 L15,-48 L15,-10 Z" fill={SOCK} {...ink} />
      <path d="M-15,-38 L15,-38 M-15,-26 L15,-26" stroke={SOCK_STRIPES} strokeWidth={5} />
      <path d="M-32,8 Q-34,-14 -10,-14 L10,-14 Q32,-12 34,2 Q30,12 0,12 Q-30,12 -32,8 Z" fill={SOCK} {...ink} />
      <path d="M-30,0 Q0,6 32,-2" fill="none" stroke={SOCK_STRIPES} strokeWidth={4} />
    </g>
  );
}
function Shoe() {
  return (
    <g filter="url(#rough)">
      <path d="M-36,10 L-36,-4 Q-32,-20 -8,-20 L6,-20 Q24,-18 38,-2 L38,10 Z" fill={ORANGE} {...ink} />
      <rect x={-37} y={3} width={76} height={8} rx={3} fill={CREAM} {...ink} strokeWidth={2} />
      <path d="M-6,-18 L4,-8 M2,-19 L12,-10" stroke={CREAM} strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}
/** A sock pulled over a shoe: lumpy, stretched, the toe flopping. */
function SockOver() {
  return (
    <g filter="url(#rough)">
      <path d="M-15,-14 L-15,-50 L15,-50 L15,-14 Z" fill={SOCK} {...ink} />
      <path d="M-15,-40 L15,-40" stroke={SOCK_STRIPES} strokeWidth={5} />
      <rect x={-40} y={8} width={84} height={9} rx={3} fill={ORANGE} {...ink} strokeWidth={2} />
      <path d="M-42,12 Q-46,-30 -8,-30 Q26,-32 44,-8 Q64,-2 58,10 Q40,14 0,12 Q-36,12 -42,12 Z" fill={SOCK} {...ink} />
      <path d="M-32,-14 L32,-16 M-36,0 L46,-2" stroke={SOCK_STRIPES} strokeWidth={5} />
      <path d="M48,-6 Q72,-20 76,2 Q70,8 60,4" fill={SOCK} {...ink} />
    </g>
  );
}
type Feet = 'bare' | 'socks' | 'shoes_bare' | 'shoes_socks' | 'socks_over';
function feetOf(f: Feet) {
  if (f === 'bare') return undefined;
  return (side: -1 | 1) => (
    <g transform={`scale(${side} 1)`}>
      {f === 'socks' && <Sock />}
      {f === 'shoes_bare' && <Shoe />}
      {f === 'shoes_socks' && <><g transform="translate(0 -2)" filter="url(#rough)"><path d="M-15,-14 L-15,-48 L15,-48 L15,-14 Z" fill={SOCK} {...ink} /><path d="M-15,-38 L15,-38 M-15,-26 L15,-26" stroke={SOCK_STRIPES} strokeWidth={5} /></g><Shoe /></>}
      {f === 'socks_over' && <SockOver />}
    </g>
  );
}

// ------------------------------------------------------------------ things to hold (at the hand, pointing up)

function Spoon({ full = false }: { full?: boolean }) {
  return (
    <g filter="url(#rough)">
      <rect x={-4} y={-58} width={8} height={56} rx={3} fill="#b9c0c6" {...ink} strokeWidth={2.2} />
      <ellipse cx={0} cy={-70} rx={14} ry={18} fill="#d7dde2" {...ink} />
      {full && <ellipse cx={0} cy={-70} rx={9} ry={12} fill={ORANGE} />}
    </g>
  );
}
function Fork({ drip = false }: { drip?: boolean }) {
  return (
    <g>
      <g filter="url(#rough)">
        <rect x={-4} y={-56} width={8} height={54} rx={3} fill="#b9c0c6" {...ink} strokeWidth={2.2} />
        <path d="M-14,-58 L14,-58 L14,-64 L-14,-64 Z" fill="#b9c0c6" {...ink} strokeWidth={2.2} />
        <path d="M-12,-62 L-12,-92 M-4,-62 L-4,-92 M4,-62 L4,-92 M12,-62 L12,-92" stroke={INK} strokeWidth={4.4} strokeLinecap="round" />
        <path d="M-12,-62 L-12,-92 M-4,-62 L-4,-92 M4,-62 L4,-92 M12,-62 L12,-92" stroke="#d7dde2" strokeWidth={2} strokeLinecap="round" />
      </g>
      {drip && (
        <g className="oo-drip" fill={ORANGE} stroke={INK} strokeWidth={1.6}>
          {[[-8, -50], [6, -36], [-2, -20]].map(([x, y], i) => <path key={i} d={`M${x},${y - 8} Q${x + 6},${y} ${x},${y + 4} Q${x - 6},${y} ${x},${y - 8} Z`} />)}
        </g>
      )}
    </g>
  );
}
function Knife() {
  return (
    <g filter="url(#rough)">
      <rect x={-5} y={-30} width={10} height={28} rx={3} fill="#8a6a44" {...ink} strokeWidth={2.2} />
      <path d="M-6,-30 L-6,-92 Q8,-80 6,-30 Z" fill="#d7dde2" {...ink} strokeWidth={2.2} />
    </g>
  );
}
function Comb() {
  return (
    <g filter="url(#rough)" transform="rotate(-10)">
      <rect x={-8} y={-84} width={16} height={84} rx={4} fill="#e7a3a0" {...ink} strokeWidth={2.2} />
      <path d={Array.from({ length: 9 }, (_, i) => `M8,${-80 + i * 9} L26,${-80 + i * 9}`).join(' ')} stroke={INK} strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}
type BrushTop = 'none' | 'paste' | 'ketchup' | 'crayon';
function Toothbrush({ top = 'none' }: { top?: BrushTop }) {
  return (
    <g filter="url(#rough)">
      <rect x={-5} y={-74} width={10} height={72} rx={4} fill={GREEN} {...ink} strokeWidth={2.2} />
      <rect x={-12} y={-96} width={24} height={22} rx={3} fill="#ffffff" {...ink} strokeWidth={2.2} />
      <path d="M-6,-96 L-6,-76 M0,-96 L0,-76 M6,-96 L6,-76" stroke="#9db4c8" strokeWidth={1.6} />
      {top === 'paste' && <path d="M-20,-98 Q-14,-124 -2,-108 Q6,-130 20,-104 Q14,-92 -20,-98 Z" fill="#cfeedd" stroke={INK} strokeWidth={2.2} />}
      {top === 'paste' && <path d="M-13,-103 Q-2,-114 12,-104" fill="none" stroke={BLUE} strokeWidth={4} strokeLinecap="round" />}
      {top === 'ketchup' && <path d={blob(0, -106, 19, 12, { seed: 5, wob: 0.15 })} fill={RED} stroke={INK} strokeWidth={2.2} />}
      {top === 'crayon' && <path d="M-14,-102 L-4,-110 L2,-100 L12,-108" fill="none" stroke={ORANGE} strokeWidth={5} strokeLinecap="round" />}
    </g>
  );
}
function Tube({ empty = false }: { empty?: boolean }) {
  return empty ? (
    <g filter="url(#rough)" transform="rotate(20)">
      <path d="M-10,-6 L-12,-50 L12,-50 L10,-6 Q0,6 -10,-6 Z" fill="#ffffff" {...ink} strokeWidth={2.2} />
      <path d="M-12,-50 Q0,-40 12,-50 M-11,-34 Q0,-26 11,-34" fill="none" stroke={INK} strokeWidth={1.8} />
      <rect x={-6} y={-60} width={12} height={10} rx={2} fill={BLUE} {...ink} strokeWidth={2} />
      <path d="M-4,-70 L-10,-80 M4,-70 L10,-80 M0,-72 L0,-84" stroke={INK} strokeWidth={2} strokeLinecap="round" opacity={0.5} />
    </g>
  ) : (
    <g filter="url(#rough)" transform="rotate(20)">
      <path d="M-14,-4 L-14,-56 L14,-56 L14,-4 Z" fill="#ffffff" {...ink} strokeWidth={2.2} />
      <path d="M-14,-30 L14,-30" stroke={BLUE} strokeWidth={6} />
      <rect x={-7} y={-68} width={14} height={12} rx={2} fill={BLUE} {...ink} strokeWidth={2} />
    </g>
  );
}
function Ketchup() {
  return (
    <g filter="url(#rough)" transform="rotate(20)">
      <path d="M-14,-2 L-16,-50 Q-16,-58 -6,-60 L-6,-70 L6,-70 L6,-60 Q16,-58 16,-50 L14,-2 Z" fill={RED} {...ink} strokeWidth={2.2} />
      <rect x={-9} y={-40} width={18} height={14} rx={3} fill={CREAM} />
    </g>
  );
}
function Crayon() {
  return (
    <g filter="url(#rough)" transform="rotate(20)">
      <path d="M-8,-4 L-8,-62 L0,-80 L8,-62 L8,-4 Z" fill={ORANGE} {...ink} strokeWidth={2.2} />
      <path d="M-8,-50 L8,-50 M-8,-16 L8,-16" stroke={INK} strokeWidth={1.8} />
    </g>
  );
}
function Snowman() {
  return (
    <g filter="url(#rough)">
      <circle cx={0} cy={-20} r={22} fill={PAPER} {...ink} />
      <circle cx={0} cy={-56} r={16} fill={PAPER} {...ink} />
      <circle cx={-5} cy={-60} r={2.4} fill={INK} />
      <circle cx={5} cy={-60} r={2.4} fill={INK} />
      <path d="M0,-54 L14,-52 L0,-50 Z" fill={ORANGE} stroke={INK} strokeWidth={1.4} />
      <path d="M-12,-72 L12,-72 L8,-88 L-8,-88 Z" fill="#3b3a44" {...ink} strokeWidth={2} />
    </g>
  );
}

// ------------------------------------------------------------------ the steps

interface StepDef {
  place: 'room' | 'snow' | 'street' | 'kitchen' | 'bath';
  p: PoseParams;
  face: Face;
  look?: [number, number];
  wear?: ReactNode;
  over?: ReactNode;
  feet?: Feet;
  hand?: ReactNode;
  handL?: ReactNode;
  /** The puppet's x (default MX). */
  x?: number;
  /** Drawn before the monster (in the place) and after it (in front). */
  back?: ReactNode;
  front?: ReactNode;
  /** The step's little act while it plays (CSS): a bounce, a shiver, a slip. */
  act?: 'bounce' | 'shiver' | 'slip' | 'droop';
}

const TO_MOUTH = -66;
const HUG = pose({ la: -38, ra: -38 });

const STEPS: Record<StepId, StepDef> = {
  // going out in the cold
  window_snow: {
    place: 'room', p: pose({ la: 128, ra: 24 }), face: 'watch', look: [-1, -0.6], x: 158,
    back: (
      <g filter="url(#rough)">
        <rect x={10} y={30} width={84} height={100} rx={4} fill="#d6e5f1" {...ink} />
        <path d="M52,30 L52,130 M10,80 L94,80" stroke={INK} strokeWidth={2.4} />
        {[[24, 46], [42, 66], [72, 44], [82, 100], [26, 110], [60, 116], [36, 92]].map(([x, y], i) => <circle key={i} className="oo-flake" cx={x} cy={y} r={3.6} fill={PAPER} stroke="#9db4c8" strokeWidth={1.2} />)}
        <path d="M10,124 Q52,116 94,124 L94,130 L10,130 Z" fill={PAPER} stroke={INK} strokeWidth={1.6} />
      </g>
    ),
  },
  coat_on: { place: 'room', p: pose({ la: 70, ra: 70 }), face: 'dance', wear: COAT, over: <>{SCARF}{BEANIE}</>, act: 'bounce' },
  swimsuit_on: { place: 'room', p: pose({ la: 150, ra: 50 }), face: 'dance', wear: TRUNKS, over: SUNGLASSES, act: 'bounce' },
  sunhat_on: { place: 'room', p: pose({ la: 60, ra: 140 }), face: 'dance', over: <>{STRAW_HAT}{SUNGLASSES}</>, act: 'bounce' },
  floatie_on: { place: 'room', p: pose({ la: 60, ra: 60 }), face: 'dance', over: RING, act: 'bounce' },
  snow_play: {
    place: 'snow', p: pose({ la: 160, ra: 160, lift: -8 }), face: 'yay', wear: COAT, over: <>{SCARF}{BEANIE}</>, x: 150, act: 'bounce',
    back: <g transform="translate(62 196)"><Snowman /></g>,
  },
  snow_shiver: { place: 'snow', p: HUG, face: 'cold', wear: TRUNKS, over: <>{SUNGLASSES}{SHIVER}</>, x: 140, act: 'shiver' },

  // getting dressed (long legs, so the socks and shoes show)
  socks_on: { place: 'room', p: pose({ la: 40, ra: 40, lf: [-82, -44], rf: [30, 0], lean: 8, hip: 48 }), face: 'dance', look: [-1, 1], feet: 'socks', act: 'bounce' },
  shoes_on: { place: 'room', p: pose({ la: 24, ra: 140, hip: 48 }), face: 'dance', feet: 'shoes_socks', act: 'bounce' },
  shoes_bare: { place: 'room', p: pose({ la: 40, ra: 40, hip: 48 }), face: 'watch', look: [0, 1], feet: 'shoes_bare', act: 'bounce' },
  socks_over: { place: 'room', p: pose({ la: 40, ra: 40, lf: [-82, -44], rf: [30, 0], lean: 8, hip: 48 }), face: 'puzzled', look: [-1, 1], feet: 'socks_over', act: 'bounce' },
  walk_happy: { place: 'street', p: pose({ la: 140, ra: 30, lf: [-54, 0], rf: [58, -8], lean: 6, hip: 46 }), face: 'yay', feet: 'shoes_socks', act: 'bounce' },
  walk_silly: { place: 'street', p: pose({ la: 150, ra: 150, lf: [-78, -36], rf: [30, 0], lean: -16, hip: 46 }), face: 'puzzled', feet: 'socks_over', act: 'slip' },

  // soup (the monster at the table; what it holds big, to its right)
  soup_served: { place: 'kitchen', p: pose({ la: 24, ra: 24 }), face: 'dance', look: [-0.8, 1], x: 140, front: <Table bowl="steam" /> },
  spoon_take: { place: 'kitchen', p: pose({ la: 24, ra: 118 }), face: 'dance', hand: <g transform="scale(1.35)"><Spoon /></g>, x: 112, front: <Table bowl="steam" />, act: 'bounce' },
  fork_take: { place: 'kitchen', p: pose({ la: 24, ra: 118 }), face: 'dance', hand: <g transform="scale(1.35)"><Fork /></g>, x: 112, front: <Table bowl="steam" />, act: 'bounce' },
  knife_take: { place: 'kitchen', p: pose({ la: 24, ra: 118 }), face: 'dance', hand: <g transform="scale(1.35)"><Knife /></g>, x: 112, front: <Table bowl="steam" />, act: 'bounce' },
  comb_take: { place: 'kitchen', p: pose({ la: 24, ra: 118 }), face: 'dance', hand: <g transform="scale(1.35)"><Comb /></g>, x: 112, front: <Table bowl="steam" />, act: 'bounce' },
  soup_eat: { place: 'kitchen', p: pose({ la: 24, ra: TO_MOUTH }), face: 'dance', hand: <g transform="rotate(-80) translate(0 58) scale(1.25)"><Spoon full /></g>, x: 140, front: <Table bowl="full" />, act: 'bounce' },
  soup_drip: {
    place: 'kitchen', p: pose({ la: 24, ra: TO_MOUTH }), face: 'puzzled', hand: <g transform="rotate(-80) translate(0 58) scale(1.25)"><Fork /></g>, x: 140, front: <Table bowl="full" />, act: 'droop',
    over: (
      <g className="oo-drip" fill={ORANGE} stroke={INK} strokeWidth={2.4}>
        {[[-30, -56], [-14, -30], [-34, -10]].map(([x, y], i) => <path key={i} d={`M${x},${y - 13} Q${x + 10},${y} ${x},${y + 8} Q${x - 10},${y} ${x},${y - 13} Z`} />)}
      </g>
    ),
  },
  soup_full: { place: 'kitchen', p: HUG, face: 'yay', x: 140, front: <Table bowl="empty" />, act: 'bounce' },
  soup_hungry: { place: 'kitchen', p: HUG, face: 'sad', over: RUMBLE, x: 140, front: <Table bowl="full" />, act: 'droop' },

  // the teeth (the brush and the tube held big, in front of the monster)
  brush_take: { place: 'bath', p: pose({ la: 24, ra: 100 }), face: 'dance', hand: <g transform="scale(1.25)"><Toothbrush /></g>, x: 110, act: 'bounce' },
  paste_on: { place: 'bath', p: pose({ la: -24, ra: -24 }), face: 'dance', look: [0, 1], hand: <g transform="scale(1.4)"><Toothbrush top="paste" /></g>, handL: <g transform="translate(-4 -40) rotate(30) scale(1.3)"><Tube /></g>, x: 132, act: 'bounce' },
  paste_none: { place: 'bath', p: pose({ la: -24, ra: -24 }), face: 'dance', look: [0, 1], hand: <g transform="scale(1.4)"><Toothbrush /></g>, handL: <g transform="translate(-4 -40) rotate(30) scale(1.3)"><Tube empty /></g>, x: 132, act: 'bounce' },
  ketchup_on: { place: 'bath', p: pose({ la: -24, ra: -24 }), face: 'dance', look: [0, 1], hand: <g transform="scale(1.4)"><Toothbrush top="ketchup" /></g>, handL: <g transform="translate(-4 -40) rotate(30) scale(1.3)"><Ketchup /></g>, x: 132, act: 'bounce' },
  crayon_on: { place: 'bath', p: pose({ la: -24, ra: -24 }), face: 'dance', look: [0, 1], hand: <g transform="scale(1.4)"><Toothbrush top="crayon" /></g>, handL: <g transform="translate(-4 -40) rotate(30) scale(1.3)"><Crayon /></g>, x: 132, act: 'bounce' },
  teeth_brush: { place: 'bath', p: pose({ la: 24, ra: TO_MOUTH }), face: 'dance', hand: <g transform="rotate(-80) translate(0 78) scale(1.3)"><Toothbrush top="paste" /></g>, over: FOAM, x: 140, act: 'bounce' },
  teeth_brush_dry: { place: 'bath', p: pose({ la: 24, ra: TO_MOUTH }), face: 'puzzled', hand: <g transform="rotate(-80) translate(0 78) scale(1.3)"><Toothbrush /></g>, x: 140, act: 'bounce' },
  teeth_shine: { place: 'bath', p: pose({ la: 150, ra: 24 }), face: 'yay', over: <Teeth clean />, x: 140, act: 'bounce' },
  teeth_stink: { place: 'bath', p: pose({ la: 24, ra: 24 }), face: 'puzzled', over: <Teeth clean={false} />, x: 140, act: 'droop' },
};

/** The act a step plays (CSS `.oo-act-<act>`). */
export const actOf = (id: StepId) => STEPS[id].act ?? 'bounce';

/** One step of a routine, drawn in its 240 × 230 box. */
export function StepArt({ id }: { id: StepId }) {
  const d = STEPS[id];
  return (
    <g data-step={id}>
      {d.place === 'room' && <Room />}
      {d.place === 'snow' && <Snowy />}
      {d.place === 'street' && <Street />}
      {d.place === 'kitchen' && <Kitchen />}
      {d.place === 'bath' && <Bath />}
      {d.back}
      <g transform={`translate(${d.x ?? MX} ${MY}) scale(${S})`}>
        <g className="oo-actor">
          <Puppet p={d.p} face={d.face} look={d.look} wear={d.wear} over={d.over} feet={d.feet ? feetOf(d.feet) : undefined} hand={d.hand} handL={d.handL} />
        </g>
      </g>
      {d.front}
    </g>
  );
}

/** A step as a standalone picture (an option card, the menu card's strip). */
export function StepPicture({ id, className, zoom = false }: { id: StepId; className?: string; zoom?: boolean }) {
  // zoomed (the options): closer on the monster and what it wears or holds
  return (
    <svg className={className ?? 'oo-pic'} viewBox={zoom ? '28 26 184 176' : `0 0 ${STEP_W} ${STEP_H}`} aria-hidden="true">
      <StepArt id={id} />
    </svg>
  );
}

/** The red pen circle round the step found wrong (drawn over a step's box). */
export function WrongRing() {
  return (
    <svg className="oo-ring" viewBox={`0 0 ${STEP_W} ${STEP_H}`} aria-hidden="true" preserveAspectRatio="none">
      <path d={penLoop(STEP_W / 2, STEP_H / 2, STEP_W / 2 - 10, STEP_H / 2 - 10, { seed: 7 })} fill="none" stroke="#c24a3c" strokeWidth={7} strokeLinecap="round" filter="url(#rough)" />
    </svg>
  );
}

/** The arcade menu's card for "¿Qué salió mal?": a little strip of three steps, the middle one circled in red pen. */
export function OopsCardArt() {
  const page = wobblyPoly([[0, 0], [244, 0], [244, 104], [0, 104]], { wob: 0.7, bow: 1.1, seed: 43 });
  return (
    <svg className="pp-fp-art" viewBox="0 0 260 190" aria-hidden="true">
      <g transform="translate(8 40)">
        <path d={page} transform="translate(5 6)" fill="rgba(84, 62, 38, 0.2)" />
        <path d={page} fill={PAPER} stroke={INK} strokeWidth={2.4} filter="url(#rough)" />
        {(['window_snow', 'swimsuit_on', 'snow_shiver'] as const).map((id, i) => (
          <svg key={id} x={8 + i * 78} y={8} width={72} height={88} viewBox={`0 0 ${STEP_W} ${STEP_H}`} preserveAspectRatio="xMidYMid slice">
            <StepArt id={id} />
            <rect x={1} y={1} width={STEP_W - 2} height={STEP_H - 2} fill="none" stroke={INK} strokeWidth={6} />
          </svg>
        ))}
        <path d={penLoop(122, 52, 50, 56, { seed: 4 })} fill="none" stroke="#c24a3c" strokeWidth={4.5} strokeLinecap="round" filter="url(#rough)" />
      </g>
    </svg>
  );
}
