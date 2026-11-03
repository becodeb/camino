// "¡Pum! Letras": the drawings, in the notebook's style (ink #2b2622 boiled
// by #rough, flat warm colours). Everything reads without words:
//
// - a soap bubble with a big capital letter in it (or a word under its
//   picture: SOL under a sun); the bubble to type now is yellow and circled
//   in blue pen, its next letter on a yellow mark; typed letters turn green;
// - the pile of stars, one per popped bubble, growing by the monster;
// - the menu card (bubbles over the meadow, one popping into a star, the
//   glowing key that popped it) and the bar's task (a key, then a pop).
//
// Coordinates: a bubble's centre at (0, 0); the pile's bottom centre at (0, 0).

import type { ReactNode } from 'react';
import { blob, penLoop, wobblyPoly } from '../../ink/ink.js';
import { isPicWord, type PicWord } from './pop';

const INK = '#2b2622';
const PEN = '#3d6ea5';
const PAPER = '#fbf7ee';
const SHADOW = 'rgba(84, 62, 38, 0.2)';
const GREEN = '#3f7d35';
const YELLOW = '#f0d27a';
export const STAR_D = 'M0,-11 L3.2,-3.4 11,-3.4 4.8,1.8 7,10 0,5.2 -7,10 -4.8,1.8 -11,-3.4 -3.2,-3.4Z';

/** A bubble's radius: a letter, or a word with its picture. */
export const bubbleR = (text: string) => (text.length > 3 ? 100 : text.length > 1 ? 90 : 66);

/** A word's picture, about 96 × 64 round (0, 0). */
export function WordPic({ w }: { w: PicWord }) {
  let body: ReactNode;
  switch (w) {
    case 'SOL':
      body = (
        <g>
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return <path key={i} d={`M${Math.cos(a) * 26},${Math.sin(a) * 26} L${Math.cos(a) * 36},${Math.sin(a) * 36}`} stroke="#d8932f" strokeWidth={4} strokeLinecap="round" />;
          })}
          <circle r={21} fill={YELLOW} stroke={INK} strokeWidth={2.6} />
          <path d="M-8,-3 L-8,-1 M8,-3 L8,-1 M-8,6 Q0,12 8,6" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
        </g>
      );
      break;
    case 'MAR':
      body = (
        <g>
          <path d="M-46,-4 Q-34,-16 -23,-4 T0,-4 T23,-4 T46,-4 L46,24 L-46,24 Z" fill="#7298c1" stroke={INK} strokeWidth={2.6} />
          <path d="M-36,10 Q-27,2 -18,10 M4,12 Q13,4 22,12" fill="none" stroke={PAPER} strokeWidth={2.6} strokeLinecap="round" />
          <path d="M14,-30 L14,-8 M14,-30 L30,-12 L14,-12" fill="#fbf7ee" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
        </g>
      );
      break;
    case 'PAN':
      body = (
        <g>
          <path d={blob(0, 2, 42, 22, { seed: 5, n: 10, wob: 0.03 })} fill="#d9a35f" stroke={INK} strokeWidth={2.6} />
          <path d="M-20,-8 L-12,8 M-4,-10 L4,8 M12,-10 L20,6" stroke="#9b6a32" strokeWidth={3} strokeLinecap="round" />
        </g>
      );
      break;
    case 'OSO':
      body = (
        <g>
          <circle cx={-20} cy={-20} r={10} fill="#a7774a" stroke={INK} strokeWidth={2.4} />
          <circle cx={20} cy={-20} r={10} fill="#a7774a" stroke={INK} strokeWidth={2.4} />
          <circle r={27} fill="#a7774a" stroke={INK} strokeWidth={2.6} />
          <ellipse cy={9} rx={12} ry={9} fill="#e3c39a" stroke={INK} strokeWidth={2} />
          <circle cx={-10} cy={-6} r={3.4} fill={INK} /><circle cx={10} cy={-6} r={3.4} fill={INK} />
          <ellipse cy={5} rx={4.6} ry={3.2} fill={INK} />
        </g>
      );
      break;
    case 'UVA':
      body = (
        <g>
          <path d="M0,-28 L2,-38" stroke="#7a5a33" strokeWidth={3.4} strokeLinecap="round" />
          <path d="M3,-34 Q20,-44 26,-30 Q12,-26 3,-34 Z" fill="#a4b86d" stroke={INK} strokeWidth={2} />
          {[[-14, -18], [0, -20], [14, -18], [-7, -5], [7, -5], [0, 8], [-14, 8], [14, 8], [-7, 20], [7, 20]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={8.4} fill="#8a6bb0" stroke={INK} strokeWidth={2} />
          ))}
        </g>
      );
      break;
    case 'PEZ':
      body = (
        <g>
          <path d="M22,0 L44,-16 L42,16 Z" fill="#de8a56" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
          <ellipse cx={-4} rx={30} ry={19} fill="#de8a56" stroke={INK} strokeWidth={2.6} />
          <path d="M6,-14 Q12,0 6,14" fill="none" stroke={INK} strokeWidth={2} opacity={0.6} />
          <circle cx={-18} cy={-4} r={4.4} fill={PAPER} stroke={INK} strokeWidth={1.8} /><circle cx={-17} cy={-4} r={2} fill={INK} />
        </g>
      );
      break;
    case 'OJO':
      body = (
        <g>
          <path d="M-42,2 Q0,-34 42,2 Q0,34 -42,2 Z" fill={PAPER} stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
          <circle cy={2} r={14} fill="#7298c1" stroke={INK} strokeWidth={2.2} />
          <circle cy={2} r={6} fill={INK} /><circle cx={-4} cy={-2} r={2.4} fill={PAPER} />
          <path d="M-24,-14 L-30,-24 M0,-19 L0,-30 M24,-14 L30,-24" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
        </g>
      );
      break;
    case 'PIE':
      body = (
        <g transform="rotate(-8)">
          <path d={blob(4, 8, 22, 28, { seed: 9, n: 10, wob: 0.04 })} fill="#e7a3a0" stroke={INK} strokeWidth={2.6} />
          {[[-16, -24, 7.5], [-3, -30, 6.4], [9, -29, 5.6], [19, -24, 5], [26, -16, 4.4]].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="#e7a3a0" stroke={INK} strokeWidth={2} />
          ))}
        </g>
      );
      break;
  }
  return <g className="pz-pic" filter="url(#rough)">{body}</g>;
}

/** A soap bubble with its letter (or its word under the picture). `typed`: letters already typed (green). */
export function Bubble({ text, typed, target, seed }: { text: string; typed: number; target: boolean; seed: number }) {
  const r = bubbleR(text);
  const word = text.length > 1;
  const w = text.length > 3 ? 40 : 44;
  const x0 = -((text.length - 1) * w) / 2;
  return (
    <g className={`pz-bubble${target ? ' is-target' : ''}`}>
      <circle r={r} className="pz-film" stroke={INK} strokeWidth={2.8} filter="url(#rough)" />
      <path d={`M${-r * 0.62},${-r * 0.36} A${r * 0.72},${r * 0.72} 0 0 1 ${-r * 0.2},${-r * 0.7}`} fill="none" stroke={PAPER} strokeWidth={6} strokeLinecap="round" opacity={0.9} />
      <circle cx={r * 0.5} cy={-r * 0.55} r={4.5} fill={PAPER} opacity={0.9} />
      {target && <path className="pz-ring" d={penLoop(0, 0, r + 12, r + 10, { seed })} fill="none" stroke={PEN} strokeWidth={4} strokeLinecap="round" />}
      {word && isPicWord(text) && <g transform="translate(0 -28)"><WordPic w={text} /></g>}
      {[...text].map((ch, i) => {
        const x = x0 + i * w;
        const y = word ? 54 : 27;
        // a word's next letter on a yellow mark (a single letter: the whole bubble is yellow already)
        const next = word && target && i === typed;
        return (
          <g key={i} data-ch={ch}>
            {next && <rect className="pz-next" x={x - 21} y={y - 40} width={42} height={50} rx={10} fill={YELLOW} stroke={INK} strokeWidth={2} />}
            <text x={x} y={y} textAnchor="middle" className={`pz-ch${word ? ' is-word' : ''}${i < typed ? ' is-typed' : ''}`} fill={i < typed ? GREEN : INK}>{ch}</text>
          </g>
        );
      })}
    </g>
  );
}

/** Where the n-th star sits in the pile (rows of `base`, `base − 1`… from the bottom). */
export function pileSpot(i: number, base = 6, gap = 29): { x: number; y: number } {
  let row = 0, left = i;
  while (row < base - 1 && left >= base - row) { left -= base - row; row++; }
  const inRow = base - row;
  return { x: (left - (inRow - 1) / 2) * gap, y: -14 - row * (gap - 4) };
}
export const PILE_MAX = 21;

/** The growing pile of stars (one per bubble popped), the newest one landing with a bounce. */
export function StarPile({ n, glow }: { n: number; glow?: boolean }) {
  const shown = Math.min(n, PILE_MAX);
  return (
    <g className={`pz-pile${glow ? ' is-glow' : ''}`} aria-hidden="true">
      <ellipse cy={4} rx={98} ry={12} fill={SHADOW} />
      {Array.from({ length: shown }, (_, i) => {
        const p = pileSpot(i);
        return (
          <g key={i} transform={`translate(${p.x} ${p.y})`}>
            <path className={`pz-star${i === shown - 1 ? ' is-new' : ''}`} d={STAR_D} transform={`rotate(${((i * 37) % 30) - 15}) scale(1.45)`} fill={YELLOW} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
          </g>
        );
      })}
    </g>
  );
}

/** A star flying from a popped bubble to the pile (CSS `pz-fly`, from --dx/--dy to 0). */
export function FlyingStar() {
  return <path d={STAR_D} transform="scale(2)" fill={YELLOW} stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />;
}

/** The little shot from the child's character to the bubble: a pen streak and a spark. */
export function Shot({ x0, y0, x1, y1 }: { x0: number; y0: number; x1: number; y1: number }) {
  return (
    <g className="pz-shot" aria-hidden="true">
      <path d={`M${x0},${y0} Q${(x0 + x1) / 2},${Math.min(y0, y1) - 60} ${x1},${y1}`} fill="none" stroke={PEN} strokeWidth={5} strokeLinecap="round" strokeDasharray="4 12" />
      <g transform={`translate(${x1} ${y1})`}><path d={STAR_D} transform="scale(1.6)" fill={PAPER} stroke={PEN} strokeWidth={2} /></g>
    </g>
  );
}

// ------------------------------------------------------------------ the menu card and the bar's task

/** A small key with a letter, for the card and the bar. */
function MiniKey({ ch, x, y, lit, s = 1 }: { ch: string; x: number; y: number; lit?: boolean; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d={wobblyPoly([[0, 4], [40, 3], [41, 40], [-1, 41]], { wob: 0.5, bow: 0.6, seed: ch.charCodeAt(0) })} fill={lit ? '#d6ae4c' : '#d9ccb2'} stroke={INK} strokeWidth={2} />
      <path d={wobblyPoly([[3, 1], [37, 0], [37, 32], [3, 33]], { wob: 0.5, bow: 0.6, seed: ch.charCodeAt(0) + 1 })} fill={lit ? YELLOW : PAPER} stroke={INK} strokeWidth={2} />
      <text x={20} y={25} textAnchor="middle" className="pz-mini-ch">{ch}</text>
    </g>
  );
}

/** The arcade card: bubbles over the meadow, one popping into a star, and the yellow key that popped it. */
export function PopCardArt() {
  const page = wobblyPoly([[0, 0], [244, 0], [244, 150], [0, 150]], { wob: 0.7, bow: 1.1, seed: 53 });
  const bubble = (x: number, y: number, r: number, ch: string) => (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill="#dcecf6" stroke={INK} strokeWidth={2.2} />
      <path d={`M${-r * 0.6},${-r * 0.3} A${r * 0.7},${r * 0.7} 0 0 1 ${-r * 0.2},${-r * 0.68}`} fill="none" stroke={PAPER} strokeWidth={3.4} strokeLinecap="round" />
      <text y={r * 0.38} textAnchor="middle" className="pz-mini-ch" style={{ fontSize: r * 1.1 }}>{ch}</text>
    </g>
  );
  return (
    <svg className="pp-fp-art" viewBox="0 0 260 190" aria-hidden="true">
      <g transform="translate(8 14)">
        <path d={page} transform="translate(5 6)" fill={SHADOW} />
        <clipPath id="pz-card-clip"><path d={page} /></clipPath>
        <g clipPath="url(#pz-card-clip)">
          <rect x={0} y={0} width={244} height={150} fill="#e9f0ef" />
          <path d="M0,124 Q90,108 160,122 T244,118 L244,150 L0,150 Z" fill="#a9bf78" />
          {bubble(52, 50, 26, 'O')}
          {bubble(196, 92, 22, 'E')}
          <g transform="translate(128 58)">
            {Array.from({ length: 10 }, (_, i) => {
              const a = (i / 10) * Math.PI * 2;
              return <rect key={i} x={Math.cos(a) * 34 - 5} y={Math.sin(a) * 30 - 3} width={10} height={6} rx={1.4} fill={['#de8a56', '#7298c1', '#c9574a', '#a4b86d', '#e7a3a0'][i % 5]} stroke={INK} strokeWidth={1.2} transform={`rotate(${i * 41} ${Math.cos(a) * 34} ${Math.sin(a) * 30})`} />;
            })}
            <path d={STAR_D} transform="scale(1.9)" fill={YELLOW} stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
          </g>
          <path d="M128,104 Q118,90 128,80" fill="none" stroke={PEN} strokeWidth={3} strokeLinecap="round" strokeDasharray="3 7" />
        </g>
        <path d={page} fill="none" stroke={INK} strokeWidth={2.4} filter="url(#rough)" />
      </g>
      <g filter="url(#rough)">
        <MiniKey ch="E" x={56} y={130} />
        <MiniKey ch="A" x={108} y={124} lit s={1.15} />
        <MiniKey ch="O" x={166} y={130} />
      </g>
      <path d={penLoop(131, 145, 34, 32, { seed: 4 })} fill="none" stroke={PEN} strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

/** The bar's drawn task, after the face and the "then" mark: a key, the "then" mark, a bubble popping into a star. */
export function PopKeyArt() {
  return (
    <svg className="pz-task-art" viewBox="-2 -2 46 46" width={44} height={44} aria-hidden="true">
      <g filter="url(#rough)"><MiniKey ch="A" x={0} y={0} lit /></g>
    </svg>
  );
}
export function PopBurstArt() {
  return (
    <svg className="pz-task-art" viewBox="-30 -26 60 52" width={56} height={48} aria-hidden="true">
      <g filter="url(#rough)">
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return <path key={i} d={`M${Math.cos(a) * 16},${Math.sin(a) * 14} L${Math.cos(a) * 25},${Math.sin(a) * 22}`} stroke={PEN} strokeWidth={2.6} strokeLinecap="round" />;
        })}
        <path d={STAR_D} transform="scale(1.2)" fill={YELLOW} stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
      </g>
    </svg>
  );
}
