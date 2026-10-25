// "Tocá y pasa" (T47): the drawings, in the notebook's style (ink #2b2622
// boiled by #rough, flat warm colours, no text). The animals are the
// garden's critters (ui/critterArt.tsx). Everything reads without words:
//
// - the trigger "when I tap it" is a pointing hand (the ghost demo's own
//   hand) on the animal;
// - each effect is a picture of the animal doing it: high above its shadow
//   (jumps), in new colours with paint blobs (changes colour), in a burst of
//   paper confetti (throws confetti), behind a bush with its eyes peeking
//   (hides), in a swirl (spins);
// - the rule sign over each animal: the hand on it, the "then" mark, the
//   effects in order;
// - the two modes: building (a pencil on a sign) and playing (the hand
//   tapping the frog, with the tap's rings).

import type { CSSProperties, ReactNode } from 'react';
import { blob, penLoop, wobblyLine, wobblyPoly } from '../../ink/ink.js';
import { CritterArt } from '../../ui/critterArt';
import { HUES, type AnimalId, type EffectId } from './tap';

const INK = '#2b2622';
const PAPER = '#fbf7ee';
const PEN = '#3d6ea5';
const CONFETTI = ['#de8a56', '#c9574a', '#e7a3a0', '#7298c1', '#f0d27a', '#a4b86d'];

/** Each critter's own drawing, bare (its box measured in the browser): width, height, the centre's x. */
const BOX: Record<AnimalId, { w: number; h: number; cx: number }> = {
  rana: { w: 57, h: 40, cx: -0.5 }, zorro: { w: 67, h: 87, cx: 11.5 }, carpincho: { w: 104, h: 60, cx: -11 }, coati: { w: 108, h: 99, cx: 5 },
};
/** How big each critter is drawn in the meadow (about the same mass each), a little smaller with four. */
const SCENE_SCALE: Record<AnimalId, number> = { rana: 3.4, zorro: 2.0, carpincho: 2.1, coati: 1.75 };
export const animalScale = (a: AnimalId, n: number) => SCENE_SCALE[a] * (n >= 4 ? 0.88 : 1);
/** How tall an animal stands in the meadow (its head's top over its feet). */
export const animalTop = (a: AnimalId, n: number) => BOX[a].h * animalScale(a, n);

/** A critter standing on (0, 0), centred and scaled to fit a w × h box. */
export function FitCritter({ a, w, h, x = 0, y = 0, extra = '' }: { a: AnimalId; w: number; h: number; x?: number; y?: number; extra?: string }) {
  const k = Math.min(w / BOX[a].w, h / BOX[a].h);
  return <g transform={`translate(${x - BOX[a].cx * k} ${y}) ${extra} scale(${k})`}><CritterArt id={a} bare /></g>;
}
/** A critter in the meadow, centred on (0, 0). */
export function SceneCritter({ a, n }: { a: AnimalId; n: number }) {
  const k = animalScale(a, n);
  return <g transform={`translate(${-BOX[a].cx * k} 0) scale(${k})`}><CritterArt id={a} bare /></g>;
}

/** The hue filters for "changes colour" (HUES); put once in the scene's SVG. */
export function HueDefs() {
  return (
    <defs>
      {HUES.map((h, i) => i > 0 && (
        <filter key={h} id={`tp-hue-${i}`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="hueRotate" values={String(h)} />
          <feColorMatrix type="saturate" values="1.35" />
        </filter>
      ))}
    </defs>
  );
}
export const hueFilter = (i: number) => (i > 0 ? `url(#tp-hue-${i})` : undefined);

/** The ghost demo's pointing hand, its fingertip at (x, y), `s` times 64 units. */
export function TapHand({ x, y, s = 1, className }: { x: number; y: number; s?: number; className?: string }) {
  return (
    <g className={className} transform={`translate(${x} ${y}) scale(${s}) translate(-17 -5)`} filter="url(#rough)">
      <path
        d="M14,7 C14,2.6 20,2.6 20,7 L20,27 C20.5,24 26,24 26.5,27.5 C27,25 32.5,25 33,28.5 C33.5,26.5 38.5,27 38.5,31 L38.5,41 C38.5,51 32,57.5 24,57.5 C17,57.5 12.5,53 10.5,47 L5,37.5 C3.4,34.5 7,31.5 9.5,34.5 L14,39 Z"
        fill="#eeac7f" stroke={INK} strokeWidth={2.8} strokeLinejoin="round" strokeLinecap="round"
      />
      <path d="M26.5,28.5 L26.5,34 M33,29.5 L33,35 M16,19 C17,19.6 18,19.6 19,19" fill="none" stroke={INK} strokeWidth={1.7} strokeLinecap="round" />
    </g>
  );
}

/** The tap's rings round a fingertip at (x, y). */
function TapRings({ x, y, r = 14 }: { x: number; y: number; r?: number }) {
  return (
    <g fill="none" stroke={PEN} strokeWidth={2.4} strokeLinecap="round">
      <path d={wobblyLine(x - r * 1.5, y - r * 0.4, x - r * 0.9, y - r * 0.9, { seed: 2 })} />
      <path d={wobblyLine(x - r * 0.2, y - r * 1.6, x + r * 0.1, y - r * 0.9, { seed: 3 })} />
      <path d={wobblyLine(x + r * 1.5, y - r * 0.4, x + r * 0.9, y - r * 0.9, { seed: 4 })} />
    </g>
  );
}

/** A small round bush (in front of a hiding animal). */
export function Bush({ w = 120, seed = 1 }: { w?: number; seed?: number }) {
  const k = w / 120;
  return (
    <g filter="url(#rough)" strokeLinejoin="round">
      <path d={blob(-34 * k, -30 * k, 36 * k, 30 * k, { seed: seed + 1, n: 10, wob: 0.08 })} fill="#7f9658" stroke={INK} strokeWidth={2.6} />
      <path d={blob(34 * k, -30 * k, 36 * k, 30 * k, { seed: seed + 2, n: 10, wob: 0.08 })} fill="#7f9658" stroke={INK} strokeWidth={2.6} />
      <path d={blob(0, -48 * k, 42 * k, 36 * k, { seed: seed + 3, n: 11, wob: 0.08 })} fill="#93aa6e" stroke={INK} strokeWidth={2.6} />
      <path d={`M${-62 * k},0 L${62 * k},0`} stroke={INK} strokeWidth={2.4} />
      {[[-30, -46], [14, -64], [36, -30], [-6, -24]].map(([x, y], i) => <circle key={i} cx={x * k} cy={y * k} r={3.4 * k} fill="#e7a3a0" stroke={INK} strokeWidth={1.4} />)}
    </g>
  );
}

/** A burst of paper confetti round (0, 0), each bit flying out (CSS `tp-burst`). */
export function ConfettiBurst({ r = 120, n = 16, seed = 1 }: { r?: number; n?: number; seed?: number }) {
  return (
    <g className="tp-burst" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + seed;
        const d = r * (0.7 + ((i * 37 + seed * 11) % 10) / 22);
        return (
          <rect
            key={i} x={-7} y={-4} width={14} height={8} rx={2} fill={CONFETTI[i % CONFETTI.length]} stroke={INK} strokeWidth={1.6}
            style={{ '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d - 30}px`, '--rot': `${(i * 67) % 360}deg` } as CSSProperties}
          />
        );
      })}
    </g>
  );
}

// ------------------------------------------------------------------ the effect pictures (cards and signs)

export const EFFECT_W = 120, EFFECT_H = 100;

/** An effect as a picture of `animal` doing it, in a 120 × 100 box. */
export function EffectArt({ effect, animal = 'rana' }: { effect: EffectId; animal?: AnimalId }) {
  const critter = (x: number, y: number, extra = '', filter?: string, fit = 1) => (
    <g filter={filter}><FitCritter a={animal} w={70 * fit} h={60 * fit} x={x} y={y} extra={extra} /></g>
  );
  const ground = <path d={wobblyLine(8, 90, 112, 90, { seed: 5 })} stroke={INK} strokeWidth={2} opacity={0.5} fill="none" />;
  let body: ReactNode;
  switch (effect) {
    case 'jump':
      body = (
        <>
          {ground}
          <ellipse cx={60} cy={90} rx={20} ry={4.5} fill="rgba(84, 62, 38, 0.25)" />
          {[-14, 0, 14].map((dx, i) => <path key={i} d={`M${60 + dx},${78 - (i === 1 ? 6 : 0)} L${60 + dx},${64 - (i === 1 ? 6 : 0)}`} stroke={PEN} strokeWidth={2.6} strokeLinecap="round" />)}
          {critter(60, 58, '', undefined, 0.78)}
        </>
      );
      break;
    case 'colour':
      body = (
        <>
          {ground}
          {critter(60, 89, '', 'url(#tp-hue-2)', 0.9)}
          <path d={blob(18, 24, 11, 9, { seed: 3, n: 8 })} fill="#c9574a" stroke={INK} strokeWidth={1.8} />
          <path d={blob(102, 22, 11, 9, { seed: 4, n: 8 })} fill="#7298c1" stroke={INK} strokeWidth={1.8} />
          <path d={blob(100, 58, 9, 8, { seed: 5, n: 8 })} fill="#f0d27a" stroke={INK} strokeWidth={1.8} />
          <path d={blob(20, 60, 9, 8, { seed: 6, n: 8 })} fill="#b18bc4" stroke={INK} strokeWidth={1.8} />
        </>
      );
      break;
    case 'confetti':
      body = (
        <>
          {ground}
          {critter(60, 89, '', undefined, 0.85)}
          {[[16, 20, 20], [40, 10, -30], [82, 12, 40], [104, 26, -15], [10, 52, 60], [108, 56, -50], [60, 6, 10], [28, 34, 75], [94, 40, -70]].map(([x, y, r], i) => (
            <rect key={i} x={x - 6} y={y - 3.5} width={12} height={7} rx={1.6} fill={CONFETTI[i % CONFETTI.length]} stroke={INK} strokeWidth={1.4} transform={`rotate(${r} ${x} ${y})`} />
          ))}
        </>
      );
      break;
    case 'hide':
      body = (
        <>
          {ground}
          {critter(84, 90, '', undefined, 0.62)}
          <g transform="translate(54 92)"><Bush w={96} seed={7} /></g>
          {/* its eyes peeking out over the bush */}
          {[46, 60].map((x) => (
            <g key={x}>
              <ellipse cx={x} cy={34} rx={5.6} ry={6.4} fill="#fbf6ea" stroke={INK} strokeWidth={1.8} />
              <circle cx={x + 1.4} cy={35} r={3} fill={INK} />
            </g>
          ))}
        </>
      );
      break;
    case 'spin':
      body = (
        <>
          {ground}
          {critter(60, 86, 'rotate(-24 0 -20)', undefined, 0.8)}
          <path d={penLoop(60, 56, 46, 30, { seed: 9, turns: 0.85, start: -0.4 })} fill="none" stroke={PEN} strokeWidth={2.8} strokeLinecap="round" strokeDasharray="2 7" />
          <path d="M98,40 L108,50 L95,55" fill="none" stroke={PEN} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
      break;
  }
  return <g strokeLinejoin="round" strokeLinecap="round">{body}</g>;
}

/** An effect's card picture (a whole SVG). */
export function EffectPicture({ effect, animal }: { effect: EffectId; animal?: AnimalId }) {
  return (
    <svg className="tp-card-art" viewBox={`0 0 ${EFFECT_W} ${EFFECT_H}`} aria-hidden="true" overflow="visible">
      <HueDefs />
      <EffectArt effect={effect} animal={animal} />
    </svg>
  );
}

// ------------------------------------------------------------------ the rule sign over an animal

export const SIGN_SLOT = 66;

/** The sign's width for `slots` slots: the hand on the animal, the "then" mark, the slots. */
export const signWidth = (slots: number) => 96 + 34 + slots * (SIGN_SLOT + 6) + 12;

/** The paper sign on its stick (drawn from its bottom-centre at (0, 0)): `children` is what is on it. */
export function SignBoard({ w, h = 92, seed = 1, lit, children }: { w: number; h?: number; seed?: number; lit?: boolean; children?: ReactNode }) {
  const board = wobblyPoly([[-w / 2, -h - 24], [w / 2, -h - 24], [w / 2, -24], [-w / 2, -24]], { wob: 0.7, bow: 1.1, seed });
  return (
    <g>
      <path d="M0,-24 L0,0" stroke="#8a6440" strokeWidth={7} strokeLinecap="round" filter="url(#rough)" />
      <path d={board} transform="translate(4 5)" fill="rgba(84, 62, 38, 0.18)" />
      <path d={board} fill={lit ? '#fff4cf' : PAPER} stroke={lit ? PEN : INK} strokeWidth={lit ? 3.6 : 2.6} filter="url(#rough)" />
      <g transform={`translate(${-w / 2} ${-h - 24})`}>{children}</g>
    </g>
  );
}

/** The trigger "when I tap it": the animal small, the pointing hand on it. */
export function TriggerArt({ animal }: { animal: AnimalId }) {
  return (
    <g>
      <FitCritter a={animal} w={72} h={58} x={46} y={82} />
      <TapRings x={52} y={46} r={12} />
      <TapHand x={52} y={50} s={0.62} />
    </g>
  );
}

/** The dotted blue "then" mark (ThenArrow's, in the scene's units). */
export function ThenMark({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} fill="none" stroke={PEN} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M0,4 Q12,-4 22,2" strokeDasharray="1 6" />
      <path d="M18,-3 L25,2.5 L18,8" />
    </g>
  );
}

// ------------------------------------------------------------------ the meadow

export function Meadow({ w, h, ground }: { w: number; h: number; ground: number }) {
  return (
    <g aria-hidden="true">
      <rect className="tp-sky" x={-600} y={-400} width={w + 1200} height={ground + 400} />
      <g filter="url(#rough)">
        <circle cx={w - 120} cy={78} r={40} fill="#f0d27a" stroke={INK} strokeWidth={2.6} />
        <path d={blob(150, 70, 70, 22, { seed: 21, n: 10 })} fill="#fbf7ee" stroke={INK} strokeWidth={2.2} />
        <path d={blob(560, 50, 54, 18, { seed: 22, n: 10 })} fill="#fbf7ee" stroke={INK} strokeWidth={2.2} />
        <path d={`M-600,${ground - 40} Q${w * 0.25},${ground - 120} ${w * 0.55},${ground - 50} T${w + 600},${ground - 70} L${w + 600},${ground} L-600,${ground} Z`} fill="#c7d6a0" stroke={INK} strokeWidth={2.2} />
      </g>
      <path d={`M-600,${ground} L${w + 600},${ground} L${w + 600},${h + 300} L-600,${h + 300} Z`} fill="#a9bf78" />
      <path d={`M-600,${ground} Q${w / 2},${ground - 6} ${w + 600},${ground}`} fill="none" stroke={INK} strokeWidth={2.4} opacity={0.6} />
      <g stroke="#6d8250" strokeWidth={2} strokeLinecap="round" opacity={0.8}>
        {Array.from({ length: 26 }, (_, i) => {
          const x = 20 + i * 47 + ((i * 13) % 17);
          const y = ground + 18 + ((i * 29) % 30);
          return <path key={i} d={`M${x},${y} l-4,-10 M${x},${y} l3,-12 M${x},${y} l8,-8`} />;
        })}
      </g>
      {[[70, 24, '#e7a3a0'], [330, 40, '#f0d27a'], [690, 30, '#fbf7ee'], [880, 46, '#e7a3a0'], [1130, 26, '#f0d27a']].map(([x, dy, c], i) => (
        <g key={i} transform={`translate(${x} ${ground + (dy as number)})`} filter="url(#rough)">
          {[0, 72, 144, 216, 288].map((a) => <circle key={a} cx={Math.cos((a * Math.PI) / 180) * 6} cy={Math.sin((a * Math.PI) / 180) * 6} r={4.6} fill={c as string} stroke={INK} strokeWidth={1.4} />)}
          <circle r={3.4} fill="#de8a56" stroke={INK} strokeWidth={1.2} />
        </g>
      ))}
    </g>
  );
}

// ------------------------------------------------------------------ the two modes, and the menu card

/** Building: a pencil writing on a little sign. */
export function BuildModeArt() {
  return (
    <svg className="tp-mode-art" viewBox="0 0 90 80" aria-hidden="true" overflow="visible">
      <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
        <path d="M45,72 L45,52" stroke="#8a6440" strokeWidth={5} />
        <path d={wobblyPoly([[8, 14], [78, 14], [78, 54], [8, 54]], { wob: 0.6, seed: 3 })} fill={PAPER} stroke={INK} strokeWidth={2.4} />
        <path d="M16,34 L30,34 M38,34 L48,34" stroke={PEN} strokeWidth={2.4} strokeDasharray="1 5" />
        <rect x={54} y={22} width={18} height={24} rx={3} fill="#f0d27a" stroke={INK} strokeWidth={2} />
        <g transform="translate(62 48) rotate(-40)">
          <path d="M0,0 L10,-4 L60,-4 L60,6 L10,6 Z" fill="#f0d27a" stroke={INK} strokeWidth={2.2} />
          <path d="M0,0 L10,-4 L10,6 Z" fill="#e8c9a0" stroke={INK} strokeWidth={2} />
          <path d="M0,0 L3.6,-1.4 L3.6,2.2 Z" fill={INK} />
          <rect x={60} y={-4} width={9} height={10} rx={2} fill="#e7a3a0" stroke={INK} strokeWidth={2} />
        </g>
      </g>
    </svg>
  );
}

/** Playing: the hand tapping the frog, with the tap's rings. */
export function PlayModeArt() {
  return (
    <svg className="tp-mode-art" viewBox="0 0 90 80" aria-hidden="true" overflow="visible">
      <g transform="translate(42 76) scale(0.95)"><CritterArt id="rana" bare /></g>
      <TapRings x={48} y={38} r={12} />
      <TapHand x={48} y={42} s={0.62} />
    </svg>
  );
}

/** The arcade card: the meadow, the frog in a burst of confetti and the hand tapping it, the fox jumping. */
export function TapCardArt() {
  const page = wobblyPoly([[0, 0], [244, 0], [244, 150], [0, 150]], { wob: 0.7, bow: 1.1, seed: 47 });
  return (
    <svg className="pp-fp-art" viewBox="0 0 260 190" aria-hidden="true">
      <HueDefs />
      <g transform="translate(8 22)">
        <path d={page} transform="translate(5 6)" fill="rgba(84, 62, 38, 0.2)" />
        <clipPath id="tp-card-clip"><path d={page} /></clipPath>
        <g clipPath="url(#tp-card-clip)">
          <rect x={0} y={0} width={244} height={150} fill="#e9f0ef" />
          <path d="M0,108 Q80,84 150,104 T244,100 L244,150 L0,150 Z" fill="#a9bf78" />
          <g transform="translate(78 128) scale(1.25)"><CritterArt id="rana" bare /></g>
          <g transform="translate(78 92)"><ConfettiStill /></g>
          <ellipse cx={186} cy={128} rx={22} ry={5} fill="rgba(84, 62, 38, 0.25)" />
          <g transform="translate(186 92) scale(1.05)" filter="url(#tp-hue-1)"><CritterArt id="zorro" bare /></g>
          {[-12, 0, 12].map((dx) => <path key={dx} d={`M${186 + dx},120 L${186 + dx},108`} stroke={PEN} strokeWidth={2.4} strokeLinecap="round" />)}
        </g>
        <path d={page} fill="none" stroke={INK} strokeWidth={2.4} filter="url(#rough)" />
        <TapRings x={86} y={78} r={14} />
        <TapHand x={86} y={82} s={0.8} />
      </g>
    </svg>
  );
}

function ConfettiStill() {
  return (
    <g>
      {[[-46, -30, 20], [-20, -48, -30], [22, -46, 40], [48, -24, -15], [-56, 4, 60], [56, 8, -50], [0, -58, 10]].map(([x, y, r], i) => (
        <rect key={i} x={x - 6} y={y - 3.5} width={12} height={7} rx={1.6} fill={CONFETTI[i % CONFETTI.length]} stroke={INK} strokeWidth={1.4} transform={`rotate(${r} ${x} ${y})`} />
      ))}
    </g>
  );
}

/** The bar's drawn task: the hand on the frog, then the frog jumping. */
export function TapTaskArt() {
  return (
    <svg className="tp-task-art" viewBox="0 0 130 56" width={118} height={50} aria-hidden="true" overflow="visible">
      <g transform="translate(0 -40) scale(0.9)"><TriggerArt animal="rana" /></g>
      <ThenMark x={62} y={28} />
      <g transform="translate(88 2) scale(0.42)"><EffectArt effect="jump" /></g>
    </svg>
  );
}
