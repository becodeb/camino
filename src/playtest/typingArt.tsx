// The drawings of "Teclas del bosque": the forest (a band of leafy canopy
// across the top, two trunks, the meadow with its tufts), the seeds that
// fall with a letter (a samara: a round yellow seed with its papery wing),
// the leaves that fall with a word, the garden bed in front (the round's
// goal: a hole per thing to catch, a sprout in each one filled, the next one
// circled in pen; it blooms when it is full), the garland across the middle
// with its three star lamps (the golden streak), the butterfly that carries
// an item, the golden sparkle, the round medals of the bar, the "¡Listo!"
// sign, the drawn keyboard's keys (as printed on a Latin-American Spanish
// keyboard: uppercase, with Ñ, numbers when a command needs one) and the
// bar's little instruction (a key, then a sprout in the bed). The house
// style: one ink colour, a darker flat facet for volume, flat offset
// shadows, blue pen for what matters now, no gradients.

import { memo, useMemo } from 'react';
import { blob, leaf, penLoop, rng, wobblyLine, wobblyPoly } from '../ink/ink.js';
import { Bush, Mushroom, Tuft } from '../ui/forestArt';
import { Sprout } from './round2Art';

const INK = '#2b2622';
const PEN = '#3d6ea5';
const SHADOW = 'rgba(84, 62, 38, 0.2)';

/** The scene's units: the viewBox is 0 0 1200 476; the ground line at GROUND, the garden bed under it. */
export const SCENE = { w: 1200, h: 476 } as const;
export const GROUND = 392;
/** Where the child stands (feet on the ground). */
export const ME_AT = { x: 170, y: GROUND } as const;
/** The holes of the garden bed: their centre line, and from where to where they spread. */
export const BED_Y = 436;
const BED_X: [number, number] = [320, 1120];
/** The garland across the middle of the fall: caught above it is caught early. */
export const MID_Y = 244;
/** A seed with its letter, drawn this much bigger than its own units. */
export const SEED_S = 1.3;

type Pt = [number, number];

/** A shape with its flat facet: the dark tone, the light tone over it shifted up-left, the outline on top. */
function Faceted({ id, d, light, dark, shift = [-5, -4], sw = 2.8 }: { id: string; d: string; light: string; dark: string; shift?: Pt; sw?: number }) {
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

// ------------------------------------------------------------------ the forest

/** The canopy's clumps across the top (drawn wider than the viewBox: a wide screen shows more forest, never an edge). */
const CLUMPS: [number, number, number, number][] = [
  [-360, 12, 150, 96], [-190, 38, 130, 84], [-40, 16, 150, 100], [120, 50, 120, 74], [250, 6, 150, 88], [410, 42, 130, 70],
  [560, 0, 160, 84], [720, 38, 130, 72], [870, 4, 150, 88], [1020, 46, 130, 76], [1160, 12, 150, 100], [1320, 40, 140, 86], [1480, 10, 150, 96],
];

/** The canopy band and the two trunks holding it: the seeds and the leaves come down from here. */
export const Canopy = memo(function Canopy() {
  const art = useMemo(() => {
    const r = rng(17);
    const clumps = CLUMPS.map(([x, y, rx, ry], i) => ({ d: blob(x, y, rx, ry, { wob: 0.1, n: 11, seed: 90 + i }), marks: [0, 1, 2].map(() => [x + (r() - 0.5) * rx * 1.1, y + (r() - 0.1) * ry * 0.6] as Pt) }));
    const trunk = (x: number, s: number) => wobblyPoly([[x - 30, GROUND + 4], [x + 30, GROUND + 4], [x + 20, 60], [x - 22, 60]], { wob: 1.2, bow: 2.4, seed: s });
    return { clumps, trunks: [trunk(64, 3), trunk(1146, 5)] };
  }, []);
  return (
    <g className="tk-canopy" strokeLinecap="round" strokeLinejoin="round">
      {[64, 1146].map((x, i) => <ellipse key={`sh${i}`} cx={x + 8} cy={GROUND + 4} rx={64} ry={10} fill="url(#hatch)" />)}
      {art.trunks.map((d, i) => <Faceted key={`tr${i}`} id={`tk-tr${i}`} d={d} light="#b08560" dark="#8d6844" shift={[-6, 0]} sw={2.8} />)}
      {/* a branch off each trunk */}
      <path d="M86,170 C120,150 150,146 176,120" fill="none" stroke={INK} strokeWidth={9} />
      <path d="M86,170 C120,150 150,146 176,120" fill="none" stroke="#b08560" strokeWidth={5} />
      <path d="M1124,190 C1090,168 1066,160 1040,132" fill="none" stroke={INK} strokeWidth={9} />
      <path d="M1124,190 C1090,168 1066,160 1040,132" fill="none" stroke="#b08560" strokeWidth={5} />
      {art.clumps.map((c, i) => (
        <g key={i}>
          <Faceted id={`tk-cl${i}`} d={c.d} light={i % 3 === 1 ? '#b4c47f' : '#a4b86d'} dark={i % 3 === 1 ? '#98ab66' : '#879b52'} shift={[-3, -12]} sw={2.8} />
          {c.marks.map(([mx, my], k) => <path key={k} d={`M${(mx - 7).toFixed(1)},${my.toFixed(1)} q7,7 14,0`} fill="none" stroke={INK} strokeWidth={1.8} opacity={0.45} />)}
        </g>
      ))}
    </g>
  );
});

/** The meadow under the trees: the ground line, tufts, a bush and a mushroom. */
export const Meadow = memo(function Meadow() {
  const ground = useMemo(() => wobblyLine(-420, GROUND + 2, 1620, GROUND - 1, { bow: 3, seed: 8, segs: 9, jit: 1.6 }), []);
  return (
    <g className="tk-meadow">
      <rect x={-420} y={GROUND} width={2040} height={SCENE.h} fill="#eef0da" />
      <path d={ground} fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      {[[-230, 1], [-90, 2], [1260, 3], [1400, 6]].map(([x, s]) => <Tuft key={s} x={x} y={GROUND + 22 + (s % 2) * 12} seed={s + 60} s={1.3} />)}
      <Mushroom x={1218} y={GROUND + 6} s={1.6} seed={3} />
      <Mushroom x={16} y={GROUND + 10} s={1.2} seed={5} />
    </g>
  );
});

/** The bush by the right trunk, drawn over the critters that peek from behind it. */
export const FrontBush = memo(function FrontBush() {
  return <g className="tk-front-bush"><Bush x={1040} y={GROUND + 2} s={1.3} seed={44} /></g>;
});

// ------------------------------------------------------------------ what falls

/**
 * A samara seed carrying a letter: the round yellow seed with the letter big
 * and lowercase, its papery wing up to the right, and (1ro) the letter as the
 * keyboard prints it, small, in blue pen. Centred on the seed (0, 0).
 */
export const LetterSeed = memo(function LetterSeed({ letter, upper, seed }: { letter: string; upper: boolean; seed: number }) {
  const art = useMemo(() => ({
    body: blob(0, 0, 46, 42, { wob: 0.05, n: 10, seed }),
    wing: leaf(16, -34, 92, -104, 34),
    tagLip: wobblyPoly([[-98, 18], [-60, 17], [-59, 55], [-99, 56]], { wob: 0.6, bow: 0.8, seed: seed + 2 }),
    tagTop: wobblyPoly([[-96, 13], [-62, 12.5], [-61.5, 48], [-96.5, 49]], { wob: 0.6, bow: 0.8, seed: seed + 3 }),
  }), [seed]);
  return (
    <g className="tk-seed-art" strokeLinecap="round" strokeLinejoin="round">
      <path d={art.wing} fill="#dfe3b8" stroke={INK} strokeWidth={2.6} />
      <path d="M22,-42 C44,-62 64,-80 86,-100 M38,-58 L32,-74 M56,-74 L50,-90 M50,-66 L62,-60 M68,-82 L80,-76" fill="none" stroke={INK} strokeWidth={1.4} opacity={0.4} />
      <path d={art.body} transform="translate(4 6)" fill={SHADOW} />
      <Faceted id={`tk-sd${seed}`} d={art.body} light="#f0d27a" dark="#dcb95a" shift={[-6, -6]} sw={3} />
      <text x={0} y={17} textAnchor="middle" className="tk-letter">{letter}</text>
      {upper && (
        // the letter as the keyboard prints it: a little key tied to the seed with a string
        <g className="tk-tag">
          <path d="M-40,12 C-50,10 -56,12 -62,18" fill="none" stroke={INK} strokeWidth={1.8} />
          <path d={art.tagLip} fill="#d9ccb2" stroke={INK} strokeWidth={2.2} />
          <path d={art.tagTop} fill="#fbf7ee" stroke={INK} strokeWidth={2.2} />
          <text x={-79} y={40} textAnchor="middle" className="tk-upper">{letter.toUpperCase()}</text>
        </g>
      )}
    </g>
  );
});

/** A leaf's tones (green, autumn orange, yellow), one per word in turn. */
const LEAF_TONES: [string, string][] = [['#cfdcaa', '#b4c47f'], ['#f2c29f', '#e0a57c'], ['#f5e2a6', '#e4c877']];
export const LETTER_W = 34;
export const leafLength = (text: string) => LETTER_W * text.length + 140;

/**
 * A leaf carrying a word, typed letter by letter: the letters already typed
 * in blue pen, underlined; the next one on a yellow highlight; the rest in
 * ink. Centred on (0, 0).
 */
export const WordLeaf = memo(function WordLeaf({ text, pos, tone }: { text: string; pos: number; tone: number }) {
  const L = leafLength(text), H = 82;
  const d = useMemo(() => {
    const x0 = -L / 2, x1 = L / 2;
    return `M${x0},4 C${x0 + L * 0.12},${-H} ${x1 - L * 0.28},${-H - 6} ${x1},-6 C${x1 - L * 0.24},${H * 0.92} ${x0 + L * 0.16},${H} ${x0},4 Z`;
  }, [L]);
  const [light, dark] = LEAF_TONES[tone % LEAF_TONES.length];
  const x = (i: number) => (i - (text.length - 1) / 2) * LETTER_W;
  return (
    <g className="tk-leaf-art" strokeLinecap="round" strokeLinejoin="round">
      <path d={`M${-L / 2},4 C${-L / 2 - 16},10 ${-L / 2 - 26},26 ${-L / 2 - 18},40`} fill="none" stroke={INK} strokeWidth={3} />
      <path d={d} transform="translate(5 7)" fill={SHADOW} />
      <Faceted id={`tk-lf${text}${tone}`} d={d} light={light} dark={dark} shift={[-4, -9]} sw={3} />
      {[-0.36, 0.36].map((k, i) => <path key={i} d={`M${L * k},${-44 + i * 6} q10,10 22,10 M${L * k - 6},${46 - i * 4} q12,-8 24,-8`} fill="none" stroke={INK} strokeWidth={1.4} opacity={0.3} />)}
      {pos < text.length && <path d={blob(x(pos), 0, 21, 30, { wob: 0.06, n: 9, seed: pos + 3 })} fill="#fbeaa8" stroke={PEN} strokeWidth={2.2} className="tk-next-mark" />}
      {/* the space between a command and its number: a little drawn bar, like the keyboard's */}
      {text[pos] === ' ' && <path d={`M${x(pos) - 13},6 L${x(pos) - 13},16 L${x(pos) + 13},16 L${x(pos) + 13},6`} fill="none" stroke={PEN} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />}
      {[...text].map((ch, i) => ch === ' ' ? null : (
        <text key={i} x={x(i)} y={17} textAnchor="middle" className={`tk-word-letter${i < pos ? ' is-typed' : i === pos ? ' is-next' : ''}`}>{ch}</text>
      ))}
      {pos > 0 && <path d={wobblyLine(x(0) - 15, 30, x(pos - 1) + 15, 29, { bow: 1.2, seed: pos, segs: Math.max(1, pos) })} fill="none" stroke={PEN} strokeWidth={3.2} />}
    </g>
  );
});

/** Where something that fell rests a moment: a small puff at its feet. */
export function Puff() {
  return <path className="tk-puff" d="M-40,6 l-12,-6 M-30,-2 l-8,-12 M40,6 l12,-6 M30,-2 l8,-12" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" opacity={0.6} />;
}

// ------------------------------------------------------------------ the garden bed

/** Where hole `i` of `goal` is: spread along the bed, never further apart than 150 units, centred. */
export function holeX(i: number, goal: number): number {
  const [a, b] = BED_X;
  if (goal <= 1) return (a + b) / 2;
  const gap = Math.min(150, (b - a) / (goal - 1));
  const w = gap * (goal - 1);
  return (a + b) / 2 - w / 2 + gap * i;
}

/** One hole's state: empty, the next one (circled), filled (a sprout), golden (a golden seed's sprout). */
export type HoleState = 'empty' | 'next' | 'filled' | 'golden';

/**
 * The garden bed in front of the meadow: a long raised strip of soil with
 * `holes.length` holes. A filled hole has its seed half buried and a sprout
 * (a golden seed shines); the next hole is circled in blue pen; `bloom`
 * (the round is full) turns every sprout into a plant in flower.
 */
export const GardenBed = memo(function GardenBed({ holes, bloom }: { holes: HoleState[]; bloom: boolean }) {
  const goal = holes.length;
  const art = useMemo(() => {
    const x0 = BED_X[0] - 120, x1 = BED_X[1] + 70;
    return {
      top: wobblyPoly([[x0, BED_Y - 26], [x1, BED_Y - 28], [x1 + 14, BED_Y + 26], [x0 - 12, BED_Y + 28]], { wob: 1.4, bow: 2.6, seed: 31 }),
      edge: wobblyLine(x0 - 10, BED_Y + 30, x1 + 12, BED_Y + 28, { bow: 2, seed: 32, segs: 6, jit: 1.2 }),
      clods: Array.from({ length: 14 }, (_, i) => [x0 + 40 + i * ((x1 - x0 - 80) / 13), BED_Y + (i % 2 ? 14 : -16)] as Pt),
    };
  }, []);
  return (
    <g className={`tk-bed${bloom ? ' is-bloom' : ''}`} strokeLinecap="round" strokeLinejoin="round" data-goal={goal} data-filled={holes.filter((h) => h === 'filled' || h === 'golden').length}>
      <path d={art.top} transform="translate(5 6)" fill={SHADOW} />
      <Faceted id="tk-bed" d={art.top} light="#b98d63" dark="#9c7450" shift={[-4, -6]} sw={3} />
      <path d={art.edge} fill="none" stroke={INK} strokeWidth={2} opacity={0.35} />
      {art.clods.map(([cx, cy], i) => <path key={i} d={`M${cx - 6},${cy} q6,-5 12,0`} fill="none" stroke={INK} strokeWidth={1.6} opacity={0.35} />)}
      {holes.map((h, i) => {
        const x = holeX(i, goal);
        return (
          <g key={`${goal}-${i}`} transform={`translate(${x} ${BED_Y})`} className={`tk-hole is-${h}`} data-hole={i}>
            <ellipse cx={0} cy={2} rx={27} ry={10} fill="#5e4632" stroke={INK} strokeWidth={2.4} />
            {(h === 'filled' || h === 'golden') && (
              <g className="tk-hole-plant">
                <ellipse cx={0} cy={-1} rx={13} ry={9} fill={h === 'golden' ? '#f7c948' : '#f0d27a'} stroke={INK} strokeWidth={2.4} />
                <g transform="translate(0 -6) scale(1.5)">
                  <g className="tk-hole-sprout"><Sprout size={bloom ? 3 : 2} seed={i + 3} /></g>
                </g>
                {h === 'golden' && <Glint x={0} y={-18} s={1.2} />}
              </g>
            )}
            {h === 'next' && <path className="tk-hole-ring" d={penLoop(0, 0, 38, 20, { seed: i + 9 })} fill="none" stroke={PEN} strokeWidth={3.2} />}
          </g>
        );
      })}
    </g>
  );
});

/** Three little four-point sparkles in gold: what still shines (a golden seed, an item still above the garland). */
export function Glint({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const star = (cx: number, cy: number, r: number) => `M${cx},${cy - r} Q${cx + r * 0.18},${cy - r * 0.18} ${cx + r},${cy} Q${cx + r * 0.18},${cy + r * 0.18} ${cx},${cy + r} Q${cx - r * 0.18},${cy + r * 0.18} ${cx - r},${cy} Q${cx - r * 0.18},${cy - r * 0.18} ${cx},${cy - r} Z`;
  return (
    <g className="tk-glint" transform={`translate(${x} ${y}) scale(${s})`} strokeLinejoin="round">
      <path d={star(-26, -14, 11)} fill="#f7c948" stroke={INK} strokeWidth={1.8} />
      <path d={star(24, -24, 8)} fill="#f7c948" stroke={INK} strokeWidth={1.6} />
      <path d={star(30, 6, 6)} fill="#f7c948" stroke={INK} strokeWidth={1.4} />
    </g>
  );
}

/** A burst of gold sparkles where a golden seed was born. */
export function Sparkle() {
  return (
    <g className="tk-sparkle" strokeLinecap="round">
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <path key={i} d={`M${Math.cos(a) * 30},${Math.sin(a) * 30} L${Math.cos(a) * 54},${Math.sin(a) * 54}`} stroke={i % 2 ? '#d9a520' : INK} strokeWidth={i % 2 ? 4 : 2.6} />;
      })}
      <Glint x={0} y={8} s={1.3} />
    </g>
  );
}

// ------------------------------------------------------------------ the garland and its star lamps

/** A five-point star, wobbly, centred on (0, 0). */
function starPath(r: number, seed: number) {
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = (i % 2 ? r * 0.48 : r) * (1 + ((seed * 7 + i * 3) % 5 - 2) * 0.02);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return wobblyPoly(pts, { wob: 0.6, bow: 0.6, seed });
}

/**
 * A garland strung across the middle of the fall, a few leaves along it;
 * at its left end three star lamps light up one by one with the catches
 * made above it (the golden streak). `n` lamps lit; `flash` when the third
 * lit and made a golden seed.
 */
export const Garland = memo(function Garland({ n, flash }: { n: number; flash: boolean }) {
  const art = useMemo(() => ({
    line: wobblyLine(250, MID_Y - 4, 1150, MID_Y + 2, { bow: 9, seed: 41, segs: 8, jit: 2 }),
    leaves: Array.from({ length: 11 }, (_, i) => 520 + i * 60),
    stars: [0, 1, 2].map((i) => starPath(17, i + 4)),
  }), []);
  return (
    <g className={`tk-garland${flash ? ' is-flash' : ''}`} strokeLinecap="round" strokeLinejoin="round" data-streak={n}>
      <path d={art.line} fill="none" stroke={INK} strokeWidth={4.4} />
      <path d={art.line} fill="none" stroke="#98ab66" strokeWidth={2} />
      {art.leaves.map((x, i) => <path key={i} d={leaf(x, MID_Y + 1, x + (i % 2 ? 16 : -14), MID_Y + (i % 2 ? 18 : -16), 7)} fill={i % 3 ? '#a4b86d' : '#b4c47f'} stroke={INK} strokeWidth={1.8} />)}
      {art.stars.map((d, i) => (
        <g key={i} transform={`translate(${312 + i * 52} ${MID_Y + 4})`}>
          <g className={`tk-lamp${i < n ? ' is-lit' : ''}`}>
            <path d="M0,-22 L0,-14" stroke={INK} strokeWidth={2} />
            <path d={d} transform="translate(3 4)" fill={SHADOW} />
            <path d={d} className="tk-lamp-star" stroke={INK} strokeWidth={2.4} />
          </g>
        </g>
      ))}
    </g>
  );
});

// ------------------------------------------------------------------ the butterfly

/** A butterfly carrying an item: two pairs of wings behind it that flap, its body and feelers on top. */
export function ButterflyWings({ y = -54 }: { y?: number }) {
  return (
    <g className="tk-butterfly" transform={`translate(0 ${y})`} strokeLinecap="round" strokeLinejoin="round">
      <g className="tk-wing tk-wing-l">
        <path d="M-2,-2 C-30,-44 -70,-38 -58,-6 C-50,12 -20,8 -2,0 Z" fill="#b9cde6" stroke={INK} strokeWidth={2.4} />
        <path d="M-2,2 C-34,10 -50,36 -26,40 C-12,42 -4,22 -2,4 Z" fill="#e7a3a0" stroke={INK} strokeWidth={2.4} />
        <circle cx={-38} cy={-16} r={6} fill="#fbf7ee" stroke={INK} strokeWidth={1.6} />
      </g>
      <g className="tk-wing tk-wing-r">
        <path d="M2,-2 C30,-44 70,-38 58,-6 C50,12 20,8 2,0 Z" fill="#b9cde6" stroke={INK} strokeWidth={2.4} />
        <path d="M2,2 C34,10 50,36 26,40 C12,42 4,22 2,4 Z" fill="#e7a3a0" stroke={INK} strokeWidth={2.4} />
        <circle cx={38} cy={-16} r={6} fill="#fbf7ee" stroke={INK} strokeWidth={1.6} />
      </g>
      <path d="M-5,18 L-9,34 M5,18 L9,34" fill="none" stroke={INK} strokeWidth={2} />
      <path d="M0,-18 C0,-6 0,10 0,22" stroke={INK} strokeWidth={6} />
      <path d="M0,-18 C-4,-30 -10,-36 -14,-38 M0,-18 C4,-30 10,-36 14,-38" fill="none" stroke={INK} strokeWidth={2} />
    </g>
  );
}

// ------------------------------------------------------------------ the bar: the rounds

/**
 * The three rounds as wooden medals along a short pen path: a finished one
 * golden with a flower, the one being played circled in pen with a sprout,
 * those to come only a dashed outline with their dots (one, two, three).
 */
export function RoundMedals({ done, here, box }: { done: number; here: number; box?: { x: number; y: number; w: number } }) {
  return (
    <svg className="tk-medals" viewBox="0 0 156 52" aria-hidden="true" {...(box ? { x: box.x, y: box.y, width: box.w, height: (box.w * 52) / 156 } : {})}>
      <g filter="url(#rough)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M30,30 L126,30" fill="none" stroke={PEN} strokeWidth={2.2} strokeDasharray="1 6" opacity={0.7} />
        {[0, 1, 2].map((i) => {
          const x = 26 + i * 52;
          const isDone = i < done;
          const isHere = i === here && !isDone;
          return (
            <g key={i} transform={`translate(${x} 28)`}><g className={`tk-medal${isDone ? ' is-done' : isHere ? ' is-here' : ''}`}>
              {isDone || isHere ? <>
                <circle cx={2} cy={3} r={17} fill={SHADOW} stroke="none" />
                <circle r={17} fill={isDone ? '#f0d27a' : PAPER} stroke={INK} strokeWidth={2.4} />
                {isDone && <circle r={12} fill="none" stroke="#c99a35" strokeWidth={2} />}
                <g transform={`translate(0 ${isDone ? 12 : 10}) scale(${isDone ? 0.5 : 0.62})`}><Sprout size={isDone ? 3 : 1} seed={i + 2} /></g>
              </> : <>
                <circle r={16} fill="none" stroke={INK} strokeWidth={2} strokeDasharray="5 5" opacity={0.55} />
                {Array.from({ length: i + 1 }, (_, k) => <circle key={k} cx={(k - i / 2) * 9} cy={0} r={3} fill={INK} opacity={0.5} />)}
              </>}
              {isHere && <path d={penLoop(0, 0, 25, 23, { seed: i + 3 })} fill="none" stroke={PEN} strokeWidth={2.8} />}
            </g></g>
          );
        })}
      </g>
    </svg>
  );
}

const PAPER = '#fbf7ee';

/** Between two rounds, in the middle of the scene: the three medals big on a taped paper card (the new one circled). */
export function RoundCard({ done, here }: { done: number; here: number }) {
  const card = useMemo(() => wobblyPoly([[-250, -96], [250, -100], [254, 96], [-246, 100]], { wob: 1.2, bow: 2, seed: 61 }), []);
  return (
    <g className="tk-round-card" strokeLinejoin="round">
      <path d={card} transform="translate(8 10)" fill={SHADOW} />
      <path d={card} fill={PAPER} stroke={INK} strokeWidth={2.8} />
      <path d="M-40,-112 L40,-106 L36,-86 L-44,-92 Z" fill="#e2d3a8" opacity={0.85} />
      <RoundMedals done={done} here={here} box={{ x: -222, y: -74, w: 444 }} />
    </g>
  );
}

/** The bar's instruction, the end of it: a sprout in its hole of the bed. */
export function BedIcon({ size = 46 }: { size?: number }) {
  return (
    <svg viewBox="-34 -58 68 72" width={size} height={size} aria-hidden="true" className="doodle">
      <g filter="url(#rough)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M-32,-2 L32,-4 L30,12 L-30,13 Z" fill="#b98d63" stroke={INK} strokeWidth={2.4} />
        <ellipse cx={0} cy={0} rx={18} ry={6} fill="#5e4632" stroke={INK} strokeWidth={2.2} />
        <ellipse cx={0} cy={-2} rx={9} ry={6} fill="#f0d27a" stroke={INK} strokeWidth={2} />
        <g transform="translate(0 -6) scale(1.1)"><Sprout size={2} seed={4} /></g>
      </g>
    </svg>
  );
}

// ------------------------------------------------------------------ the finale

/** "¡Listo!" on a wooden sign on its post, standing on the meadow at (0, 0). */
export function ListoSign() {
  const art = useMemo(() => ({
    board: wobblyPoly([[-150, -210], [150, -214], [156, -104], [-154, -100]], { wob: 1.2, bow: 2.4, seed: 51 }),
    post: wobblyPoly([[-12, -104], [12, -104], [11, 4], [-11, 4]], { wob: 0.8, bow: 1, seed: 52 }),
  }), []);
  return (
    <g className="tk-listo-sign" strokeLinecap="round" strokeLinejoin="round">
      <Faceted id="tk-listo-post" d={art.post} light="#b08560" dark="#8d6844" shift={[-4, 0]} />
      <path d={art.board} transform="translate(7 8)" fill={SHADOW} />
      <Faceted id="tk-listo-board" d={art.board} light="#e3c497" dark="#c9a57a" shift={[-6, -6]} sw={3.2} />
      {[-150, 150].map((x) => <circle key={x} cx={x * 0.86} cy={-196} r={4} fill={INK} />)}
      <text x={0} y={-136} textAnchor="middle" className="tk-listo-text">¡Listo!</text>
    </g>
  );
}

/** A seed that flies from the bed to the pouch in the bar (every few holes filled). */
export function FlyingSeed() {
  return (
    <g className="tk-fly-seed" strokeLinecap="round" strokeLinejoin="round">
      <path d="M0,-6 C-2,-16 2,-22 0,-30" fill="none" stroke={INK} strokeWidth={2.6} />
      <path d={leaf(0, -24, -18, -34, 7)} fill="#a4b86d" stroke={INK} strokeWidth={2.2} />
      <path d={leaf(0, -26, 17, -37, 7)} fill="#a4b86d" stroke={INK} strokeWidth={2.2} />
      <path d={blob(0, 2, 16, 14, { seed: 3, n: 9 })} fill="#f0d27a" stroke={INK} strokeWidth={2.6} />
    </g>
  );
}

// ------------------------------------------------------------------ the keyboard

/** One key as printed (uppercase), a paper cap on its darker lip. */
export const KeyCap = memo(function KeyCap({ ch }: { ch: string }) {
  const s = ch.charCodeAt(0);
  const art = useMemo(() => ({
    lip: wobblyPoly([[3, 9], [57, 8], [58, 58], [2, 59]], { wob: 0.6, bow: 0.8, seed: s }),
    top: wobblyPoly([[6, 3], [54, 2.5], [54.5, 49], [5.5, 50]], { wob: 0.7, bow: 0.9, seed: s + 1 }),
  }), [s]);
  return (
    <svg className="tk-cap" viewBox="0 0 60 62" aria-hidden="true">
      <path className="tk-cap-lip" d={art.lip} stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
      <path className="tk-cap-top" d={art.top} stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
      <text x={30} y={36} textAnchor="middle" className="tk-cap-ch">{ch.toUpperCase()}</text>
    </svg>
  );
});

/** The pen ring that circles the key to press. */
export function KeyRing({ seed }: { seed: number }) {
  return (
    <svg className="tk-ring" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d={penLoop(50, 50, 45, 44, { seed })} fill="none" stroke={PEN} strokeWidth={3.4} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** The long space bar under the letters (a key of the game only for a command and its number). */
export function SpaceBar() {
  const d = useMemo(() => ({
    lip: wobblyPoly([[3, 9], [297, 8], [298, 44], [2, 45]], { wob: 0.8, bow: 1.2, seed: 70 }),
    top: wobblyPoly([[6, 3], [294, 2.5], [294.5, 36], [5.5, 37]], { wob: 0.8, bow: 1.2, seed: 71 }),
  }), []);
  return (
    <svg className="tk-space" viewBox="0 0 300 48" preserveAspectRatio="none" aria-hidden="true">
      <path className="tk-cap-lip" d={d.lip} stroke={INK} strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <path className="tk-cap-top" d={d.top} stroke={INK} strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** The bar's instruction, drawn: a key being pressed (then the basket). */
export function KeyPressIcon({ size = 46 }: { size?: number }) {
  return (
    <svg viewBox="-4 -14 60 70" width={size} height={size} aria-hidden="true" className="doodle">
      <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
        <path d="M3,15 L51,14 L52,52 L2,53 Z" fill="#dcb95a" stroke={INK} strokeWidth={2.4} />
        <path d="M5,9 L49,8.5 L49.5,44 L4.5,45 Z" fill="#f0d27a" stroke={INK} strokeWidth={2.4} />
        <text x={27} y={36} textAnchor="middle" className="tk-icon-ch">a</text>
        <path d="M18,-4 L20,4 M36,-4 L34,4 M27,-8 L27,2" stroke={PEN} strokeWidth={2.4} />
      </g>
    </svg>
  );
}
