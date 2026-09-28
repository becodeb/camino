// The garden's critters (1ro's list), sent by six bosses: a coatí, a barn owl
// on its post, a fox, a woodpecker on its trunk, a capybara, a frog on its
// lily pad. Each follows the characters' recipe (docs/style-guide.md §5): a
// main body and a few pieces that make the silhouette, one ink outline, a
// darker flat facet, finer inner lines, and the same eyes (a cream ellipse, an
// ink pupil, a curve when closed). They live without words: they blink, look
// around, and each has its own small motion (the coatí's tail sways, the owl
// tilts its head, the fox swishes its tail and twitches an ear, the
// woodpecker drums its trunk, the capybara dozes, the frog's throat pulses).
// The motions are CSS (ui/motivation.css) on inner groups, so the position
// stays in the `transform` attribute (the SVG trap of docs/style-guide.md §6).
// Drawn standing on (0, 0), about as big as the child's character.

import { memo, type ReactNode } from 'react';
import { blob, smoothClosed, wobblyLine, wobblyPoly } from '../ink/ink.js';
import type { CritterId } from '../curriculum/motivation';

const INK = '#2b2622';
const CREAM = '#fbf6ea';
const SW = 2.6;

/** A shape with its darker flat facet (clip, the dark tone, the light one shifted), outlined. */
function Faceted({ id, d, light, dark, shift = [-4, -4], sw = SW }: { id: string; d: string; light: string; dark: string; shift?: [number, number]; sw?: number }) {
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

/**
 * An eye as the characters have it: a cream ellipse and an ink pupil that
 * looks around (`.critter-look`), and the curve it becomes for a blink
 * (`.critter-open` / `.critter-shut` take turns).
 */
function Eye({ x, y, rx, ry, pr, sleepy }: { x: number; y: number; rx: number; ry: number; pr: number; sleepy?: boolean }) {
  return (
    <g>
      <g className="critter-open">
        <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={CREAM} stroke={INK} strokeWidth={2.2} />
        <g className="critter-look"><circle cx={x} cy={y + 0.4} r={pr} fill={INK} /></g>
        {sleepy && <path d={`M${x - rx - 0.5},${y - 0.6} Q${x},${y - ry * 1.3} ${x + rx + 0.5},${y - 0.6} Z`} fill="#8a6440" stroke={INK} strokeWidth={2} />}
      </g>
      <path className="critter-shut" d={`M${x - rx},${y - 0.5} Q${x},${y + ry * 0.85} ${x + rx},${y - 0.5}`} fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
    </g>
  );
}

// ------------------------------------------------------------------ the six

/** The coatí (sheet 2): a brown body on short legs, a long nose turned up, its ringed tail held high. Faces right. */
function Coati({ bare }: { bare?: boolean }) {
  const body = blob(-6, -26, 31, 16, { seed: 3, n: 11, wob: 0.04 });
  const head = smoothClosed([[10, -44], [26, -47], [40, -40], [56, -30], [54, -25], [36, -22], [16, -21], [8, -30]]);
  const tail = smoothClosed([[-30, -34], [-36, -60], [-40, -86], [-44, -98], [-49, -96], [-47, -82], [-44, -58], [-38, -30]]);
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {!bare && <ellipse cx={0} cy={1} rx={40} ry={6} fill="url(#hatch)" />}
      <g className="critter-tail">
        <Faceted id="coati-tail" d={tail} light="#9a7458" dark="#7c5a42" shift={[3, 0]} sw={2.4} />
        {[-44, -56, -68, -80, -91].map((y, i) => <path key={i} d={wobblyLine(-45 + (y + 30) * 0.05, y, -34 + (y + 30) * 0.13, y + 3, { bow: 0.8, seed: i + 5 })} stroke="#e8d6b8" strokeWidth={4.4} fill="none" />)}
        <path d={tail} fill="none" stroke={INK} strokeWidth={2.4} />
      </g>
      {[[-28, -12], [-16, -10], [4, -10], [14, -12]].map(([x, y], i) => <path key={i} d={`M${x},${y} L${x - 1},-1`} stroke={INK} strokeWidth={9} />)}
      {[[-28, -12], [-16, -10], [4, -10], [14, -12]].map(([x, y], i) => <path key={`l${i}`} d={`M${x},${y} L${x - 1},-1`} stroke="#6e5240" strokeWidth={5} />)}
      <Faceted id="coati-body" d={body} light="#a88163" dark="#8a6749" shift={[-3, -5]} />
      <g className="critter-head">
        <Faceted id="coati-head" d={head} light="#b08a68" dark="#946f50" shift={[-2, -4]} />
        <path d="M22,-42 Q32,-43 40,-37" fill="none" stroke="#e8d6b8" strokeWidth={3.6} />
        <ellipse cx={27} cy={-36} rx={6} ry={5} fill="#5c4632" />
        <Eye x={27} y={-36} rx={3.2} ry={3.8} pr={1.8} />
        <path d={blob(55, -28, 3.6, 3, { seed: 2, n: 7 })} fill={INK} />
        <path d={blob(15, -46, 5, 5.4, { seed: 4, n: 8 })} fill="#946f50" stroke={INK} strokeWidth={2.2} />
        <path d="M38,-26 q4,2 9,1" fill="none" stroke={INK} strokeWidth={1.4} opacity={0.5} />
      </g>
    </g>
  );
}

/** The barn owl (sheet 4): a heart-shaped pale face on a golden body, sitting on its wooden post; it tilts its head. */
function Lechuza({ bare }: { bare?: boolean }) {
  const body = smoothClosed([[0, -96], [18, -90], [24, -70], [22, -50], [12, -40], [-12, -40], [-22, -50], [-24, -70], [-18, -90]]);
  const face = smoothClosed([[0, -84], [8, -94], [17, -88], [17, -74], [9, -64], [0, -58], [-9, -64], [-17, -74], [-17, -88], [-8, -94]]);
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {!bare && (
        <>
          <ellipse cx={2} cy={1} rx={24} ry={5} fill="url(#hatch)" />
          {/* its post: a short log, its rings on top */}
          <Faceted id="owl-post" d={wobblyPoly([[-15, 0], [15, 0], [14, -40], [-14, -40]], { wob: 0.6, bow: 0.8, seed: 5 })} light="#b08560" dark="#8d6844" shift={[-3, 0]} />
          <ellipse cx={0} cy={-40} rx={14} ry={4.4} fill="#e3c79a" stroke={INK} strokeWidth={2.2} />
          <path d="M-6,-24 L-7,-8 M5,-30 L6,-12" stroke={INK} strokeWidth={1.3} opacity={0.45} />
        </>
      )}
      <g className="critter-body">
        <Faceted id="owl-body" d={body} light="#d9b98c" dark="#b8966a" shift={[-4, -3]} />
        {[[-7, -52], [3, -49], [9, -55], [-2, -56]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.3} fill="#8d6844" />)}
        <path d="M-20,-66 Q-26,-54 -16,-44 M20,-66 Q26,-54 16,-44" fill="none" stroke={INK} strokeWidth={1.4} opacity={0.45} />
        {[-6, 6].map((x) => <path key={x} d={`M${x - 4},-40 l2,4 M${x},-40 l0,5 M${x + 4},-40 l-2,4`} stroke="#8d6844" strokeWidth={2.2} />)}
        <g className="critter-head">
          <path d={face} fill={CREAM} stroke={INK} strokeWidth={2.4} />
          <path d="M0,-84 Q-2,-76 0,-70" fill="none" stroke="#d9b98c" strokeWidth={2} />
          <Eye x={-8} y={-77} rx={4.6} ry={5.2} pr={3.4} />
          <Eye x={8} y={-77} rx={4.6} ry={5.2} pr={3.4} />
          <path d="M-2,-71 L0,-65 L2,-71 Z" fill="#de8a56" stroke={INK} strokeWidth={1.4} />
        </g>
      </g>
    </g>
  );
}

/** The fox (sheet 6): sitting, orange with a cream bib, dark ear tips, its bushy white-tipped tail round its feet. */
function Zorro({ bare }: { bare?: boolean }) {
  const body = smoothClosed([[-12, -2], [-18, -22], [-14, -42], [0, -50], [14, -42], [18, -22], [12, -2]]);
  const head = smoothClosed([[-16, -58], [-18, -80], [-9, -70], [0, -72], [9, -70], [18, -80], [16, -58], [4, -48], [-4, -48]]);
  const tail = smoothClosed([[10, -4], [30, -10], [44, -24], [40, -8], [26, 2], [4, 3]]);
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {!bare && <ellipse cx={8} cy={1} rx={36} ry={6} fill="url(#hatch)" />}
      <Faceted id="fox-body" d={body} light="#de8a56" dark="#bf6f3f" shift={[-4, -3]} />
      <path d={smoothClosed([[-7, -46], [7, -46], [9, -30], [0, -18], [-9, -30]])} fill={CREAM} stroke={INK} strokeWidth={2} />
      <g className="critter-tail">
        <Faceted id="fox-tail" d={tail} light="#de8a56" dark="#bf6f3f" shift={[-3, -3]} />
        <path d={smoothClosed([[36, -20], [44, -24], [42, -12], [36, -10]])} fill={CREAM} stroke={INK} strokeWidth={2} />
      </g>
      {[-7, 5].map((x) => <path key={x} d={blob(x, -2, 6, 3.6, { seed: x + 20, n: 7 })} fill="#5c4632" stroke={INK} strokeWidth={2} />)}
      <g className="critter-head">
        <g className="critter-ear">
          <path d="M9,-68 L18,-82 L17,-64 Z" fill="#5c4632" stroke={INK} strokeWidth={2} />
        </g>
        <path d="M-9,-68 L-18,-82 L-17,-64 Z" fill="#5c4632" stroke={INK} strokeWidth={2} />
        <Faceted id="fox-head" d={head} light="#de8a56" dark="#bf6f3f" shift={[-3, -3]} />
        <path d={smoothClosed([[-10, -60], [0, -58], [10, -60], [6, -50], [0, -47], [-6, -50]])} fill={CREAM} stroke={INK} strokeWidth={1.8} />
        <Eye x={-7} y={-64} rx={3.4} ry={4} pr={2} />
        <Eye x={7} y={-64} rx={3.4} ry={4} pr={2} />
        <path d={blob(0, -53, 2.8, 2.2, { seed: 9, n: 7 })} fill={INK} />
      </g>
    </g>
  );
}

/** The woodpecker (sheet 9): black and white with a red crest, clinging to a dead trunk that it drums. */
function Carpintero({ bare }: { bare?: boolean }) {
  const trunk = wobblyPoly([[-16, 0], [14, 0], [12, -118], [-12, -120]], { wob: 0.8, bow: 1.2, seed: 8 });
  const body = smoothClosed([[10, -94], [18, -88], [22, -70], [20, -52], [14, -46], [8, -56], [7, -76]]);
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {!bare && (
        <>
          <ellipse cx={2} cy={1} rx={22} ry={5} fill="url(#hatch)" />
          <Faceted id="wp-trunk" d={trunk} light="#9a7654" dark="#7a5a3e" shift={[-4, 0]} />
          <ellipse cx={0} cy={-119} rx={12} ry={3.6} fill="#c9a377" stroke={INK} strokeWidth={2} />
          {[[-6, -20, -6, -46], [4, -60, 5, -90], [-4, -96, -5, -110]].map(([a, b, c, d], i) => <path key={i} d={wobblyLine(a, b, c, d, { bow: 0.8, seed: i + 30 })} stroke={INK} strokeWidth={1.3} opacity={0.45} fill="none" />)}
          <ellipse cx={-2} cy={-78} rx={4.6} ry={6} fill="#3e3128" stroke={INK} strokeWidth={1.8} />
        </>
      )}
      <g className="critter-peck">
        <path d="M14,-50 L12,-34 L18,-40 Z" fill="#4a4f5c" stroke={INK} strokeWidth={1.8} />
        <Faceted id="wp-body" d={body} light="#f3ead7" dark="#dccdb0" shift={[2, -2]} sw={2.4} />
        <path d={smoothClosed([[16, -86], [22, -74], [21, -56], [15, -48], [17, -66]])} fill="#4a4f5c" stroke={INK} strokeWidth={2} />
        {[[19, -70], [19, -61]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.6} fill={CREAM} />)}
        <path d={smoothClosed([[7, -92], [11, -104], [20, -100], [21, -90], [13, -86]])} fill="#c9574a" stroke={INK} strokeWidth={2.2} />
        <path d="M8,-90 L-3,-86 L8,-85 Z" fill="#9f937f" stroke={INK} strokeWidth={1.6} />
        <Eye x={13} y={-90} rx={2.8} ry={3.2} pr={1.6} />
        {[[10, -52], [10, -60]].map(([x, y], i) => <path key={i} d={`M${x},${y} l-4,2 M${x},${y} l-4,-2`} stroke={INK} strokeWidth={1.8} />)}
      </g>
      <g className="critter-chips">
        <path d="M-4,-82 l-6,-3 M-5,-78 l-7,1" stroke="#c9a377" strokeWidth={2} />
      </g>
    </g>
  );
}

/** The capybara (sheet 10): big and calm, a brown loaf with a blunt square head, sleepy eyes; it dozes by the river. Faces left. */
function Carpincho({ bare }: { bare?: boolean }) {
  const body = smoothClosed([[-30, -44], [0, -50], [28, -46], [40, -32], [38, -14], [24, -6], [-18, -6], [-34, -18]]);
  const head = smoothClosed([[-24, -52], [-40, -54], [-56, -46], [-60, -32], [-54, -24], [-36, -22], [-22, -28]]);
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {!bare && <ellipse cx={-6} cy={1} rx={48} ry={6} fill="url(#hatch)" />}
      {[[-20, -8], [-8, -7], [18, -8], [30, -9]].map(([x, y], i) => <path key={i} d={`M${x},${y} L${x},-1`} stroke={INK} strokeWidth={10} />)}
      {[[-20, -8], [-8, -7], [18, -8], [30, -9]].map(([x, y], i) => <path key={`l${i}`} d={`M${x},${y} L${x},-1`} stroke="#7a5a3e" strokeWidth={6} />)}
      <g className="critter-body">
        <Faceted id="capy-body" d={body} light="#a67c52" dark="#8a6440" shift={[-4, -5]} />
        <path d="M-8,-40 q8,-3 16,0 M14,-38 q6,-2 11,1" fill="none" stroke={INK} strokeWidth={1.3} opacity={0.4} />
        <Faceted id="capy-head" d={head} light="#b08560" dark="#8d6844" shift={[-2, -4]} />
        <g className="critter-ear">
          <path d={blob(-26, -54, 5, 4.4, { seed: 6, n: 8 })} fill="#8d6844" stroke={INK} strokeWidth={2} />
        </g>
        <Eye x={-40} y={-44} rx={3.4} ry={3.4} pr={2} sleepy />
        <path d="M-56,-36 q-2,2 0,4" fill="none" stroke={INK} strokeWidth={1.8} />
        <path d="M-50,-26 q5,2 10,0" fill="none" stroke={INK} strokeWidth={1.5} opacity={0.6} />
      </g>
    </g>
  );
}

/** The frog (sheet 13): squat and green on its lily pad, big eyes on top, a wide smile; its throat pulses. */
function Rana({ bare }: { bare?: boolean }) {
  const body = smoothClosed([[-20, -10], [-22, -22], [-12, -30], [12, -30], [22, -22], [20, -10], [10, -2], [-10, -2]]);
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {!bare && (
        <>
          <path d={blob(0, 2, 34, 11, { seed: 12, n: 10 })} fill="#a4b86d" stroke={INK} strokeWidth={2.2} />
          <path d="M0,2 L30,-2" stroke="#9dbbd8" strokeWidth={4} />
        </>
      )}
      {[-1, 1].map((s) => <path key={s} d={smoothClosed([[s * 12, -6], [s * 26, -12], [s * 28, -2], [s * 18, 1]])} fill="#7f9658" stroke={INK} strokeWidth={2.2} />)}
      <Faceted id="frog-body" d={body} light="#93aa6e" dark="#768d57" shift={[-3, -4]} />
      <path d={blob(0, -12, 12, 7, { seed: 13, n: 9 })} fill="#c9d49a" />
      <g className="critter-throat">
        <path d={blob(0, -11, 7, 4.5, { seed: 14, n: 8 })} fill="#dde5b4" stroke={INK} strokeWidth={1.3} opacity={0.9} />
      </g>
      {[[-8, -24], [9, -20]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2} fill="#6d8250" />)}
      {[-1, 1].map((s) => <path key={`e${s}`} d={blob(s * 10, -31, 8.4, 7.6, { seed: s + 15, n: 9 })} fill="#93aa6e" stroke={INK} strokeWidth={2.2} />)}
      <Eye x={-10} y={-32} rx={5} ry={5.4} pr={2.8} />
      <Eye x={10} y={-32} rx={5} ry={5.4} pr={2.8} />
      <path d="M-13,-17 Q0,-11 13,-17" fill="none" stroke={INK} strokeWidth={2} />
      {[-1, 1].map((s) => <path key={`h${s}`} d={`M${s * 8},-6 l${s * 2},6 M${s * 8},0 l${s * -3},1 M${s * 8},0 l${s * 5},1`} stroke={INK} strokeWidth={2} />)}
    </g>
  );
}

const ART: Record<CritterId, (p: { bare?: boolean }) => ReactNode> = { coati: Coati, lechuza: Lechuza, zorro: Zorro, carpintero: Carpintero, carpincho: Carpincho, rana: Rana };

/**
 * A critter, drawn standing on (0, 0), alive (its blink and its motion are
 * CSS). `bare`: the animal alone, without its home or its shadow (a
 * silhouette still to come, a reward card).
 */
export const CritterArt = memo(function CritterArt({ id, bare }: { id: CritterId; bare?: boolean }) {
  const Art = ART[id];
  return <g className={`critter critter-${id}`} transform={bare ? BARE[id] : undefined}><Art bare={bare} /></g>;
});

/** Without its home, the animal stands on (0, 0) too (the owl comes down from its post, the woodpecker off its trunk, bigger). */
const BARE: Partial<Record<CritterId, string>> = { lechuza: 'translate(0 40)', carpintero: 'translate(-20 48) scale(1.4)' };

