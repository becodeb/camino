// The drawings of "Teclas del bosque": the forest (a band of leafy canopy
// across the top, two trunks, the meadow with its tufts), the seeds that
// fall with a letter (a samara: a round yellow seed with its papery wing),
// the leaves that fall with a word, the basket, the drawn keyboard's keys
// (as printed on a Latin-American Spanish keyboard: uppercase, with Ñ) and
// the bar's little instruction (a key, then the basket). The house style:
// one ink colour, a darker flat facet for volume, flat offset shadows, blue
// pen for what matters now, no gradients.

import { memo, useMemo } from 'react';
import { blob, leaf, penLoop, rng, wobblyLine, wobblyPoly } from '../ink/ink.js';
import { Bush, Mushroom, Tuft } from '../ui/forestArt';

const INK = '#2b2622';
const PEN = '#3d6ea5';
const SHADOW = 'rgba(84, 62, 38, 0.2)';

/** The scene's units: the viewBox is 0 0 1200 440; the ground line at GROUND. */
export const SCENE = { w: 1200, h: 440 } as const;
export const GROUND = 392;
/** Where the child stands and where the basket waits (feet / bottom on the ground). */
export const ME_AT = { x: 188, y: GROUND } as const;
export const BASKET_AT = { x: 322, y: GROUND } as const;
/** The basket is drawn this much bigger than its own units. */
export const BASKET_S = 1.15;
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
      {[[-230, 1], [380, 2], [560, 3], [820, 4], [990, 5], [1330, 6]].map(([x, s]) => <Tuft key={s} x={x} y={GROUND + 18 + (s % 2) * 10} seed={s + 60} s={1.3} />)}
      <Bush x={1040} y={GROUND + 2} s={1.3} seed={44} />
      <Mushroom x={1218} y={GROUND + 6} s={1.6} seed={3} />
      <Mushroom x={16} y={GROUND + 10} s={1.2} seed={5} />
    </g>
  );
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
      {[...text].map((ch, i) => (
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

// ------------------------------------------------------------------ the basket

/** A woven basket on the ground at (0, 0), with what was caught peeking over the rim. */
export const Basket = memo(function Basket({ n, words }: { n: number; words: boolean }) {
  const body = useMemo(() => wobblyPoly([[-62, -58], [62, -58], [48, 0], [-48, 0]], { wob: 1, bow: 2.4, seed: 12 }), []);
  const heap = Math.min(n, 7);
  const peeks: [number, number][] = [[-30, -62], [4, -66], [34, -60], [-12, -72], [20, -76], [-40, -70], [42, -72]];
  return (
    <g className="tk-basket" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx={6} cy={3} rx={70} ry={11} fill="url(#hatch)" />
      {/* the handle behind */}
      <path d="M-50,-60 C-46,-128 46,-128 50,-60" fill="none" stroke={INK} strokeWidth={9} />
      <path d="M-50,-60 C-46,-128 46,-128 50,-60" fill="none" stroke="#c9a57a" strokeWidth={5} />
      {peeks.slice(0, heap).map(([x, y], i) => words
        ? <path key={i} d={leaf(x - 16, y + 12, x + 18, y - 10, 16)} fill={LEAF_TONES[i % 3][0]} stroke={INK} strokeWidth={2} />
        : <path key={i} d={blob(x, y, 14, 12, { seed: i + 5, n: 8 })} fill="#f0d27a" stroke={INK} strokeWidth={2.2} />)}
      <Faceted id="tk-basket" d={body} light="#d8b88a" dark="#b8945f" shift={[-6, -3]} sw={3} />
      {[-40, -26, -12].map((y, i) => <path key={i} d={wobblyLine(-58 + i * 3.4, y, 58 - i * 3.4, y + 1, { bow: 1.4, seed: i + 20 })} fill="none" stroke={INK} strokeWidth={1.6} opacity={0.5} />)}
      {[-36, -12, 12, 36].map((x, i) => <path key={i} d={`M${x},-56 L${x * 0.78},-2`} stroke={INK} strokeWidth={1.4} opacity={0.4} />)}
      <path d={wobblyPoly([[-68, -64], [68, -64], [66, -54], [-66, -54]], { wob: 0.8, bow: 1, seed: 13 })} fill="#c9a57a" stroke={INK} strokeWidth={2.8} />
    </g>
  );
});

/** A seed that flies from the basket to the garden (every few catches). */
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

/** The long space bar under the letters (drawn, not a key of the game). */
export function SpaceBar() {
  const d = useMemo(() => ({
    lip: wobblyPoly([[3, 9], [297, 8], [298, 44], [2, 45]], { wob: 0.8, bow: 1.2, seed: 70 }),
    top: wobblyPoly([[6, 3], [294, 2.5], [294.5, 36], [5.5, 37]], { wob: 0.8, bow: 1.2, seed: 71 }),
  }), []);
  return (
    <svg className="tk-space" viewBox="0 0 300 48" preserveAspectRatio="none" aria-hidden="true">
      <path d={d.lip} fill="#d9ccb2" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <path d={d.top} fill="#f7f1e3" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
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

export function BasketIcon({ size = 46 }: { size?: number }) {
  return (
    <svg viewBox="-80 -134 160 146" width={size} height={size} aria-hidden="true" className="doodle">
      <Basket n={3} words={false} />
    </svg>
  );
}
