// The monster games' drawings (T43/T44), in the notebook's style
// (docs/style-guide.md): ink #2b2622 boiled by #rough, flat warm colours, one
// darker flat facet for volume, a flat shadow, no gradients, no text.
//
// - The monster: a big friendly bean with two odd eyes, little horns, a
//   belly patch, stubby arms and feet, and a wide mouth; two of them (a blue
//   one and a pink one, for the rounds with two monsters). Its moods:
//   `want` (hungry, licking its lips), `chew`, `yum` (happy eyes, blush,
//   hearts), `yuck` (squeezed eyes, tongue out, turning green, stink lines),
//   `spit` (puffed cheeks).
// - The ingredients as sandwich layers seen from the side (bread, cheese,
//   tomato, lettuce, ham, egg): the same drawing on the tray's cards, in the
//   monster's thought bubble and on the plate, so a child never has to map
//   one picture to another.
// - The service bell ("¡Listo!"), the "¡Otra vez!" drawing and the arcade
//   menu's card.
//
// Coordinates: a layer's bottom edge at y = 0, drawn upwards (negative y);
// the monster's feet at (0, 0).

import { useId, type ReactNode } from 'react';
import { blob, penLoop, wobblyLine, wobblyPoly } from '../../ink/ink.js';
import type { Ingredient } from './recipe';

const INK = '#2b2622';
const PEN = '#3d6ea5';
const SHADOW = 'rgba(84, 62, 38, 0.2)';
const PAPER = '#fbf7ee';
const CREAM = '#fbf6ea';
const MOUTH = '#7b3129';
const SW = 3;

// ------------------------------------------------------------------ the ingredients

/** Each layer's height (side view), in drawing units at a width of 220. */
export const LAYER_H: Record<Ingredient, number> = { pan: 30, queso: 18, tomate: 20, lechuga: 20, jamon: 15, huevo: 22 };
/** A layer's width on the plate. */
export const LAYER_W = 220;

const ink = { stroke: INK, strokeWidth: 2.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

/** One ingredient as a sandwich layer, its bottom edge on y = 0, centred on x = 0. */
export function Layer({ ing, w = LAYER_W, seed = 1 }: { ing: Ingredient; w?: number; seed?: number }) {
  const h = LAYER_H[ing];
  const x0 = -w / 2;
  switch (ing) {
    case 'pan': {
      const outer = wobblyPoly([[x0, -h + 4], [x0 + 6, -h], [-x0 - 6, -h], [-x0, -h + 4], [-x0, -4], [-x0 - 6, 0], [x0 + 6, 0], [x0, -4]], { wob: 0.6, bow: 1, seed: seed + 3 });
      return (
        <g>
          <path d={outer} fill="#c98a4b" {...ink} />
          <rect x={x0 + 7} y={-h + 6} width={w - 14} height={h - 12} rx={7} fill="#f2d9a6" />
          {[0.18, 0.42, 0.63, 0.84].map((f, i) => <ellipse key={i} cx={x0 + w * f} cy={-h / 2 + (i % 2 ? 2 : -2)} rx={3.4} ry={2} fill="#d9b77d" />)}
          <path d={outer} fill="none" {...ink} />
        </g>
      );
    }
    case 'queso': {
      const d = `M${x0 - 4},${-h} L${-x0 + 4},${-h} L${-x0 + 4},${-4} L${-x0 - 10},${-4} L${-x0 - 20},${10} L${-x0 - 30},${-4} L${w * 0.08},${-4} L${-2},${7} L${-w * 0.1},${-4} L${x0 + 34},${-4} L${x0 + 22},${12} L${x0 + 12},${-4} L${x0 - 4},${-4} Z`;
      return (
        <g>
          <path d={d} fill="#f0d27a" {...ink} />
          {[[-0.3, -10, 5], [0.05, -11, 4], [0.32, -9, 5.5]].map(([f, y, r], i) => <ellipse key={i} cx={w * f} cy={y} rx={r} ry={r * 0.7} fill="#d9b45a" />)}
        </g>
      );
    }
    case 'tomate': {
      const rx = w * 0.19;
      return (
        <g>
          {[-0.31, 0, 0.31].map((f, i) => (
            <g key={i}>
              <ellipse cx={w * f} cy={-h / 2} rx={rx} ry={h / 2} fill="#c9574a" {...ink} />
              <ellipse cx={w * f} cy={-h / 2} rx={rx * 0.7} ry={h * 0.3} fill="#e07a68" />
              {[-0.35, 0, 0.35].map((g, j) => <ellipse key={j} cx={w * f + rx * g} cy={-h / 2 + (j === 1 ? -1 : 1)} rx={2.4} ry={1.5} fill={CREAM} />)}
            </g>
          ))}
        </g>
      );
    }
    case 'lechuga': {
      const n = 9;
      let top = `M${x0 - 10},${-h * 0.45}`;
      for (let i = 0; i < n; i++) {
        const xa = x0 - 10 + ((w + 20) * (i + 0.5)) / n;
        const xb = x0 - 10 + ((w + 20) * (i + 1)) / n;
        top += ` Q${xa.toFixed(1)},${(-h - 4).toFixed(1)} ${xb.toFixed(1)},${(-h * 0.45).toFixed(1)}`;
      }
      let bottom = '';
      for (let i = n; i > 0; i--) {
        const xa = x0 - 10 + ((w + 20) * (i - 0.5)) / n;
        const xb = x0 - 10 + ((w + 20) * (i - 1)) / n;
        bottom += ` Q${xa.toFixed(1)},${(6).toFixed(1)} ${xb.toFixed(1)},${(-2).toFixed(1)}`;
      }
      const d = `${top} L${-x0 + 10},${-2}${bottom} Z`;
      return (
        <g>
          <path d={d} fill="#a4b86d" {...ink} />
          {[-0.3, 0, 0.3].map((f, i) => <path key={i} d={`M${w * f - 16},${-h * 0.4} Q${w * f},${-h * 0.62} ${w * f + 16},${-h * 0.4}`} fill="none" stroke="#7d9150" strokeWidth={1.6} strokeLinecap="round" />)}
        </g>
      );
    }
    case 'jamon': {
      const d = `M${x0 - 6},${-h + 2} Q${x0 + w * 0.25},${-h - 4} ${0},${-h + 1} T${-x0 + 6},${-h + 2} L${-x0 + 10},${-2} Q${-x0 - w * 0.25},${4} ${0},${0} T${x0 - 10},${-2} Z`;
      return (
        <g>
          <path d={d} fill="#e7a3a0" {...ink} />
          <path d={`M${x0 + 4},${-h + 5} Q${x0 + w * 0.3},${-h + 1} ${0},${-h + 5} T${-x0 - 4},${-h + 5}`} fill="none" stroke="#f6dcd6" strokeWidth={3} strokeLinecap="round" />
        </g>
      );
    }
    case 'huevo': {
      const white = blob(0, -h * 0.42, w * 0.5, h * 0.48, { wob: 0.08, n: 12, seed: seed + 9 });
      return (
        <g>
          <path d={white} fill={CREAM} {...ink} />
          <path d={`M-30,${-h * 0.55} C-30,${-h - 12} 30,${-h - 12} 30,${-h * 0.55} Z`} fill="#f0d27a" {...ink} />
          <path d="M-14,-17 Q-8,-24 0,-25" fill="none" stroke={CREAM} strokeWidth={3} strokeLinecap="round" opacity={0.8} />
        </g>
      );
    }
  }
}

/** The heights of a stack's layers, from the bottom: each one's bottom edge (≤ 0) and the stack's top. */
export function stackOffsets(items: readonly Ingredient[], gap = 2): { bottoms: number[]; top: number } {
  const bottoms: number[] = [];
  let y = 0;
  for (const it of items) { bottoms.push(y); y -= LAYER_H[it] + gap; }
  return { bottoms, top: y };
}

/**
 * A sandwich, bottom layer on y = 0. `wrongAt`: that layer circled in red pen
 * (it shakes, CSS). `onLayer`: a tap on a layer (the plate: it comes off with
 * everything on it). `slots`: empty dashed outlines for the layers still to put.
 * `template` (T52, replaces `slots`): the sandwich wanted, its layers still
 * to put drawn faded in their places (building is matching), the next one
 * pulsing.
 */
export function Sandwich({ items, w = LAYER_W, wrongAt = null, onLayer, slots = 0, pop = -1, template }: {
  items: readonly Ingredient[]; w?: number; wrongAt?: number | null; onLayer?: (i: number) => void; slots?: number; pop?: number; template?: readonly Ingredient[];
}) {
  const { bottoms, top } = stackOffsets(items);
  const slotH = 24;
  const tpl = template ? stackOffsets(template).bottoms : [];
  return (
    <g className="rx-sandwich">
      {template?.map((it, i) => (i < items.length ? null : (
        <g key={`t${i}-${it}`} transform={`translate(0 ${tpl[i]})`} className={`rx-ghost${i === items.length ? ' is-next' : ''}`} data-ghost={i} data-ing={it} aria-hidden="true">
          <g filter="url(#rough)"><Layer ing={it} w={w} seed={i + 11} /></g>
          {i === items.length && (
            <rect className="rx-ghost-ring" x={-w / 2 - 10} y={-LAYER_H[it] - 8} width={w + 20} height={LAYER_H[it] + 14} rx={12} fill="none" stroke="#3d6ea5" strokeWidth={3} strokeDasharray="3 8" strokeLinecap="round" />
          )}
        </g>
      )))}
      {Array.from({ length: slots }, (_, i) => (
        <rect
          key={`s${i}`} className="rx-slot" x={-w / 2 + 6} y={top - (i + 1) * (slotH + 6) + 6} width={w - 12} height={slotH} rx={10}
          fill="none" stroke="rgba(43, 38, 34, 0.35)" strokeWidth={2.4} strokeDasharray="7 7"
        />
      ))}
      {items.map((it, i) => (
        <g key={`${i}-${it}`} transform={`translate(0 ${bottoms[i]})`}>
          <g
            className={`rx-layer${i === pop ? ' is-new' : ''}${wrongAt === i ? ' is-wrong' : ''}${onLayer ? ' ga-target' : ''}`}
            data-layer={i} data-ing={it}
            onClick={onLayer ? () => onLayer(i) : undefined}
          >
            {/* a wider invisible hit area: every layer is at least 48 px tall to a finger */}
            {onLayer && <rect x={-w / 2 - 6} y={-Math.max(LAYER_H[it] + 14, 34)} width={w + 12} height={Math.max(LAYER_H[it] + 14, 34)} fill="transparent" />}
            <g filter="url(#rough)"><Layer ing={it} w={w} seed={i + 1} /></g>
          </g>
          {wrongAt === i && (
            <g className="rx-wrong-ring" filter="url(#rough)">
              <path d={penLoop(0, -LAYER_H[it] / 2, w / 2 + 22, LAYER_H[it] / 2 + 16, { seed: 7 })} fill="none" stroke="#c24a3c" strokeWidth={5} strokeLinecap="round" />
            </g>
          )}
        </g>
      ))}
    </g>
  );
}

/**
 * A tray card's drawing: one layer, big and thick (stretched upwards so a
 * thin slice of ham still reads at card size; the ink keeps its weight,
 * `.rx-card-art` sets non-scaling strokes).
 */
export function IngredientCardArt({ ing }: { ing: Ingredient }) {
  const k = 2.1;
  const h = LAYER_H[ing] * k;
  return (
    <svg className="rx-card-art" viewBox="-100 -62 200 84" aria-hidden="true">
      <ellipse cx={0} cy={12} rx={78} ry={6} fill="url(#hatch)" opacity={0.5} />
      <g filter="url(#rough)" transform={`translate(0 ${h / 2 - 22}) scale(1 ${k})`}><Layer ing={ing} w={170} /></g>
    </svg>
  );
}

// ------------------------------------------------------------------ the monster

export type MonsterMood = 'want' | 'chew' | 'yum' | 'yuck' | 'spit' | 'wait';
export type MonsterLook = 'blue' | 'pink';

const LOOKS: Record<MonsterLook, { body: string; facet: string; belly: string; horn: string; foot: string }> = {
  blue: { body: '#7298c1', facet: '#5f82ab', belly: '#a9c3de', horn: '#de8a56', foot: '#5a7aa0' },
  pink: { body: '#e7a3a0', facet: '#cf8986', belly: '#f3cfc9', horn: '#f0d27a', foot: '#c98380' },
};

const BODY = 'M-82,-14 C-104,-86 -84,-178 0,-182 C84,-178 104,-86 82,-14 C62,6 -62,6 -82,-14 Z';

/**
 * The monster, feet at (0, 0), about 190 units tall. `look` turns its eyes
 * (−1 left … 1 right). Every mood is drawn; the CSS animates the moods
 * (`.mx-monster.is-<mood>`).
 */
export function Monster({ mood, look = 1, tone = 'blue' }: { mood: MonsterMood; look?: number; tone?: MonsterLook }) {
  const uid = useId().replace(/:/g, '');
  const c = LOOKS[tone];
  const px = Math.max(-1, Math.min(1, look)) * 6;
  const happy = mood === 'yum';
  const squeeze = mood === 'yuck' || mood === 'spit';
  const eye = (cx: number, cy: number, r: number, k: number) => (
    <g key={k}>
      {happy ? (
        <path d={`M${cx - r * 0.8},${cy + 3} Q${cx},${cy - r} ${cx + r * 0.8},${cy + 3}`} fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      ) : squeeze ? (
        <path d={k ? `M${cx - r * 0.7},${cy - r * 0.5} L${cx + r * 0.5},${cy} L${cx - r * 0.7},${cy + r * 0.5}` : `M${cx + r * 0.7},${cy - r * 0.5} L${cx - r * 0.5},${cy} L${cx + r * 0.7},${cy + r * 0.5}`} fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <g className="mx-eye">
          <ellipse cx={cx} cy={cy} rx={r} ry={r * 1.08} fill={CREAM} stroke={INK} strokeWidth={2.4} />
          <circle cx={cx + px * (r / 20)} cy={cy + 3} r={r * 0.4} fill={INK} />
          <circle cx={cx + px * (r / 20) - r * 0.14} cy={cy - r * 0.04} r={r * 0.12} fill={CREAM} />
        </g>
      )}
    </g>
  );
  let mouth: ReactNode;
  switch (mood) {
    case 'want':
    case 'wait':
      mouth = (
        <g>
          <path d="M-40,-86 Q0,-48 40,-86 Q0,-74 -40,-86 Z" fill={MOUTH} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d="M-10,-80 L-4,-70 L2,-79 Z" fill={CREAM} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
          {mood === 'want' && <path className="mx-tongue" d="M22,-82 Q40,-80 44,-70 Q40,-62 30,-68 Q26,-75 22,-82 Z" fill="#e7a3a0" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />}
          {mood === 'want' && <path className="mx-drool" d="M-30,-78 Q-33,-66 -30,-60 Q-27,-66 -30,-78 Z" fill="#cfe1ef" stroke={INK} strokeWidth={1.6} />}
        </g>
      );
      break;
    case 'chew':
      mouth = <path className="mx-chew" d="M-34,-80 Q-17,-90 0,-80 Q17,-70 34,-80" fill="none" stroke={INK} strokeWidth={SW + 0.6} strokeLinecap="round" />;
      break;
    case 'yum':
      mouth = (
        <g>
          <path d="M-46,-90 Q0,-36 46,-90 Q0,-78 -46,-90 Z" fill={MOUTH} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d="M-20,-66 Q0,-56 20,-66 Q0,-74 -20,-66 Z" fill="#e7a3a0" />
        </g>
      );
      break;
    case 'yuck':
      mouth = (
        <g>
          <path d="M-36,-78 Q-24,-90 -12,-78 Q0,-66 12,-78 Q24,-90 36,-78" fill="none" stroke={INK} strokeWidth={SW + 0.4} strokeLinecap="round" />
          <path className="mx-tongue" d="M-4,-78 Q-8,-56 4,-52 Q16,-56 12,-78 Z" fill="#b9c98a" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
        </g>
      );
      break;
    case 'spit':
      mouth = <ellipse cx={-6} cy={-80} rx={9} ry={7} fill={MOUTH} stroke={INK} strokeWidth={SW} />;
      break;
  }
  const puffed = mood === 'chew' || mood === 'spit';
  return (
    <g className={`mx-monster is-${mood}`} data-mood={mood} data-tone={tone}>
      <ellipse cx={0} cy={2} rx={92} ry={12} fill="url(#hatch)" opacity={0.7} />
      <g className="mx-body-in">
        <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
          {/* feet */}
          <path d={blob(-42, -4, 28, 13, { seed: 3, wob: 0.06 })} fill={c.foot} stroke={INK} strokeWidth={SW} />
          <path d={blob(42, -4, 28, 13, { seed: 4, wob: 0.06 })} fill={c.foot} stroke={INK} strokeWidth={SW} />
          {/* horns */}
          <path d="M-52,-160 Q-66,-196 -46,-206 Q-40,-184 -30,-170 Z" fill={c.horn} stroke={INK} strokeWidth={SW} />
          <path d="M52,-160 Q66,-196 46,-206 Q40,-184 30,-170 Z" fill={c.horn} stroke={INK} strokeWidth={SW} />
          {/* the body with its flat facet (a darker copy, the light body shifted inside it) */}
          <clipPath id={`mxb-${uid}`}><path d={BODY} /></clipPath>
          <path d={BODY} fill={c.facet} />
          <g clipPath={`url(#mxb-${uid})`}><path d={BODY} fill={c.body} transform="translate(-14 -6)" /></g>
          {mood === 'yuck' && <g className="mx-green" clipPath={`url(#mxb-${uid})`}><path d={blob(0, -88, 74, 34, { seed: 5 })} fill="#a4b86d" opacity={0.8} /></g>}
          <path d={blob(0, -54, 50, 38, { seed: 6, wob: 0.07 })} fill={c.belly} opacity={0.9} />
          <path d={BODY} fill="none" stroke={INK} strokeWidth={SW} />
          {/* tufts on the belly */}
          <path d="M-14,-62 Q-8,-56 -2,-62 M6,-46 Q12,-40 18,-46" fill="none" stroke={INK} strokeWidth={1.5} opacity={0.45} />
          {/* stubby arms */}
          <g className="mx-arm-l"><path d="M-84,-74 Q-112,-70 -118,-48 Q-104,-44 -88,-58" fill={c.body} stroke={INK} strokeWidth={SW} /></g>
          <g className="mx-arm-r"><path d="M84,-74 Q112,-70 118,-48 Q104,-44 88,-58" fill={c.body} stroke={INK} strokeWidth={SW} /></g>
          {/* cheeks */}
          {(happy || puffed) && <ellipse cx={-56} cy={-96} rx={puffed ? 18 : 13} ry={puffed ? 14 : 8} fill="#e7a3a0" opacity={puffed ? 0.85 : 0.7} />}
          {(happy || puffed) && <ellipse cx={56} cy={-96} rx={puffed ? 18 : 13} ry={puffed ? 14 : 8} fill="#e7a3a0" opacity={puffed ? 0.85 : 0.7} />}
        </g>
        {/* the face (not boiled: it stays crisp) */}
        {eye(-30, -126, 21, 0)}
        {eye(30, -122, 15, 1)}
        {mouth}
      </g>
      {mood === 'yum' && (
        <g className="mx-hearts" aria-hidden="true">
          {[[-70, -190, 1], [74, -206, 0.8], [0, -230, 1.1]].map(([x, y, s], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
              <path className={`mx-heart h${i}`} d="M0,10 C-22,-6 -14,-24 0,-12 C14,-24 22,-6 0,10 Z" fill="#c9574a" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
            </g>
          ))}
        </g>
      )}
      {mood === 'yuck' && (
        <g className="mx-stink" fill="none" stroke="#7d9150" strokeWidth={3} strokeLinecap="round" aria-hidden="true">
          <path d={wobblyLine(-100, -150, -112, -200, { bow: 6, seed: 1 })} />
          <path d={wobblyLine(100, -150, 112, -200, { bow: -6, seed: 2 })} />
          <path d={wobblyLine(0, -212, 4, -250, { bow: 5, seed: 3 })} />
        </g>
      )}
      {mood === 'spit' && (
        <g className="mx-spit" aria-hidden="true">
          {[[40, -84, 6], [62, -92, 4.5], [56, -72, 3.5]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#cfe1ef" stroke={INK} strokeWidth={1.6} />)}
        </g>
      )}
    </g>
  );
}

/** The monster's thought bubble, its tail towards the monster's head at (tx, ty); `children` drawn inside, centred on (0, 0). */
export function ThoughtBubble({ w, h, tx, ty, seed = 1, children, here }: { w: number; h: number; tx: number; ty: number; seed?: number; children: ReactNode; here?: boolean }) {
  const cloud = blob(0, 0, w / 2, h / 2, { wob: 0.1, n: 14, seed });
  return (
    <g className={`mx-bubble${here ? ' is-here' : ''}`}>
      <g filter="url(#rough)">
        {[0.82, 0.6].map((f, i) => <circle key={i} cx={tx * f} cy={ty * f} r={8 - i * 3 + 2} fill={PAPER} stroke={INK} strokeWidth={2.4} transform="translate(0 0)" />)}
        <path d={cloud} transform="translate(5 7)" fill={SHADOW} />
        <path d={cloud} fill={PAPER} stroke={INK} strokeWidth={2.8} />
      </g>
      {children}
    </g>
  );
}

// ------------------------------------------------------------------ the bell, "¡Otra vez!", the menu card

/** A service bell on a little base: tap it to serve. */
export function BellArt({ size = 84 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-50 -62 100 76" aria-hidden="true" className="rx-bell-art">
      <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
        <path d="M-44,8 L44,8 L40,-2 L-40,-2 Z" fill="#c98a4b" stroke={INK} strokeWidth={SW} />
        <path d="M-34,-4 C-34,-40 34,-40 34,-4 Z" fill="#f0d27a" stroke={INK} strokeWidth={SW} />
        <path d="M-22,-14 C-20,-28 -6,-32 4,-31" fill="none" stroke={CREAM} strokeWidth={4} opacity={0.8} />
        <rect x={-4} y={-46} width={8} height={10} rx={2} fill="#c98a4b" stroke={INK} strokeWidth={2.4} />
        <ellipse cx={0} cy={-48} rx={10} ry={4.5} fill="#f0d27a" stroke={INK} strokeWidth={2.4} />
      </g>
      <g className="rx-bell-ding" fill="none" stroke={PEN} strokeWidth={3} strokeLinecap="round">
        <path d="M-40,-36 L-50,-46 M40,-36 L50,-46 M-46,-20 L-58,-22 M46,-20 L58,-22" />
      </g>
    </svg>
  );
}

/** "¡Otra vez!": a blue pen loop around a little sandwich. */
export function AgainLoopArt({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-50 -50 100 100" aria-hidden="true">
      <g transform="translate(0 14) scale(0.32)" filter="url(#rough)">
        <Layer ing="pan" w={150} /><g transform="translate(0 -32)"><Layer ing="queso" w={150} /></g><g transform="translate(0 -52)"><Layer ing="pan" w={150} /></g>
      </g>
      <g fill="none" stroke={PEN} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" filter="url(#rough)">
        <path d="M30,-30 A40,40 0 1 0 40,6" />
        <path d="M30,-30 L32,-12 M30,-30 L12,-28" />
      </g>
    </svg>
  );
}

/** The arcade menu's card for "La receta del monstruo": the blue monster beside a sandwich on its plate, on a taped page. */
export function RecipeCardArt() {
  const page = wobblyPoly([[0, 0], [176, 0], [176, 146], [0, 146]], { wob: 0.7, bow: 1.1, seed: 41 });
  return (
    <svg className="pp-fp-art" viewBox="0 0 260 190" aria-hidden="true">
      <g transform="translate(40 22) rotate(-1.5 88 73)">
        <path d={page} transform="translate(5 6)" fill={SHADOW} />
        <path d={page} fill={PAPER} stroke={INK} strokeWidth={2.6} filter="url(#rough)" />
      </g>
      <g transform="translate(92 166) scale(0.62)"><Monster mood="want" look={1} /></g>
      <g transform="translate(196 150)">
        <ellipse cx={0} cy={4} rx={48} ry={9} fill={CREAM} stroke={INK} strokeWidth={2.4} filter="url(#rough)" />
        <g transform="scale(0.36)" filter="url(#rough)">
          <Layer ing="pan" /><g transform="translate(0 -32)"><Layer ing="lechuga" /></g><g transform="translate(0 -54)"><Layer ing="tomate" /></g>
          <g transform="translate(0 -76)"><Layer ing="queso" /></g><g transform="translate(0 -96)"><Layer ing="pan" /></g>
        </g>
      </g>
    </svg>
  );
}
