// "Del bloque al texto" (5to, T8 of the pilot playtest): the fixed items,
// the same for every child, and the pure rules around them. The screens are
// in TextProbe.tsx; the text language in game/textCode.ts.
//
// A short tour first (the same program as blocks and as text, run with the
// line lit on both sides), then eight items the child moves through freely:
//   predict        read a text program (no blocks), pick where the character
//                  ends among three drawn boards, then watch it run;
//   number         change the number of a `for` so the character reaches the seed;
//   typo           fix a slip (a misspelt name, a missing `:`), run it;
//   blocks_to_text pick which of three texts is the program in blocks;
//   write          (the stretch) write one line: `saltar()` inside an `if`.

import { openBoard } from '../curriculum/boards';
import type { Board, Cell, Program } from '../game/model';
import { parseText, runText, toProgram } from '../game/textCode';

export type TextItemKind = 'predict' | 'number' | 'typo' | 'blocks_to_text' | 'write';
export const ITEM_KINDS: readonly TextItemKind[] = ['predict', 'number', 'typo', 'blocks_to_text', 'write'];

/** A drawn answer of a predict item: where the character ends (and whether it bumped there). */
export interface EndOption { id: string; end: Cell; bump?: boolean }

interface Base {
  id: string;
  kind: TextItemKind;
  /** Spoken when the item opens and by 🔊 (es-AR, short). */
  say: string;
  /** For the adult (small print in the bar). */
  title: string;
}

export interface PredictItem extends Base {
  kind: 'predict';
  board: Board;
  text: string;
  options: EndOption[];
  answer: string;
  /** Help's second step points at this line (the loop, the if). */
  focusLine: number;
}

export interface EditItem extends Base {
  kind: 'number' | 'typo' | 'write';
  board: Board;
  /** What the editor starts with. */
  text: string;
  /** A fixed version (help's third step writes it as a ghost edit). */
  fixed: string;
  /** Where the caret starts: line (1-based) and column (0-based). */
  caret: { line: number; col: number };
  /** The line the help points at (the number, the slip, the empty line). */
  focusLine: number;
  /** Show the blocks beside the text (number and write: yes; a typo: no, the blocks would give the fix away). */
  blocks: boolean;
}

export interface ChoiceItem extends Base {
  kind: 'blocks_to_text';
  /** The program in blocks. */
  program: Program;
  /** Three texts; `answer` is the id of the one that is the same program. */
  options: { id: string; text: string }[];
  answer: string;
  /** Help's second step points at this line of every option (where they differ). */
  focusLine: number;
}

export type TextItem = PredictItem | EditItem | ChoiceItem;

// ------------------------------------------------------------------ the tour

export const TOUR = {
  board: openBoard({ cols: 5, rows: 2, start: [0, 1], goal: [3, 1], seed: 8101, grass: [[4, 0], [1, 1]] }),
  text: 'arriba()\nfor i in range(3):\n    derecha()\nabajo()',
  say: 'Mirá: es el mismo programa, con bloques y con letras. Tocá una línea y fijate qué bloque es. Después tocá Probar.',
};

// ------------------------------------------------------------------ the items

/** The items in order (the stamps' order). Answer positions are fixed: 2nd, 1st, 3rd, 2nd. */
export const ITEMS: readonly TextItem[] = [
  {
    id: 'predict_loop',
    kind: 'predict',
    title: 'Adiviná: un for',
    say: 'Leé el programa. ¿Dónde va a terminar? Tocá el dibujo.',
    board: openBoard({ cols: 5, rows: 4, start: [0, 3], goal: null, seed: 8111, rocks: [[4, 0]], grass: [[3, 3], [4, 2]] }),
    text: 'derecha()\nfor i in range(3):\n    arriba()\nderecha()',
    options: [
      { id: 'end_1_0', end: { c: 1, r: 0 } },
      { id: 'end_2_0', end: { c: 2, r: 0 } },
      { id: 'end_2_2', end: { c: 2, r: 2 } },
    ],
    answer: 'end_2_0',
    focusLine: 2,
  },
  {
    id: 'predict_if',
    kind: 'predict',
    title: 'Adiviná: un if adentro de un for',
    say: 'Leé el programa. ¿Qué va a pasar? Tocá el dibujo.',
    board: openBoard({ cols: 9, rows: 1, start: [0, 0], goal: null, seed: 8121, rocks: [[2, 0], [5, 0]] }),
    text: 'for i in range(4):\n    if hay_piedra():\n        saltar()\n    derecha()',
    options: [
      { id: 'end_8', end: { c: 8, r: 0 } },
      { id: 'bump_1', end: { c: 1, r: 0 }, bump: true },
      { id: 'end_4', end: { c: 4, r: 0 } },
    ],
    answer: 'end_8',
    focusLine: 2,
  },
  {
    id: 'number',
    kind: 'number',
    title: 'Cambiá un número',
    say: 'Tiene que subir más para llegar a la semilla. Cambiá el número y tocá Probar.',
    board: openBoard({ cols: 3, rows: 5, start: [0, 4], goal: [2, 0], seed: 8131, rocks: [[2, 3]], grass: [[0, 0], [2, 4]] }),
    text: 'derecha()\nfor i in range(2):\n    arriba()\nderecha()',
    fixed: 'derecha()\nfor i in range(4):\n    arriba()\nderecha()',
    caret: { line: 2, col: 16 },
    focusLine: 2,
    blocks: true,
  },
  {
    id: 'typo_name',
    kind: 'typo',
    title: 'Arreglá: una palabra',
    say: 'Este programa tiene un error. Tocá Probar, mirá qué dice y arreglalo.',
    board: openBoard({ cols: 4, rows: 2, start: [0, 1], goal: [2, 1], seed: 8141, rocks: [[1, 1]], grass: [[3, 0]] }),
    text: 'arriba()\nderecha()\ndrecha()\nabajo()',
    fixed: 'arriba()\nderecha()\nderecha()\nabajo()',
    caret: { line: 3, col: 0 },
    focusLine: 3,
    blocks: false,
  },
  {
    id: 'typo_colon',
    kind: 'typo',
    title: 'Arreglá: un signo',
    say: 'Este también tiene un error. Tocá Probar, mirá qué dice y arreglalo.',
    board: openBoard({ cols: 4, rows: 3, start: [0, 2], goal: [2, 0], seed: 8151, rocks: [[0, 0]], grass: [[3, 2]] }),
    text: 'for i in range(2)\n    derecha()\n    arriba()',
    fixed: 'for i in range(2):\n    derecha()\n    arriba()',
    caret: { line: 1, col: 0 },
    focusLine: 1,
    blocks: false,
  },
  {
    id: 'blocks_loop',
    kind: 'blocks_to_text',
    title: 'De bloques a letras: el for',
    say: '¿Cuál de los tres es el mismo programa que los bloques? Tocalo.',
    program: [{ t: 'cmd', cmd: 'right' }, { t: 'loop', count: 3, body: ['up', 'right'] }],
    options: [
      { id: 'outside', text: 'derecha()\nfor i in range(3):\n    arriba()\nderecha()' },
      { id: 'count2', text: 'derecha()\nfor i in range(2):\n    arriba()\n    derecha()' },
      { id: 'same', text: 'derecha()\nfor i in range(3):\n    arriba()\n    derecha()' },
    ],
    answer: 'same',
    focusLine: 4,
  },
  {
    id: 'blocks_until',
    kind: 'blocks_to_text',
    title: 'De bloques a letras: repetir hasta llegar',
    say: '¿Cuál de los tres es el mismo programa que los bloques? Tocalo.',
    program: [{ t: 'loop', count: 'goal', body: ['ifrock:right', 'right'] }],
    options: [
      { id: 'inside_if', text: 'while not llegue():\n    if hay_piedra():\n        saltar()\n        derecha()' },
      { id: 'same', text: 'while not llegue():\n    if hay_piedra():\n        saltar()\n    derecha()' },
      { id: 'for3', text: 'for i in range(3):\n    if hay_piedra():\n        saltar()\n    derecha()' },
    ],
    answer: 'same',
    focusLine: 4,
  },
  {
    id: 'write_if',
    kind: 'write',
    title: 'Escribí una línea (si querés)',
    say: 'Falta una línea: si hay piedra, que salte. Escribila en el renglón vacío y tocá Probar.',
    board: openBoard({ cols: 8, rows: 1, start: [0, 0], goal: [7, 0], seed: 8161, rocks: [[2, 0], [5, 0]] }),
    text: 'while not llegue():\n    if hay_piedra():\n        \n    derecha()',
    fixed: 'while not llegue():\n    if hay_piedra():\n        saltar()\n    derecha()',
    caret: { line: 3, col: 8 },
    focusLine: 3,
    blocks: true,
  },
];

export const itemById = (id: string) => ITEMS.find((it) => it.id === id) ?? null;

// ------------------------------------------------------------------ rules

/** A text wins its item's board (it parses and the run reaches the seed). */
export function textWins(item: EditItem, text: string): boolean {
  const p = parseText(text);
  return p.ok && runText(item.board, p.code).trace.outcome === 'win';
}

/** Where the predict item's program really ends, and whether it bumped. */
export function predictEnd(item: PredictItem): { end: Cell; bump: boolean } {
  const p = parseText(item.text);
  if (!p.ok) throw new Error(`${item.id}: ${p.error.show}`);
  const t = runText(item.board, p.code).trace;
  return { end: { c: t.final.c, r: t.final.r }, bump: t.outcome === 'crash' };
}

/** The blocks shown for a text (null while it does not parse or has no blocks). */
export function blocksOfText(text: string): Program | null {
  const p = parseText(text);
  return p.ok ? toProgram(p.code) : null;
}

/**
 * When the next-page button shows on an item: once it is finished (a pick,
 * or a run that won), or after a while anyway so a stuck child can move on
 * (the stretch item sooner: it is optional).
 */
export const NEXT_AFTER_MS: Record<TextItemKind, number> = { predict: Infinity, blocks_to_text: Infinity, number: 120_000, typo: 120_000, write: 30_000 };

/** The tour's next page: after one run, or 40 s. */
export const TOUR_NEXT_MS = 40_000;

/** The next item after `i` that is not finished yet (wrapping), or null when all are. */
export function nextOpen(i: number, finished: ReadonlySet<string>): number | null {
  for (let k = 1; k <= ITEMS.length; k++) {
    const j = (i + k) % ITEMS.length;
    if (!finished.has(ITEMS[j].id)) return j;
  }
  return null;
}

/** Spoken lines (es-AR). */
export const TX_SAY = {
  intro: 'Del bloque al texto. Vas a leer y escribir programas con letras, como en Python.',
  items: 'Ahora hay varios desafíos. Andá tocando los sellos de arriba, en el orden que quieras.',
  picked: 'Anotado. Mirá qué pasa.',
  pickedBlocks: 'Anotado.',
  won: '¡Llegó!',
  short: 'No llegó a la semilla. Mirá el programa otra vez.',
  bump: '¡Se chocó! Mirá el programa otra vez.',
  hint: 'Fijate en esta línea.',
  ghost: 'Mirá, así queda.',
  done: '¡Terminaste los desafíos!',
  liked: '¿Te gustó escribir el programa?',
  cheer: '¡Muy bien! Escribiste como los programadores.',
};
