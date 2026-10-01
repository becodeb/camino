// The drawings of "Del bloque al texto": the step icons of the bar (T16:
// the idea of each step drawn, never a word), the liking question's doodle
// (a block, a blue pen arrow, lines of text), and the drawn
// answers of a predict item (the item's own board, small, with the dotted
// start and the character where it ends, a bump star if it bumped). Ink
// boiled by #rough, flat colours, blue pen for marks.

import { memo } from 'react';
import { blob, wobblyLine, wobblyPoly } from '../ink/ink.js';
import type { Board, Cell } from '../game/model';
import { ScenePlayer } from '../screens/player';
import type { TxStep } from './textProbe';

const INK = '#2b2622';
const PEN = '#3d6ea5';
const SHADOW = 'rgba(84, 62, 38, 0.2)';

/** A small arrow block, as in the notebook (its direction's colour). */
function MiniBlock({ x, y, w = 22, fill, dir, seed }: { x: number; y: number; w?: number; fill: string; dir: 'right' | 'up' | 'down' | 'left'; seed: number }) {
  const h = w * 0.82;
  const d = wobblyPoly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], { wob: 0.35, seed });
  const cx = x + w / 2, cy = y + h / 2, a = w * 0.26;
  const rot = { right: 0, down: 90, left: 180, up: -90 }[dir];
  return (
    <g>
      <path d={d} transform="translate(1.5 2)" fill={SHADOW} />
      <path d={d} fill={fill} stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
      <g transform={`rotate(${rot} ${cx} ${cy})`} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d={`M${cx - a},${cy} L${cx + a},${cy} M${cx + a * 0.3},${cy - a * 0.65} L${cx + a},${cy} L${cx + a * 0.3},${cy + a * 0.65}`} />
      </g>
    </g>
  );
}

/** A line of text, drawn: a short stroke in a call's colour. */
const textLine = (x: number, y: number, w: number, color: string, seed: number) => (
  <path d={wobblyLine(x, y, x + w, y, { bow: 0.4, seed })} stroke={color} strokeWidth={3.4} strokeLinecap="round" fill="none" />
);

/**
 * The bar's drawing of each step (the idea of the step, never a word): a
 * block and its line; three blocks and three lines; the repeat's loop with
 * its 3 and an indented line; a patch on a line; a rock with a jump over it;
 * a pencil writing a line.
 */
export const TxStepIcon = memo(function TxStepIcon({ step, size = 64 }: { step: TxStep; size?: number }) {
  const pen = <path d={wobblyLine(-3, 0, 5, 0, { seed: 3 })} fill="none" stroke={PEN} strokeWidth={2.2} strokeDasharray="1 4" strokeLinecap="round" />;
  const art = (() => {
    switch (step) {
      case 'move':
        return <>
          <MiniBlock x={-30} y={-9} fill="#eeac7f" dir="right" seed={11} />
          <g transform="translate(-3 0)">{pen}<path d="M3,-4 L7,0 L3,4" fill="none" stroke={PEN} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></g>
          {textLine(10, 0, 22, '#b85a22', 4)}
        </>;
      case 'seq':
        return <>
          <MiniBlock x={-30} y={-21} w={17} fill="#eeac7f" dir="right" seed={12} />
          <MiniBlock x={-30} y={-6} w={17} fill="#eeac7f" dir="right" seed={13} />
          <MiniBlock x={-30} y={9} w={17} fill="#a9c3de" dir="up" seed={14} />
          {textLine(4, -14, 24, '#b85a22', 5)}
          {textLine(4, 1, 24, '#b85a22', 6)}
          {textLine(4, 16, 18, PEN, 7)}
        </>;
      case 'repeat':
        return <>
          <path d="M-14,-2 C-30,-4 -30,-22 -14,-22 C2,-22 4,-8 -6,-4" fill="none" stroke={PEN} strokeWidth={2.4} strokeLinecap="round" />
          <path d="M-12,-9 L-5,-3 L-13,1" fill="none" stroke={PEN} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          <text x={-15} y={-9} textAnchor="middle" className="tx-icon-n">3</text>
          {textLine(6, -12, 26, INK, 8)}
          {textLine(14, 6, 18, '#b85a22', 9)}
          <path d="M6,1 L6,10" stroke={INK} strokeWidth={1.4} strokeDasharray="2 3" opacity={0.6} />
        </>;
      case 'typo':
        return <>
          {textLine(-30, -10, 52, '#b85a22', 10)}
          <g transform="translate(2 6) rotate(-20)">
            <path d="M-13,-5 L13,-5 L13,5 L-13,5 Z" fill="#f2d98c" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
            <path d="M-4,-5 L-4,5 M4,-5 L4,5" stroke={INK} strokeWidth={1.2} opacity={0.6} />
            <circle cx={-8.5} cy={0} r={1} fill={INK} /><circle cx={8.5} cy={0} r={1} fill={INK} />
          </g>
        </>;
      case 'if':
        return <>
          <path d={blob(2, 12, 11, 8, { wob: 0.1, n: 8, seed: 21 })} transform="translate(1.5 2)" fill={SHADOW} />
          <path d={blob(2, 12, 11, 8, { wob: 0.1, n: 8, seed: 21 })} fill="#bdb09c" stroke={INK} strokeWidth={2} />
          <path d="M-24,14 C-16,-22 18,-22 26,12" fill="none" stroke={PEN} strokeWidth={2.4} strokeDasharray="2 5" strokeLinecap="round" />
          <path d="M20,7 L26,13 L30,5" fill="none" stroke={PEN} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </>;
      case 'write':
        return <>
          {textLine(-30, 12, 30, PEN, 11)}
          <g transform="translate(12 -2) rotate(38)">
            <path d="M-4,-16 L4,-16 L4,9 L0,16 L-4,9 Z" fill="#f0d27a" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
            <path d="M-4,9 L4,9" stroke={INK} strokeWidth={1.2} />
            <path d="M-4,-16 L4,-16 L4,-10 L-4,-10 Z" fill="#e7a3a0" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
          </g>
        </>;
    }
  })();
  return (
    <svg className="tx-step-icon" viewBox="-36 -30 72 60" width={size} height={size * 0.83} overflow="visible" aria-hidden="true">
      <g filter="url(#rough)" strokeLinejoin="round">{art}</g>
    </svg>
  );
});

/** The bar's doodle: a block, a blue pen arrow, and the same thing as lines of text. */
export function BlockToTextDoodle() {
  return (
    <svg className="tx-doodle doodle" viewBox="0 0 96 50" width={96} height={50} aria-hidden="true">
      <g filter="url(#rough)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4,12 L34,12 L34,38 L4,38 Z" transform="translate(2 3)" fill={SHADOW} />
        <path d="M4,12 L34,12 L34,38 L4,38 Z" fill="#eeac7f" stroke={INK} strokeWidth={2.2} />
        <path d="M11,25 L27,25 M21,19 L27,25 L21,31" fill="none" stroke={INK} strokeWidth={2.6} />
        <path d={wobblyLine(40, 25, 52, 25, { seed: 4 })} fill="none" stroke={PEN} strokeWidth={2.4} strokeDasharray="1 5" />
        <path d="M49,20 L55,25 L49,30" fill="none" stroke={PEN} strokeWidth={2.4} />
        <path d="M62,15 L90,15" stroke="#c0672f" strokeWidth={3.4} />
        <path d="M62,25 L68,25 M70,25 L84,25" stroke={INK} strokeWidth={3.4} />
        <path d="M68,35 L88,35" stroke={PEN} strokeWidth={3.4} />
      </g>
    </svg>
  );
}

// ------------------------------------------------------------------ a predict answer: the board, small

const CS = 46;

/** A rock as on the board, small. */
function Rock({ c, r, seed }: { c: number; r: number; seed: number }) {
  const x = c * CS + CS / 2, y = r * CS + CS / 2 + 4;
  return (
    <g>
      <path d={blob(x + 2, y + 3, CS * 0.34, CS * 0.25, { wob: 0.09, n: 8, seed })} fill="#9f937f" />
      <path d={blob(x, y, CS * 0.34, CS * 0.25, { wob: 0.09, n: 8, seed })} fill="#bdb09c" stroke={INK} strokeWidth={2.2} />
    </g>
  );
}

/** A little ink burst with a yellow star: where the character bumped (never a red cross). */
function BumpStar({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(0.9)`} className="tx-bump">
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        return <path key={i} d={`M${(Math.cos(a) * 11).toFixed(1)},${(Math.sin(a) * 10).toFixed(1)} L${(Math.cos(a) * 19).toFixed(1)},${(Math.sin(a) * 17).toFixed(1)}`} stroke={INK} strokeWidth={2.2} strokeLinecap="round" />;
      })}
      <path d="M0,-9 L2.5,-2.7 9,-2.7 4,1.6 5.8,8 0,4.3 -5.8,8 -4,1.6 -9,-2.7 -2.5,-2.7Z" fill="#f0d27a" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
    </g>
  );
}

/**
 * One drawn answer of a predict item: the item's board (its rocks, the
 * dotted start), the character standing where this answer says it ends,
 * and a bump star on its right when the answer says it bumps.
 */
export const EndBoard = memo(function EndBoard({ board, end, bump }: { board: Board; end: Cell; bump?: boolean }) {
  const w = board.cols * CS, h = board.rows * CS;
  const top = 44;
  const floor = wobblyPoly([[0, 0], [w, 0], [w, h], [0, h]], { wob: 0.6, bow: 1, seed: board.seed });
  const lines: string[] = [];
  for (let c = 1; c < board.cols; c++) lines.push(wobblyLine(c * CS, 2, c * CS, h - 2, { seed: c + board.seed, bow: 0.8 }));
  for (let r = 1; r < board.rows; r++) lines.push(wobblyLine(2, r * CS, w - 2, r * CS, { seed: r * 7 + board.seed, bow: 0.8 }));
  const s = board.start;
  return (
    <svg className="tx-endboard" viewBox={`-8 ${-top} ${w + 16} ${h + top + 10}`} aria-hidden="true" overflow="visible">
      <g filter="url(#rough)">
        <path d={floor} transform="translate(3 4)" fill={SHADOW} />
        <path d={floor} fill="#f6efdf" stroke={INK} strokeWidth={2.6} />
        <path d={lines.join(' ')} fill="none" stroke={INK} strokeWidth={1.4} opacity={0.35} />
        {board.obstacles.map((o, i) => <Rock key={i} c={o.c} r={o.r} seed={o.seed} />)}
      </g>
      <ellipse cx={s.c * CS + CS / 2} cy={s.r * CS + CS * 0.8} rx={CS * 0.3} ry={CS * 0.09} fill="none" stroke={PEN} strokeWidth={2.2} strokeDasharray="2 5" strokeLinecap="round" />
      <ScenePlayer x={end.c * CS + CS / 2} y={end.r * CS + CS * 0.82} w={CS * 1.25} className="tx-mini-me" />
      {bump && <BumpStar x={end.c * CS + CS} y={end.r * CS + CS * 0.45} />}
    </svg>
  );
});

/** The note under a line with an error: a blue pen arrow up to the line. */
export function NoteArrow() {
  return (
    <svg className="tx-note-arrow" viewBox="0 0 34 30" width={34} height={30} aria-hidden="true">
      <path d="M8,28 Q6,14 20,6" fill="none" stroke={PEN} strokeWidth={2.6} strokeLinecap="round" />
      <path d="M12,5 L21,5 L19,13" fill="none" stroke={PEN} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
