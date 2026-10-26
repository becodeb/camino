// Copa v2 garage: the pure state of the program editor. The screen (Garage.tsx)
// only calls these functions and draws the result; everything that can go wrong
// (a full memory, a block the copa does not offer, a caret that points into a
// block that is gone) is decided here and unit-tested.
//
// Interaction model (touch first, no typing):
// - There is ONE insertion point, the CARET: tapping a palette block puts it
//   there. The caret is a `Position` (the same shape the ghost hint uses):
//   the main script or the event script, the containers it sits inside
//   (`path`), and the index in that list.
// - Tapping a placed block SELECTS it and moves the caret right after it (so
//   the next block goes next to it). The selected block can be removed, moved
//   one place earlier/later in its list, and its numbers/sensors changed.
// - Adding a `repetir` or a `si` puts the caret INSIDE it (and selects it, so
//   its number can be changed): the next block lands in its body.
// - Memory: every block counts 1 (containers too), the `cuando cae un tronco`
//   hat counts 1. A block that does not fit is refused (`reason: 'full'`), the
//   program is left exactly as it was.

import {
  MAX_REPEAT, MAX_WAIT, SENSORS, allBlocks, slotCount,
  type Block, type BlockKind, type Palette, type Program, type Sensor,
} from './program';
import type { PathStep, Position } from './hints';

export type Caret = Position;

export interface EditCounts { add: number; remove: number; move: number; number: number }
export const NO_EDITS: EditCounts = { add: 0, remove: 0, move: 0, number: 0 };

export interface Rules { palette: Palette; slots: number }

export interface EditorState {
  program: Program;
  caret: Caret;
  /** The block (or the event hat) that is selected, if any. */
  selected: string | null;
  nextId: number;
  /** What the child changed since the last `takeEdits` (for the data). */
  edits: EditCounts;
}

/** Largest `repetir` count the buttons reach (the engine runs up to MAX_REPEAT). */
export const UI_MAX_REPEAT = 20;

// ------------------------------------------------------------------ locating things

/** Where the list `path` of a script is: the blocks in it (null when the path points to nothing). */
export function listAt(p: Program, script: 'main' | 'event', path: readonly PathStep[]): readonly Block[] | null {
  let list: readonly Block[] | null = script === 'main' ? p.main : p.onLog?.body ?? null;
  for (const step of path) {
    const b: Block | undefined = list?.[step.index];
    if (!b) return null;
    if (b.kind === 'repeat' && step.branch === 'body') list = b.body;
    else if (b.kind === 'if' && step.branch === 'then') list = b.then;
    else if (b.kind === 'if' && step.branch === 'else') list = b.else;
    else return null;
  }
  return list;
}

/** Applies `fn` to the list `path` points to, returning the rebuilt blocks (null when the path is wrong). */
function editList(blocks: readonly Block[], path: readonly PathStep[], fn: (l: Block[]) => Block[]): Block[] | null {
  if (!path.length) return fn([...blocks]);
  const [step, ...rest] = path;
  const b = blocks[step.index];
  if (!b) return null;
  let nb: Block | null = null;
  if (b.kind === 'repeat' && step.branch === 'body') {
    const body = editList(b.body, rest, fn);
    nb = body && { ...b, body };
  } else if (b.kind === 'if' && (step.branch === 'then' || step.branch === 'else')) {
    const list = editList(step.branch === 'then' ? b.then : b.else, rest, fn);
    nb = list && (step.branch === 'then' ? { ...b, then: list } : { ...b, else: list });
  }
  if (!nb) return null;
  const out = [...blocks];
  out[step.index] = nb;
  return out;
}

function editProgram(p: Program, script: 'main' | 'event', path: readonly PathStep[], fn: (l: Block[]) => Block[]): Program | null {
  if (script === 'main') {
    const main = editList(p.main, path, fn);
    return main && { ...p, main };
  }
  if (!p.onLog) return null;
  const body = editList(p.onLog.body, path, fn);
  return body && { ...p, onLog: { ...p.onLog, body } };
}

/** The place a block sits at: its list and its index there. */
export function locate(p: Program, id: string): Position | null {
  const walk = (blocks: readonly Block[], script: 'main' | 'event', path: PathStep[]): Position | null => {
    for (let index = 0; index < blocks.length; index++) {
      const b = blocks[index];
      if (b.id === id) return { script, path, index };
      if (b.kind === 'repeat') {
        const hit = walk(b.body, script, [...path, { index, branch: 'body' }]);
        if (hit) return hit;
      } else if (b.kind === 'if') {
        const hit = walk(b.then, script, [...path, { index, branch: 'then' }]) ?? walk(b.else, script, [...path, { index, branch: 'else' }]);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(p.main, 'main', []) ?? (p.onLog ? walk(p.onLog.body, 'event', []) : null);
}

/** The ids of the containers (and the event hat) a block sits inside, outermost first. */
export function ancestorsOf(p: Program, id: string): string[] {
  const out: string[] = [];
  const walk = (blocks: readonly Block[], trail: string[]): boolean => {
    for (const b of blocks) {
      if (b.id === id) { out.push(...trail); return true; }
      if (b.kind === 'repeat' && walk(b.body, [...trail, b.id])) return true;
      if (b.kind === 'if' && (walk(b.then, [...trail, b.id]) || walk(b.else, [...trail, b.id]))) return true;
    }
    return false;
  };
  if (walk(p.main, [])) return out;
  if (p.onLog && walk(p.onLog.body, [p.onLog.id])) return out;
  return [];
}

export const blockById = (p: Program, id: string): Block | null => allBlocks(p).find((b) => b.id === id) ?? null;

const caretValid = (p: Program, c: Caret): boolean => {
  const list = listAt(p, c.script, c.path);
  return !!list && c.index >= 0 && c.index <= list.length;
};

/** The end of the main script: where a new program starts. */
export const endOfMain = (p: Program): Caret => ({ script: 'main', path: [], index: p.main.length });

const idNumber = (id: string): number => Number(/(\d+)$/.exec(id)?.[1] ?? 0);

// ------------------------------------------------------------------ building the state

export function newEditor(program: Program = { main: [] }): EditorState {
  const ids = [...allBlocks(program).map((b) => b.id), ...(program.onLog ? [program.onLog.id] : [])];
  return { program, caret: endOfMain(program), selected: null, nextId: Math.max(0, ...ids.map(idNumber)) + 1, edits: { ...NO_EDITS } };
}

export const usage = (st: EditorState, rules: Rules): { used: number; total: number; free: number } => {
  const used = slotCount(st.program);
  return { used, total: rules.slots, free: Math.max(0, rules.slots - used) };
};

export const fits = (st: EditorState, rules: Rules, cost = 1): boolean => slotCount(st.program) + cost <= rules.slots;

/** A fresh block with its starting values. */
export function makeBlock(kind: BlockKind, rules: Pick<Rules, 'palette'>, id: string): Block {
  switch (kind) {
    case 'wait': return { id, kind, n: 1 };
    case 'repeat': return { id, kind, n: 2, body: [] };
    case 'if': return { id, kind, cond: [rules.palette.sensors[0] ?? 'puddle_ahead'], then: [], else: [] };
    case 'nitro': return { id, kind, delta: -1 };
    default: return { id, kind };
  }
}

// ------------------------------------------------------------------ editing

export type RefusedBecause = 'full' | 'not_allowed' | 'nowhere';
export type EditResult = { ok: true; state: EditorState; id?: string } | { ok: false; reason: RefusedBecause; state: EditorState };

const refuse = (state: EditorState, reason: RefusedBecause): EditResult => ({ ok: false, reason, state });
const bump = (e: EditCounts, k: keyof EditCounts): EditCounts => ({ ...e, [k]: e[k] + 1 });

/** Puts the caret at `to` (a slot the child tapped) and deselects. A caret that points to nothing is ignored. */
export function setCaret(st: EditorState, to: Caret): EditorState {
  if (!caretValid(st.program, to)) return st;
  return { ...st, caret: to, selected: null };
}

export const deselect = (st: EditorState): EditorState => (st.selected ? { ...st, selected: null } : st);

/** Taps a placed block: selects it and puts the caret right after it. The event hat selects itself and the caret goes to the start of its script. */
export function selectBlock(st: EditorState, id: string): EditorState {
  if (st.program.onLog?.id === id) return { ...st, selected: id, caret: { script: 'event', path: [], index: st.program.onLog.body.length } };
  const at = locate(st.program, id);
  if (!at) return st;
  return { ...st, selected: id, caret: { script: at.script, path: at.path, index: at.index + 1 } };
}

/** Creates the `cuando cae un tronco` script (costs 1 slot) and puts the caret inside it. */
export function addEventScript(st: EditorState, rules: Rules): EditResult {
  if (!rules.palette.event) return refuse(st, 'not_allowed');
  if (st.program.onLog) return { ok: true, state: { ...st, caret: { script: 'event', path: [], index: st.program.onLog.body.length }, selected: null } };
  if (!fits(st, rules)) return refuse(st, 'full');
  const id = `g-${st.nextId}`;
  const program: Program = { ...st.program, onLog: { id, body: [] } };
  return { ok: true, id, state: { ...st, program, caret: { script: 'event', path: [], index: 0 }, selected: id, nextId: st.nextId + 1, edits: bump(st.edits, 'add') } };
}

/** Adds a block of `kind` at `at` (default: the caret). The event script is created on the way when the caret is in it. */
export function addBlock(st: EditorState, kind: BlockKind, rules: Rules, at: Caret = st.caret): EditResult {
  if (!rules.palette.blocks.includes(kind)) return refuse(st, 'not_allowed');
  let base = st;
  let cost = 1;
  if (at.script === 'event' && !st.program.onLog) {
    if (!rules.palette.event) return refuse(st, 'nowhere');
    base = { ...st, program: { ...st.program, onLog: { id: `g-${st.nextId}`, body: [] } }, nextId: st.nextId + 1 };
    cost = 2;
  }
  if (!caretValid(base.program, at)) return refuse(st, 'nowhere');
  if (!fits(st, rules, cost)) return refuse(st, 'full');
  const id = `g-${base.nextId}`;
  const block = makeBlock(kind, rules, id);
  const program = editProgram(base.program, at.script, at.path, (l) => { l.splice(at.index, 0, block); return l; });
  if (!program) return refuse(st, 'nowhere');
  const inside: PathStep | null = kind === 'repeat' ? { index: at.index, branch: 'body' } : kind === 'if' ? { index: at.index, branch: 'then' } : null;
  const caret: Caret = inside ? { script: at.script, path: [...at.path, inside], index: 0 } : { script: at.script, path: at.path, index: at.index + 1 };
  // numbers and sensors are adjusted right away, so those blocks stay selected
  const selected = kind === 'repeat' || kind === 'if' || kind === 'wait' ? id : null;
  return { ok: true, id, state: { program, caret, selected, nextId: base.nextId + 1, edits: bump(st.edits, 'add') } };
}

/** Removes the selected block with everything inside it (the event hat takes its whole script). */
export function removeSelected(st: EditorState): EditorState {
  const id = st.selected;
  if (!id) return st;
  if (st.program.onLog?.id === id) {
    const { onLog: _gone, ...rest } = st.program;
    void _gone;
    return { ...st, program: rest, selected: null, caret: endOfMain(rest), edits: bump(st.edits, 'remove') };
  }
  const at = locate(st.program, id);
  if (!at) return { ...st, selected: null };
  const program = editProgram(st.program, at.script, at.path, (l) => { l.splice(at.index, 1); return l; });
  if (!program) return { ...st, selected: null };
  return { ...st, program, selected: null, caret: { script: at.script, path: at.path, index: at.index }, edits: bump(st.edits, 'remove') };
}

/** Moves the selected block one place earlier (-1) or later (+1) in its list. At the end of the list it stays (`moved: false`). */
export function moveSelected(st: EditorState, dir: -1 | 1): { state: EditorState; moved: boolean } {
  const id = st.selected;
  const at = id ? locate(st.program, id) : null;
  if (!id || !at) return { state: st, moved: false };
  const list = listAt(st.program, at.script, at.path) ?? [];
  const to = at.index + dir;
  if (to < 0 || to >= list.length) return { state: st, moved: false };
  const program = editProgram(st.program, at.script, at.path, (l) => { const [b] = l.splice(at.index, 1); l.splice(to, 0, b); return l; });
  if (!program) return { state: st, moved: false };
  return { state: { ...st, program, caret: { script: at.script, path: at.path, index: to + 1 }, edits: bump(st.edits, 'move') }, moved: true };
}

/** Rewrites one block (by id) keeping its place. */
function mapBlock(p: Program, id: string, fn: (b: Block) => Block): Program | null {
  const at = locate(p, id);
  if (!at) return null;
  return editProgram(p, at.script, at.path, (l) => { l[at.index] = fn(l[at.index]); return l; });
}

/** +1/-1 on a `repetir` or `esperar` number (never typed). Out of range or a `vueltas` repeat: nothing changes. */
export function bumpNumber(st: EditorState, id: string, delta: number): EditorState {
  const b = blockById(st.program, id);
  if (!b) return st;
  if (b.kind === 'repeat' && typeof b.n === 'number') {
    const n = Math.max(1, Math.min(Math.min(UI_MAX_REPEAT, MAX_REPEAT), b.n + delta));
    if (n === b.n) return st;
    const program = mapBlock(st.program, id, (x) => ({ ...x, n } as Block));
    return program ? { ...st, program, edits: bump(st.edits, 'number') } : st;
  }
  if (b.kind === 'wait') {
    const n = Math.max(1, Math.min(MAX_WAIT, b.n + delta));
    if (n === b.n) return st;
    const program = mapBlock(st.program, id, (x) => ({ ...x, n } as Block));
    return program ? { ...st, program, edits: bump(st.edits, 'number') } : st;
  }
  return st;
}

/** Copa 5 only: a `repetir` that repeats `vueltas` (the track's laps) instead of a number. */
export const lapsAllowed = (rules: Pick<Rules, 'palette'>): boolean => rules.palette.blocks.includes('nitro');

export function setLaps(st: EditorState, id: string, on: boolean, rules: Rules): EditorState {
  const b = blockById(st.program, id);
  if (!b || b.kind !== 'repeat' || !lapsAllowed(rules) || (b.n === 'laps') === on) return st;
  const program = mapBlock(st.program, id, (x) => ({ ...x, n: on ? 'laps' : 2 } as Block));
  return program ? { ...st, program, edits: bump(st.edits, 'number') } : st;
}

/** Turns a sensor on/off in a `si` (several are joined by `y`; one always stays). */
export function toggleSensor(st: EditorState, id: string, sensor: Sensor, rules: Rules): EditorState {
  const b = blockById(st.program, id);
  if (!b || b.kind !== 'if' || !rules.palette.sensors.includes(sensor)) return st;
  const has = b.cond.includes(sensor);
  if (has && b.cond.length === 1) return st;
  const cond = SENSORS.filter((s) => (s === sensor ? !has : b.cond.includes(s)));
  const program = mapBlock(st.program, id, (x) => ({ ...x, cond } as Block));
  return program ? { ...st, program, edits: bump(st.edits, 'number') } : st;
}

/** Hands the edit counts over (for the data) and starts counting again. */
export function takeEdits(st: EditorState): { counts: EditCounts; state: EditorState } {
  return { counts: st.edits, state: { ...st, edits: { ...NO_EDITS } } };
}

export const hasEdits = (e: EditCounts): boolean => e.add + e.remove + e.move + e.number > 0;

/** The same program, edited from outside (a revancha that keeps it, a hint): keeps ids unique and the caret valid. */
export function withProgram(st: EditorState, program: Program): EditorState {
  const fresh = newEditor(program);
  return { ...fresh, nextId: Math.max(fresh.nextId, st.nextId), edits: st.edits };
}

/** True when two caret/position values point to the same slot. */
export const sameSlot = (a: Caret, b: Caret): boolean =>
  a.script === b.script && a.index === b.index && a.path.length === b.path.length && a.path.every((s, i) => s.index === b.path[i].index && s.branch === b.path[i].branch);
