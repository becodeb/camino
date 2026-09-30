// The drawings of "Del bloque al texto": the item stamps of the bar (one
// small page per item, its kind drawn on it: an eye to read and guess, a
// number, a patch for a slip, a block turning into lines, a pencil), the
// bar's doodle (a block, a blue pen arrow, lines of text), and the drawn
// answers of a predict item (the item's own board, small, with the dotted
// start and the character where it ends, a bump star if it bumped). Ink
// boiled by #rough, flat colours, blue pen for marks.

import { memo } from 'react';
import { blob, wobblyLine, wobblyPoly } from '../ink/ink.js';
import type { Board, Cell } from '../game/model';
import { ScenePlayer } from '../screens/player';
import type { TextItem, TextItemKind } from './textProbe';

const INK = '#2b2622';
const PEN = '#3d6ea5';
const SHADOW = 'rgba(84, 62, 38, 0.2)';
const PAPER = '#fbf7ee';

/** What each kind of item draws on its stamp. */
export function KindGlyph({ kind }: { kind: TextItemKind }) {
  switch (kind) {
    case 'predict':
      return (
        <g>
          <path d="M-9,0 Q0,-8 9,0 Q0,8 -9,0 Z" fill={PAPER} stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
          <circle cx={0} cy={0} r={3} fill={INK} />
          <text x={8} y={-4} className="tx-stamp-q">?</text>
        </g>
      );
    case 'number':
      return <text x={0} y={7} textAnchor="middle" className="tx-stamp-n">3</text>;
    case 'typo':
      return (
        <g transform="rotate(-24)">
          <path d="M-10,-4 L10,-4 L10,4 L-10,4 Z" fill="#f2d98c" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
          <path d="M-3,-4 L-3,4 M3,-4 L3,4" stroke={INK} strokeWidth={1.2} opacity={0.6} />
          <circle cx={-6.5} cy={0} r={0.9} fill={INK} /><circle cx={6.5} cy={0} r={0.9} fill={INK} />
        </g>
      );
    case 'blocks_to_text':
      return (
        <g>
          <path d="M-10,-9 L-2,-9 L-2,-1 L-10,-1 Z" fill="#eeac7f" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
          <path d="M-8,5 L-2,5 M-8,9 L-4,9" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
          <path d="M1,-5 Q5,-7 7,-3" fill="none" stroke={PEN} strokeWidth={1.8} strokeLinecap="round" />
          <path d="M3,4 L10,4 M5,8 L10,8" stroke={PEN} strokeWidth={2} strokeLinecap="round" />
        </g>
      );
    case 'write':
      return (
        <g transform="rotate(38)">
          <path d="M-3,-11 L3,-11 L3,6 L0,11 L-3,6 Z" fill="#f0d27a" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
          <path d="M-3,6 L3,6" stroke={INK} strokeWidth={1.2} />
          <path d="M-3,-11 L3,-11 L3,-7 L-3,-7 Z" fill="#e7a3a0" stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
        </g>
      );
  }
}

/**
 * The items as small pages in the bar: the one on screen circled in blue
 * pen, the ones finished ticked, the stretch one dashed (it is optional).
 * Each is a button (a big target round a small drawing): the child goes to
 * any item, in any order.
 */
export function ItemStamps({ items, at, finished, onGo }: { items: readonly TextItem[]; at: number; finished: ReadonlySet<string>; onGo(i: number): void }) {
  return (
    <span className="tx-stamps" role="list" aria-label="Desafíos">
      {items.map((it, i) => {
        const state = i === at ? 'here' : finished.has(it.id) ? 'done' : 'todo';
        const d = wobblyPoly([[-12, -15], [12, -15], [12, 15], [-12, 15]], { wob: 0.4, seed: i + 7 });
        return (
          <button key={it.id} type="button" role="listitem" className={`tx-stamp is-${state}${it.kind === 'write' ? ' is-stretch' : ''}`} data-item={it.id} aria-label={`Desafío ${i + 1}`} onClick={() => onGo(i)}>
            <svg viewBox="-16 -19 32 38" width={30} height={36} overflow="visible" aria-hidden="true">
              <g filter="url(#rough)">
                <path d={d} transform="translate(2 3)" fill={SHADOW} />
                <path d={d} fill={state === 'done' ? '#efe6d2' : PAPER} stroke={INK} strokeWidth={2} strokeDasharray={it.kind === 'write' ? '4 3' : undefined} />
                <KindGlyph kind={it.kind} />
              </g>
              {state === 'here' && <path d="M-3,-20 C14,-21 21,-8 19,6 C17,20 -4,24 -15,15 C-24,6 -20,-16 -1,-19" fill="none" stroke={PEN} strokeWidth={2.4} strokeLinecap="round" />}
              {state === 'done' && <path d="M-6,9 L-1,14 L10,1" fill="none" stroke={PEN} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
            </svg>
          </button>
        );
      })}
    </span>
  );
}

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
