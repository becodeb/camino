// Copa v2 (Design v2 in odd/tasks/copa-4to.md): the kart's PROGRAM. The child
// is the engineer: one program grows across the whole Copa, and ¡Largar! runs
// it. Pure data, JSON-serializable (it is kept across a reload), no UI.
//
// The blocks (the whole set; each copa unlocks some, see tracks.ts `PALETTES`):
//
//   avanzar  (forward)  drive onto the next tile, which must be flat road
//   subir    (up)       drive up a ramp: the next tile must be a ramp up
//   bajar    (down)     drive down: the next tile must be a ramp down
//   saltar   (jump)     hop onto the next flat tile; a puddle there is flown over
//   turbo    (turbo)    avanzar at double speed; only worth it on a straight, and
//                       on a track with nitro only while the tank is not empty
//   frenar   (brake)    stop (a short time)
//   esperar n (wait)    stand still n seconds
//   repetir n [..]      run the blocks inside n times (nestable); `n` may be
//                       'laps' (the `vueltas` variable: how many laps the track has)
//   si <sensor> [y <sensor>] [..] si no [..]
//                       a place you check: `charco adelante`, `recta adelante`,
//                       `nitro > 0` (all of them must hold when joined by `y`)
//   cambiar nitro en d  the variable `nitro` (starts at the track's nitro cans)
//   cuando cae un tronco [..]
//                       the EVENT script: runs by itself the moment a log falls in
//                       front of the kart, at a moment nobody can predict, taking
//                       over from the main script until it is done
//
// Memory (the slot limit): every block counts 1, containers (`repetir`, `si`)
// included, plus its children; the event script's `cuando` hat counts 1 too
// plus its children. `si` and `si no` are one block: a `si` with an empty
// `si no` is still 1 + its children. A track's `slots` caps that count.
//
// Every block carries a stable `id` (the UI highlights it while the program
// runs, and the engine reports a crash by it). `programBuilder(prefix)` makes
// ids `<prefix>-<n>` in creation order.

export type Sensor = 'puddle_ahead' | 'straight_ahead' | 'nitro_positive';
export const SENSORS: readonly Sensor[] = ['puddle_ahead', 'straight_ahead', 'nitro_positive'];

export type LeafKind = 'forward' | 'up' | 'down' | 'jump' | 'turbo' | 'brake' | 'wait';
export type BlockKind = LeafKind | 'repeat' | 'if' | 'nitro';
export const BLOCK_KINDS: readonly BlockKind[] = ['forward', 'up', 'down', 'jump', 'turbo', 'brake', 'wait', 'repeat', 'if', 'nitro'];

interface Base { id: string }
export interface MoveBlock extends Base { kind: 'forward' | 'up' | 'down' | 'jump' | 'turbo' | 'brake' }
export interface WaitBlock extends Base { kind: 'wait'; n: number }
export interface RepeatBlock extends Base { kind: 'repeat'; n: number | 'laps'; body: Block[] }
export interface IfBlock extends Base { kind: 'if'; cond: Sensor[]; then: Block[]; else: Block[] }
export interface NitroBlock extends Base { kind: 'nitro'; delta: number }
export type Block = MoveBlock | WaitBlock | RepeatBlock | IfBlock | NitroBlock;
export type Leaf = MoveBlock | WaitBlock;

/** The event script: `cuando cae un tronco`. The hat has its own id. */
export interface EventScript { id: string; body: Block[] }

export interface Program { main: Block[]; onLog?: EventScript }

export const EMPTY_PROGRAM: Program = { main: [] };

export const isLeaf = (b: Block): b is Leaf => b.kind !== 'repeat' && b.kind !== 'if' && b.kind !== 'nitro';

/** Largest `repetir` count the engine runs (a bigger number is the same as this). */
export const MAX_REPEAT = 99;
export const MAX_WAIT = 9;
/** Most conditions a `si` joins with `y`. */
export const MAX_COND = 2;

// ------------------------------------------------------------------ building

/** `<prefix>-<n>` ids in creation order, for reference programs and tests. The UI makes its own unique ids. */
export function programBuilder(prefix: string) {
  let n = 0;
  const id = () => `${prefix}-${++n}`;
  return {
    forward: (): MoveBlock => ({ id: id(), kind: 'forward' }),
    up: (): MoveBlock => ({ id: id(), kind: 'up' }),
    down: (): MoveBlock => ({ id: id(), kind: 'down' }),
    jump: (): MoveBlock => ({ id: id(), kind: 'jump' }),
    turbo: (): MoveBlock => ({ id: id(), kind: 'turbo' }),
    brake: (): MoveBlock => ({ id: id(), kind: 'brake' }),
    wait: (k = 1): WaitBlock => ({ id: id(), kind: 'wait', n: k }),
    repeat: (k: number | 'laps', body: Block[]): RepeatBlock => ({ id: id(), kind: 'repeat', n: k, body }),
    iff: (cond: Sensor | Sensor[], then: Block[], otherwise: Block[] = []): IfBlock => ({ id: id(), kind: 'if', cond: Array.isArray(cond) ? cond : [cond], then, else: otherwise }),
    nitro: (delta = -1): NitroBlock => ({ id: id(), kind: 'nitro', delta }),
    onLog: (body: Block[]): EventScript => ({ id: id(), body }),
  };
}
export type ProgramBuilder = ReturnType<typeof programBuilder>;

// ------------------------------------------------------------------ reading

/** The child blocks of a container, in reading order (`si`: the branch that runs when it holds, then `si no`). */
export const childrenOf = (b: Block): Block[] => (b.kind === 'repeat' ? b.body : b.kind === 'if' ? [...b.then, ...b.else] : []);

/** Every block of a list, containers first then their children (pre-order). */
export function walkBlocks(blocks: readonly Block[], visit: (b: Block, depth: number) => void, depth = 0): void {
  for (const b of blocks) {
    visit(b, depth);
    if (b.kind === 'repeat') walkBlocks(b.body, visit, depth + 1);
    else if (b.kind === 'if') { walkBlocks(b.then, visit, depth + 1); walkBlocks(b.else, visit, depth + 1); }
  }
}

/** Every block of the program (main script, then the event script's), pre-order. The event hat is not a `Block`: see `slotCount`. */
export function allBlocks(p: Program): Block[] {
  const out: Block[] = [];
  walkBlocks(p.main, (b) => out.push(b));
  if (p.onLog) walkBlocks(p.onLog.body, (b) => out.push(b));
  return out;
}

/** The memory a program uses: every block counts 1 (containers included), the event hat counts 1. */
export const slotCount = (p: Program): number => allBlocks(p).length + (p.onLog ? 1 : 0);

/** Finds a block by id (also the event hat: `{ kind: 'on_log' }`). */
export function findBlock(p: Program, id: string): Block | { kind: 'on_log'; id: string } | null {
  if (p.onLog?.id === id) return { kind: 'on_log', id };
  return allBlocks(p).find((b) => b.id === id) ?? null;
}

// ------------------------------------------------------------------ editing (pure: always returns a new program)

const mapList = (blocks: readonly Block[], fn: (b: Block) => Block | Block[] | null): Block[] => {
  const out: Block[] = [];
  for (const b of blocks) {
    const inner: Block = b.kind === 'repeat' ? { ...b, body: mapList(b.body, fn) }
      : b.kind === 'if' ? { ...b, then: mapList(b.then, fn), else: mapList(b.else, fn) } : b;
    const r = fn(inner);
    if (r == null) continue;
    if (Array.isArray(r)) out.push(...r); else out.push(r);
  }
  return out;
};

/** Rewrites every block (children first): return a block to keep/replace it, an array to splice, null to drop it. */
export function mapProgram(p: Program, fn: (b: Block) => Block | Block[] | null): Program {
  return { main: mapList(p.main, fn), ...(p.onLog ? { onLog: { ...p.onLog, body: mapList(p.onLog.body, fn) } } : {}) };
}

/** Replaces the block with this id (keeping the id unless `with` has another). */
export const replaceBlock = (p: Program, id: string, replacement: Block): Program => mapProgram(p, (b) => (b.id === id ? replacement : b));

// ------------------------------------------------------------------ checking against a track's rules

export interface Palette {
  blocks: readonly BlockKind[];
  sensors: readonly Sensor[];
  /** The `cuando cae un tronco` script is available. */
  event: boolean;
}

export type ProblemCode = 'too_many_blocks' | 'block_not_available' | 'sensor_not_available' | 'event_not_available' | 'duplicate_id' | 'bad_number' | 'empty_condition';
export interface Problem { code: ProblemCode; blockId?: string; detail?: string }

/** What is wrong with a program for a copa's palette and a track's memory (the UI keeps these from happening; the engine does not need them). */
export function checkProgram(p: Program, rules: { palette: Palette; slots: number }): Problem[] {
  const problems: Problem[] = [];
  const used = slotCount(p);
  if (used > rules.slots) problems.push({ code: 'too_many_blocks', detail: `${used}/${rules.slots}` });
  if (p.onLog && !rules.palette.event) problems.push({ code: 'event_not_available', blockId: p.onLog.id });
  const seen = new Set<string>(p.onLog ? [p.onLog.id] : []);
  for (const b of allBlocks(p)) {
    if (seen.has(b.id)) problems.push({ code: 'duplicate_id', blockId: b.id });
    seen.add(b.id);
    if (!rules.palette.blocks.includes(b.kind)) problems.push({ code: 'block_not_available', blockId: b.id, detail: b.kind });
    if (b.kind === 'if') {
      if (!b.cond.length) problems.push({ code: 'empty_condition', blockId: b.id });
      for (const s of b.cond) if (!rules.palette.sensors.includes(s)) problems.push({ code: 'sensor_not_available', blockId: b.id, detail: s });
    }
    if (b.kind === 'repeat' && b.n !== 'laps' && !(Number.isInteger(b.n) && b.n >= 1 && b.n <= MAX_REPEAT)) problems.push({ code: 'bad_number', blockId: b.id, detail: String(b.n) });
    if (b.kind === 'wait' && !(Number.isInteger(b.n) && b.n >= 1 && b.n <= MAX_WAIT)) problems.push({ code: 'bad_number', blockId: b.id, detail: String(b.n) });
  }
  return problems;
}
