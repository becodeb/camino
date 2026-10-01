// "Del bloque al texto" (5to; T8 of the pilot playtest, rebuilt from zero in
// T16 for children who have never seen code): the fixed steps, the same for
// every child, and the pure rules around them. The screens are in
// TextProbe.tsx; the text language in game/textCode.ts.
//
// One idea at a time, always from the blocks the children know to the text:
// each step first shows a block program next to its text (`teach`: the
// child runs it, the line and its block light together), then gives one very
// small task with that idea; only then the next idea.
//
//   1 move    a move block is a line: `derecha()`.        task: pick which of two lines is this arrow
//   2 seq     several blocks, several lines, top to bottom. task: change one word (derecha → arriba)
//   3 repeat  repetir is `for i in range(3):` + an indented line.  task: change the number
//   4 typo    the computer only knows the exact words.    task: fix one slip ("¿Será «derecha»?")
//   5 if      si is `if hay_piedra():` + an indented `saltar()`.   task: predict where it ends without the rock
//   6 write   (the stretch, "si querés") write one line.

import { openBoard } from '../curriculum/boards';
import type { Board, Cell, Program } from '../game/model';
import { parseText, runText, toProgram, type Stmt } from '../game/textCode';

export type TxStep = 'move' | 'seq' | 'repeat' | 'typo' | 'if' | 'write';
export const STEPS: readonly TxStep[] = ['move', 'seq', 'repeat', 'typo', 'if', 'write'];
/** The steps that count as "the probe done" (the stretch is optional). */
export const CORE_STEPS: readonly TxStep[] = ['move', 'seq', 'repeat', 'typo', 'if'];

/** Short names (the adult's small print, the data). */
export const STEP_NAME: Record<TxStep, string> = {
  move: 'un bloque es una línea', seq: 'varias líneas', repeat: 'repetir es for', typo: 'arreglar una letra', if: 'si es if', write: 'escribir una línea',
};

/** A note in blue pen to the right of a line, saying what it means. */
export interface Gloss { line: number; text: string }

/** The teaching half of a step: a block program and its text, run once. */
export interface Teach {
  board: Board;
  text: string;
  /** Said when the screen opens, by 🔊 and ✋ 1 (es-AR, short). */
  say: string;
  /** Said after the run. */
  after: string;
  glosses: Gloss[];
}

export type TaskKind = 'pick' | 'word' | 'number' | 'typo' | 'predict' | 'write';
export const TASK_KINDS: readonly TaskKind[] = ['pick', 'word', 'number', 'typo', 'predict', 'write'];

interface TaskBase { id: string; kind: TaskKind; say: string }

/** Which of two lines is this block (one block, two lines of text). */
export interface PickTask extends TaskBase {
  kind: 'pick';
  /** The block shown (an engine command). */
  block: string;
  options: { id: string; text: string; say: string }[];
  answer: string;
  right: string;
}

/** A word marked in the editor: line (1-based), columns [from, to). */
export interface Mark { line: number; from: number; to: number }

/** Change a word or a number, fix a slip, write a line: the editor, then ▶ to the seed. */
export interface EditTask extends TaskBase {
  kind: 'word' | 'number' | 'typo' | 'write';
  board: Board;
  text: string;
  /** A version that reaches the seed (✋ 3 writes it, as the ghost). */
  fixed: string;
  /** Where the caret starts (when nothing is marked). */
  caret: { line: number; col: number };
  /** The word to change, marked; tapping it selects it, so typing replaces it. */
  mark?: Mark;
  /** The line ✋ 2 points at. */
  focusLine: number;
  /** The hint under the program: words, and the keys to type (drawn as keys). */
  hint?: { words: string; keys?: string };
  /** The word bank (the stretch): the moves the child knows, as blocks and as text. */
  bank?: boolean;
}

/** A drawn answer: where the character ends. */
export interface EndOption { id: string; end: Cell; bump?: boolean }

/** Read the text, pick where the character ends among three drawings, then watch it run. */
export interface PredictTask extends TaskBase {
  kind: 'predict';
  board: Board;
  text: string;
  options: EndOption[];
  answer: string;
  focusLine: number;
  /** Said after the run: the right pick, another pick. */
  right: string;
  other: string;
}

export type Task = PickTask | EditTask | PredictTask;

export interface StepDef {
  id: TxStep;
  teach: Teach | null;
  task: Task;
  optional?: boolean;
}

// ------------------------------------------------------------------ the steps

export const STEP_DEFS: Record<TxStep, StepDef> = {
  move: {
    id: 'move',
    teach: {
      board: openBoard({ cols: 3, rows: 1, start: [0, 0], goal: [1, 0], seed: 9101, grass: [[2, 0]] }),
      text: 'derecha()',
      say: 'Los bloques también se pueden escribir con letras. Mirá: esta flecha se escribe así, derecha. Tocá Probar.',
      after: '¡Eso! derecha es la flecha. ¡Esto es lo que usan los programadores!',
      glosses: [{ line: 1, text: 'la flecha' }],
    },
    task: {
      id: 'move_pick',
      kind: 'pick',
      block: 'up',
      options: [
        { id: 'abajo', text: 'abajo()', say: 'Esa es abajo: la flecha para abajo. Probá con la otra.' },
        { id: 'arriba', text: 'arriba()', say: '' },
      ],
      answer: 'arriba',
      right: '¡Sí! arriba es la flecha para arriba.',
      say: 'Ahora vos. ¿Cuál de estas dos líneas es esta flecha? Tocala.',
    },
  },
  seq: {
    id: 'seq',
    teach: {
      board: openBoard({ cols: 3, rows: 2, start: [0, 1], goal: [2, 0], seed: 9201, grass: [[0, 0]] }),
      text: 'derecha()\nderecha()\narriba()',
      say: 'Con varios bloques pasa lo mismo: cada bloque es una línea, y se leen de arriba para abajo. Tocá Probar y mirá cómo se prende cada línea.',
      after: '¡Muy bien! Un bloque, una línea.',
      glosses: [{ line: 1, text: 'primero' }, { line: 3, text: 'al final' }],
    },
    task: {
      id: 'seq_word',
      kind: 'word',
      board: openBoard({ cols: 4, rows: 2, start: [0, 1], goal: [2, 0], seed: 9211, grass: [[3, 0], [0, 0]] }),
      text: 'derecha()\nderecha()\nderecha()',
      fixed: 'derecha()\nderecha()\narriba()',
      caret: { line: 3, col: 0 },
      mark: { line: 3, from: 0, to: 7 },
      focusLine: 3,
      hint: { words: 'Cambiá derecha por', keys: 'arriba' },
      say: 'Ahora vos. Tiene que llegar a la semilla. Tocá la palabra marcada y escribí arriba. Después tocá Probar.',
    },
  },
  repeat: {
    id: 'repeat',
    teach: {
      board: openBoard({ cols: 4, rows: 1, start: [0, 0], goal: [3, 0], seed: 9301 }),
      text: 'for i in range(3):\n    derecha()',
      say: 'Este es el bloque repetir. Con letras se escribe for. Quiere decir: repetí 3 veces lo que está corrido a la derecha. Tocá Probar.',
      after: '¡Eso! derecha se hizo 3 veces.',
      glosses: [{ line: 1, text: 'repetí 3 veces' }, { line: 2, text: 'lo corrido se repite' }],
    },
    task: {
      id: 'repeat_number',
      kind: 'number',
      board: openBoard({ cols: 5, rows: 1, start: [0, 0], goal: [4, 0], seed: 9311 }),
      text: 'for i in range(2):\n    derecha()',
      fixed: 'for i in range(4):\n    derecha()',
      caret: { line: 1, col: 16 },
      mark: { line: 1, from: 15, to: 16 },
      focusLine: 1,
      hint: { words: 'Tocá el número y escribí otro' },
      say: 'Ahora vos. Tiene que llegar a la semilla. Cambiá el número marcado y tocá Probar.',
    },
  },
  typo: {
    id: 'typo',
    teach: null,
    task: {
      id: 'typo_fix',
      kind: 'typo',
      board: openBoard({ cols: 3, rows: 2, start: [0, 1], goal: [2, 0], seed: 9401, grass: [[2, 1]] }),
      text: 'arriba()\ndrecha()\nderecha()',
      fixed: 'arriba()\nderecha()\nderecha()',
      caret: { line: 2, col: 1 },
      focusLine: 2,
      say: 'A veces, al escribir, se escapa una letra. La compu solo entiende las palabras justas. Tocá Probar y fijate qué te dice.',
    },
  },
  if: {
    id: 'if',
    teach: {
      board: openBoard({ cols: 5, rows: 1, start: [0, 0], goal: [4, 0], seed: 9501, rocks: [[2, 0]] }),
      text: 'derecha()\nif hay_piedra():\n    saltar()\nderecha()',
      say: 'Este es el bloque si. Con letras se escribe if. Si hay una piedra adelante, hace lo que está corrido: saltar. Tocá Probar.',
      after: '¡Saltó la piedra!',
      glosses: [{ line: 2, text: 'si hay piedra…' }, { line: 3, text: '…saltá' }],
    },
    task: {
      id: 'if_predict',
      kind: 'predict',
      board: openBoard({ cols: 5, rows: 1, start: [0, 0], goal: null, seed: 9511, grass: [[3, 0]] }),
      text: 'derecha()\nif hay_piedra():\n    saltar()\nderecha()',
      options: [
        { id: 'end_4', end: { c: 4, r: 0 } },
        { id: 'end_2', end: { c: 2, r: 0 } },
        { id: 'end_1', end: { c: 1, r: 0 } },
      ],
      answer: 'end_2',
      focusLine: 2,
      right: '¡Eso! No había piedra, así que no saltó.',
      other: 'Mirá: no había piedra, así que no saltó. Solo salta si hay piedra.',
      say: 'Ahora sacamos la piedra. Es el mismo programa. ¿Dónde termina? Tocá un dibujo.',
    },
  },
  write: {
    id: 'write',
    optional: true,
    teach: null,
    task: {
      id: 'write_line',
      kind: 'write',
      board: openBoard({ cols: 3, rows: 2, start: [0, 1], goal: [2, 0], seed: 9601, grass: [[0, 0]] }),
      text: 'derecha()\nderecha()\n',
      fixed: 'derecha()\nderecha()\narriba()',
      caret: { line: 3, col: 0 },
      focusLine: 3,
      bank: true,
      say: 'Y ahora, si querés, escribí vos una línea entera: que suba a la semilla. Escribila en el renglón vacío y tocá Probar.',
    },
  },
};

/** The moves of the word bank: each block and its text. */
export const BANK: readonly { cmd: string; text: string }[] = [
  { cmd: 'right', text: 'derecha()' }, { cmd: 'left', text: 'izquierda()' }, { cmd: 'up', text: 'arriba()' }, { cmd: 'down', text: 'abajo()' },
];

// ------------------------------------------------------------------ rules

const parsed = (text: string): Stmt[] => {
  const p = parseText(text);
  if (!p.ok) throw new Error(p.error.show);
  return p.code;
};

/** A text reaches the board's seed (it parses and the run wins). */
export function textWins(board: Board, text: string): boolean {
  const p = parseText(text);
  return p.ok && runText(board, p.code).trace.outcome === 'win';
}

/** Where a predict task's program really ends, and whether it bumped. */
export function predictEnd(t: PredictTask): { end: Cell; bump: boolean } {
  const tr = runText(t.board, parsed(t.text)).trace;
  return { end: { c: tr.final.c, r: tr.final.r }, bump: tr.outcome === 'crash' };
}

/** The blocks of a text (null while it does not parse or has no blocks). */
export function blocksOfText(text: string): Program | null {
  const p = parseText(text);
  return p.ok ? toProgram(p.code) : null;
}

/**
 * The live note of a `for` line (the number task): "repetí N veces" with the
 * number the text has now, so the meaning follows the child's edit.
 */
export function liveGlosses(text: string): Gloss[] {
  const p = parseText(text);
  if (!p.ok) return [];
  return p.code.flatMap((s) => (s.k === 'for' ? [{ line: s.line, text: `repetí ${s.count} ${s.count === 1 ? 'vez' : 'veces'}` }] : []));
}

/** Whether the marked word is still as it was (the mark goes once the child changed it). */
export function markIntact(task: EditTask, text: string): boolean {
  if (!task.mark) return false;
  const m = task.mark;
  const now = text.split('\n')[m.line - 1] ?? '';
  const was = task.text.split('\n')[m.line - 1] ?? '';
  return now === was;
}

// ------------------------------------------------------------------ times

export interface TxTimes {
  /** "Seguir" shows in the bar after this long on a task not done (nobody gets stuck). */
  skipMs: number;
  /** A teaching screen's next arrow shows after its run, or after this long anyway. */
  teachNextMs: number;
  /** The stretch's next arrow (it is optional). */
  writeNextMs: number;
  /** A screen done turns by itself after this long (or the arrow). */
  autoTurnMs: number;
}
export const TIMES: TxTimes = { skipMs: 90_000, teachNextMs: 30_000, writeNextMs: 30_000, autoTurnMs: 12_000 };
/** `?caps=fast` (the scripted checks): the same rules in seconds. */
export const FAST_TIMES: TxTimes = { skipMs: 6_000, teachNextMs: 3_000, writeNextMs: 3_000, autoTurnMs: 12_000 };
export const timesFrom = (search: string): TxTimes => (/[?&]caps=fast\b/.test(search) ? FAST_TIMES : TIMES);

/** Spoken lines (es-AR): encouraging, never "difícil", never "incorrecto". */
export const TX_SAY = {
  intro: 'Del bloque al texto. Vas a ver cómo se escriben con letras los bloques que ya conocés.',
  won: '¡Llegó!',
  wonTask: ['¡Llegó! Lo escribiste vos.', '¡Muy bien! Así se programa con letras.', '¡Genial! Eso es programar con letras.'],
  short: 'Casi. No llegó a la semilla. Mirá las líneas otra vez.',
  bump: '¡Uy, se chocó! Mirá las líneas otra vez.',
  hint: 'Fijate en esta línea.',
  ghost: 'Mirá, así queda.',
  skip: 'Seguimos con otra cosa.',
  tryRun: 'Ahora tocá Probar.',
  liked: '¿Te gustó escribir el programa?',
  cheer: '¡Muy bien! Escribiste como los programadores.',
};
