// T39: 4to's long ladder, rungs 13–18 — understanding instead of copying
// (PRIMM: Predict, Run, Investigate, Modify, Make; Sentance et al., building
// on Use-Modify-Create, Lee et al. 2011), built on the Game Workshop's own
// blocks, VM and stage (src/workshop/, T40), so what the ladder measures is
// read in the same Scratch-like blocks the class goes on to build with.
//
// Engine choice (recorded in the feature document): the Workshop's VM, not
// game/rules.ts. rules.ts is a grid engine with `key:<dir>`/`touch:seed`
// hats and step/score actions only; if/else, variables and broadcast would
// each need a new rule-card UI there, while the Workshop already has all
// three, unit-tested, with Scratch's wording.
//
//  13 events_predict  a short event script is shown; tap where the character ends after a key is pressed twice; then it runs
//  14 fix_rule        "when the seed is touched, add a point" is wired wrong; fix it
//  15 if_else         build "si … si no": advance with the arrow, but jump when touching the rock
//  16 variables       one block is missing: each seed adds a point (each log takes a life)
//  17 broadcast       one sprite sends a message; make the other side react
//  18 modify_make     a working mini game, changed to a stated goal (no ghost demo)
//
// Each rung has two items (`b`: the second, a different board and story,
// the same concept and difficulty). Every check runs the child's project
// headless (vm.ts `simulate`) and reads what happened — positions,
// variables, contacts, messages, the end — so any correct solution passes;
// a failed check says what it saw in one line that does not give the
// answer away. A predict item's answer is computed from its own scripts.

import type { Cat, Op, VarName } from '../workshop/blocks';
import { INITIAL_VARS, LANE } from '../workshop/game';
import { allBlocks, make, stackOf, type Block, type Project, type Sprite, type SpriteKind } from '../workshop/model';
import { simulate, type Trace } from '../workshop/vm';
import { contacts } from '../workshop/challenges';

export type VmFormat = 'predict' | 'fix' | 'complete' | 'modify';

export interface VmCheck { ok: boolean; why?: string }

/** A place on the stage the child may tap as the predict answer (stage coordinates). */
export interface VmSpot { x: number; y: number }

export interface VmItem {
  id: string;
  rung: number;
  concept: string;
  format: VmFormat;
  /** The bar's small print (a child may read it). */
  title: string;
  /** What to do, large inside the screen (and said aloud). */
  goal: string;
  /** The starting project (fresh block ids on every call). */
  project(): Project;
  /** The sprite whose scripts the item is about (selected when it opens). */
  focus: string;
  /** Scratch's variable monitors on the stage. */
  monitors: readonly VarName[];
  /** Help 2: the palette glows here. */
  highlight: { cat: Cat; ops: readonly Op[] };
  /** Help 3: one line that points at the place, never the answer. */
  hint: string;
  /** Predict: the keys pressed (in order, PRESS_EVERY frames apart) and the places to choose from. */
  predict?: { sprite: string; keys: readonly string[]; spots: readonly VmSpot[] };
  /** Edit formats: the check of the child's project. */
  check?(p: Project): VmCheck;
  /** The canonical solution (tests; the demo bar's "resolver"). */
  solve(p: Project): Project;
}

export const PRESS_FROM = 12;
export const PRESS_EVERY = 24;

// ------------------------------------------------------------------ building projects

const ID = { stage: 'stage', player: 'player', floor: 'floor', rock: 'rock', log: 'log', seed: 'seed', star: 'star', bird: 'bird' } as const;

const sprite = (id: string, name: string, kind: SpriteKind, x: number, y: number, o: Partial<Sprite> = {}): Sprite => ({
  id, name, kind, x, y, dir: kind === 'obstacle' || kind === 'seed' || kind === 'floor' ? -90 : 90, visible: true,
  costume: ({ stage: 'pasillo', player: 'normal', floor: 'pasillo', obstacle: 'tronco', seed: 'semilla', bird: 'pájaro', star: 'estrella' } as const)[kind],
  stacks: [], ...o,
});
const scripts = (...lists: Block[][]) => lists.map((b, i) => stackOf(30, 30 + i * 170, b));
const project = (sprites: Sprite[], vars: Partial<Record<VarName, number>> = {}): Project => ({
  v: 1,
  vars: { ...INITIAL_VARS, ...vars },
  sprites: [sprite(ID.stage, 'Escenario', 'stage', 0, 0, { dir: 90 }), sprite(ID.floor, 'Suelo', 'floor', 0, -155), ...sprites],
});
const withScripts = (p: Project, id: string, stacks: Block[][]): Project => ({
  ...p, sprites: p.sprites.map((s) => (s.id === id ? { ...s, stacks: scripts(...stacks) } : s)),
});

const lt = (a: Block, b: number | string) => make('lt', { A: a, B: b });
const gt = (a: Block, b: number | string) => make('gt', { A: a, B: b });
const touching = (id: string) => make('touching', { OBJ: id });
const v = (name: VarName) => make('var', { VAR: name });

/** Something that runs from the right to the left forever and comes back; `onTouch`: what happens when it touches the character (then it goes back to the right). */
function runner(lane: number, o: { from?: number; touchOf?: string; onTouch?: Block[] } = {}): Block[] {
  const back = () => make('goto', { X: 240, Y: lane });
  const body: Block[] = [make('changeX', { DX: -6 }), make('if', { COND: lt(make('xpos'), -240) }, [[back()]])];
  if (o.onTouch) body.push(make('if', { COND: touching(o.touchOf ?? ID.player) }, [[...o.onTouch, back()]]));
  return [make('flag'), make('goto', { X: o.from ?? 400, Y: lane }), make('forever', {}, [body])];
}

// ------------------------------------------------------------------ reading a run

const at = (t: Trace, id: string, f = t.snaps.length - 1) => t.snaps[Math.min(f, t.snaps.length - 1)].sprites.find((s) => s.id === id);
/** How much a variable went up and down over the run. */
function moves(t: Trace, name: VarName) {
  let up = 0, down = 0;
  for (let i = 1; i < t.snaps.length; i++) {
    const d = t.snaps[i].vars[name] - t.snaps[i - 1].vars[name];
    if (d > 0) up += d; else down -= d;
  }
  return { up, down };
}
const pressing = (key: string, n: number, every = 8, from = 6): Record<number, string[]> => {
  const k: Record<number, string[]> = {};
  for (let i = 0; i < n; i++) k[from + i * every] = [key];
  return k;
};
/** Scripts (by sprite) starting with a hat of this op and value. */
const scriptsWith = (p: Project, hat: Op, v?: string) => p.sprites.flatMap((s) => s.stacks
  .filter((st) => st.blocks[0]?.op === hat && (v == null || Object.values(st.blocks[0].in)[0]?.v === v))
  .map((st) => ({ sprite: s.id, blocks: st.blocks })));
const contains = (blocks: readonly Block[], op: Op, input?: [string, string]) => {
  for (const b of allBlocks(blocks)) if (b.op === op && (!input || b.in[input[0]]?.v === input[1])) return true;
  return false;
};

// ------------------------------------------------------------------ 13 · predict an event script

/** The answer of a predict item: where its sprite ends after the keys (the run, headless). */
export function predictEnd(item: VmItem, p: Project = item.project()): VmSpot {
  const pr = item.predict!;
  const keys: Record<number, string[]> = {};
  pr.keys.forEach((k, i) => { keys[PRESS_FROM + i * PRESS_EVERY] = [k]; });
  const t = simulate(p, { frames: PRESS_FROM + pr.keys.length * PRESS_EVERY + 6, keys });
  const s = at(t, pr.sprite)!;
  return { x: s.x, y: s.y };
}
/** The spot nearest to a point (the answer the run lands on). */
export const nearestSpot = (spots: readonly VmSpot[], q: VmSpot) => spots.reduce((best, s, i) => (Math.hypot(s.x - q.x, s.y - q.y) < Math.hypot(spots[best].x - q.x, spots[best].y - q.y) ? i : best), 0);

const grid = (xs: number[]) => xs.flatMap((x) => [{ x, y: LANE.floor }, { x, y: LANE.ceiling }]);

const I13: VmItem = {
  id: 'pp-l13', rung: 13, concept: 'events_predict', format: 'predict',
  title: '¿Dónde queda?',
  goal: 'Leé los dos programas. Si tocás dos veces la flecha derecha, ¿dónde queda el Personaje? Tocá ese lugar.',
  project: () => project([
    sprite(ID.player, 'Personaje', 'player', -150, LANE.floor, {
      stacks: scripts(
        [make('key', { KEY: 'flecha derecha' }), make('changeX', { DX: 100 })],
        [make('key', { KEY: 'flecha arriba' }), make('setY', { Y: LANE.ceiling })],
      ),
    }),
  ]),
  focus: ID.player,
  monitors: [],
  highlight: { cat: 'events', ops: ['key'] },
  hint: 'Mirá qué tecla escucha cada programa. ¿Cuál se pone en marcha con la flecha derecha?',
  predict: { sprite: ID.player, keys: ['flecha derecha', 'flecha derecha'], spots: grid([-50, 50, 150]) },
  solve: (p) => p,
};

const I13B: VmItem = {
  id: 'pp-l13b', rung: 13, concept: 'events_predict', format: 'predict',
  title: '¿Dónde queda ahora?',
  goal: 'Leé los dos programas. Si tocás dos veces la tecla espacio, ¿dónde queda el Personaje? Tocá ese lugar.',
  project: () => project([
    sprite(ID.player, 'Personaje', 'player', 150, LANE.floor, {
      stacks: scripts(
        [make('key', { KEY: 'espacio' }), make('changeX', { DX: -100 })],
        [make('key', { KEY: 'espacio' }), make('setY', { Y: LANE.ceiling })],
      ),
    }),
  ]),
  focus: ID.player,
  monitors: [],
  highlight: { cat: 'events', ops: ['key'] },
  hint: 'Los dos programas escuchan la misma tecla. ¿Qué hace cada uno cuando la tocás?',
  predict: { sprite: ID.player, keys: ['espacio', 'espacio'], spots: grid([-150, -50, 50]) },
  solve: (p) => p,
};

// ------------------------------------------------------------------ 14 · fix a buggy rule

/** Points equal the times the character touched `what` (at least twice), and `other` never changed. */
function pointsPerTouch(p: Project, what: string, name: VarName, sign: 1 | -1, other?: VarName): VmCheck {
  const t = simulate(p, { frames: 480 });
  const n = contacts(t, what);
  const m = moves(t, name);
  const got = sign > 0 ? m.up : m.down;
  const wrongWay = sign > 0 ? m.down : m.up;
  if (n < 2) return { ok: false, why: 'El Personaje ya casi no se cruza con nada: algo dejó de moverse.' };
  if (got === 0 && wrongWay === 0) return { ok: false, why: `El Personaje toca y ${name === 'vidas' ? 'las vidas' : 'los puntos'} no cambian.` };
  if (wrongWay > 0) return { ok: false, why: sign > 0 ? `Los ${name} bajan en vez de subir.` : `Las ${name} suben en vez de bajar.` };
  if (got !== n) return { ok: false, why: `${name === 'vidas' ? 'Las vidas cambian' : 'Los puntos cambian'}, pero no una vez por cada toque.` };
  if (other) {
    const o = moves(t, other);
    if (o.up + o.down > 0) return { ok: false, why: `También cambian ${other === 'vidas' ? 'las vidas' : 'los puntos'}, y no tendrían que cambiar.` };
  }
  return { ok: true };
}

const I14: VmItem = {
  id: 'pp-l14', rung: 14, concept: 'fix_rule', format: 'fix',
  title: 'Un programa con un error',
  goal: 'Cuando el Personaje toca la semilla, tiene que sumar un punto. Pero hay un error. Probá el juego, encontrá el error y arreglalo.',
  project: () => project([
    sprite(ID.player, 'Personaje', 'player', -150, LANE.floor),
    sprite(ID.log, 'Tronco', 'obstacle', 240, LANE.ceiling, { stacks: scripts(runner(LANE.ceiling, { from: 240 })) }),
    sprite(ID.seed, 'Semilla', 'seed', 400, LANE.floor, {
      stacks: scripts(runner(LANE.floor, { touchOf: ID.log, onTouch: [make('changeVar', { VAR: 'puntos', V: 1 })] })),
    }),
  ]),
  focus: ID.seed,
  monitors: ['puntos'],
  highlight: { cat: 'sensing', ops: ['touching'] },
  hint: 'Leé el bloque «si»: ¿qué tiene que estar tocando la semilla para sumar?',
  check: (p) => pointsPerTouch(p, ID.seed, 'puntos', 1),
  solve: (p) => withScripts(p, ID.seed, [runner(LANE.floor, { onTouch: [make('changeVar', { VAR: 'puntos', V: 1 })] })]),
};

const I14B: VmItem = {
  id: 'pp-l14b', rung: 14, concept: 'fix_rule', format: 'fix',
  title: 'Otro programa con un error',
  goal: 'Cuando el Personaje toca la estrella, tiene que sumar un punto. Pero hay un error. Probá el juego, encontrá el error y arreglalo.',
  project: () => project([
    sprite(ID.player, 'Personaje', 'player', -150, LANE.ceiling),
    sprite(ID.log, 'Tronco', 'obstacle', 240, LANE.floor, { stacks: scripts(runner(LANE.floor, { from: 240 })) }),
    sprite(ID.star, 'Estrella', 'star', 400, LANE.ceiling, {
      stacks: scripts(runner(LANE.ceiling, { onTouch: [make('changeVar', { VAR: 'vidas', V: 1 })] })),
    }),
  ]),
  focus: ID.star,
  monitors: ['puntos', 'vidas'],
  highlight: { cat: 'variables', ops: ['changeVar'] },
  hint: 'Leé el bloque de adentro del «si»: ¿qué cambia cuando la estrella toca al Personaje?',
  check: (p) => pointsPerTouch(p, ID.star, 'puntos', 1, 'vidas'),
  solve: (p) => withScripts(p, ID.star, [runner(LANE.ceiling, { onTouch: [make('changeVar', { VAR: 'puntos', V: 1 })] })]),
};

// ------------------------------------------------------------------ 15 · if/else

interface JumpCase { key: string; step: number; start: number; lane: number; other: number; block: string; blockId: string; kind: 'obstacle'; costume: string; at: number }

/** Advances with the key on its lane until it touches the obstacle, then changes lane, then goes on past it. */
function checkJump(p: Project, c: JumpCase): VmCheck {
  const presses = 22;
  const t = simulate(p, { frames: 6 + presses * 8 + 10, keys: pressing(c.key, presses) });
  const dir = Math.sign(c.step);
  const pl = (f?: number) => at(t, ID.player, f);
  const early = pl(6 + 3 * 8 + 4);
  const end = pl();
  if (!early || !end) return { ok: false, why: 'El Personaje no está.' };
  const advanced = (s: { x: number }) => (s.x - c.start) * dir;
  if (advanced(early) < Math.abs(c.step) * 2) return { ok: false, why: 'Con la tecla, el Personaje todavía no avanza.' };
  if (Math.abs(early.y - c.lane) > 20) return { ok: false, why: 'Cambia de lugar antes de llegar: tiene que esperar a tocar.' };
  // where it was when it left its lane
  let leftAt: number | null = null;
  for (const s of t.snaps) {
    const q = s.sprites.find((x) => x.id === ID.player);
    if (q && Math.abs(q.y - c.lane) > 20) { leftAt = q.x; break; }
  }
  const pastObstacle = (end.x - c.at) * dir > 50;
  if (leftAt == null) return { ok: false, why: pastObstacle ? 'Pasa por adentro del obstáculo: tiene que saltar cuando lo toca.' : 'Se queda trabado en el obstáculo.' };
  if (Math.abs(leftAt - c.at) > 50) return { ok: false, why: 'Salta, pero no cuando toca el obstáculo.' };
  if (Math.abs(end.y - c.other) > 20) return { ok: false, why: 'Salta, pero después no se queda del otro lado.' };
  if (!pastObstacle) return { ok: false, why: 'Salta, pero después ya no avanza.' };
  return { ok: true };
}

function jumpProject(c: JumpCase, solved: boolean): Project {
  const cond = touching(c.blockId);
  const step = make('changeX', { DX: c.step });
  const jump = make('setY', { Y: c.other });
  const hat = make('key', { KEY: c.key });
  const player = sprite(ID.player, 'Personaje', 'player', c.start, c.lane, {
    stacks: solved
      ? scripts([hat, make('ifElse', { COND: cond }, [[jump], [step]])])
      : [stackOf(30, 30, [hat]), stackOf(40, 120, [make('ifElse', { COND: cond }, [[], []])]), stackOf(40, 300, [step]), stackOf(230, 300, [jump])],
  });
  return project([player, sprite(c.blockId, c.block, c.kind, c.at, c.lane, { costume: c.costume })]);
}

const J15: JumpCase = { key: 'flecha derecha', step: 25, start: -200, lane: LANE.floor, other: LANE.ceiling, block: 'Piedra', blockId: ID.rock, kind: 'obstacle', costume: 'piedra', at: 0 };
const J15B: JumpCase = { key: 'flecha izquierda', step: -25, start: 200, lane: LANE.ceiling, other: LANE.floor, block: 'Tronco', blockId: ID.log, kind: 'obstacle', costume: 'tronco', at: -20 };

const I15: VmItem = {
  id: 'pp-l15', rung: 15, concept: 'if_else', format: 'complete',
  title: 'Si toca la piedra…',
  goal: 'Con la flecha derecha el Personaje avanza. Pero si toca la piedra, salta al techo. Armá el programa con «si … si no».',
  project: () => jumpProject(J15, false),
  focus: ID.player,
  monitors: [],
  highlight: { cat: 'control', ops: ['ifElse'] },
  hint: 'Lo de arriba del «si no» pasa cuando toca la piedra. Lo de abajo, cuando no la toca.',
  check: (p) => checkJump(p, J15),
  solve: () => jumpProject(J15, true),
};

const I15B: VmItem = {
  id: 'pp-l15b', rung: 15, concept: 'if_else', format: 'complete',
  title: 'Si toca el tronco…',
  goal: 'Con la flecha izquierda el Personaje avanza por el techo. Pero si toca el tronco, baja al piso. Armá el programa con «si … si no».',
  project: () => jumpProject(J15B, false),
  focus: ID.player,
  monitors: [],
  highlight: { cat: 'control', ops: ['ifElse'] },
  hint: 'Lo de arriba del «si no» pasa cuando toca el tronco. Lo de abajo, cuando no lo toca.',
  check: (p) => checkJump(p, J15B),
  solve: () => jumpProject(J15B, true),
};

// ------------------------------------------------------------------ 16 · variables

const I16: VmItem = {
  id: 'pp-l16', rung: 16, concept: 'variables', format: 'complete',
  title: 'Falta un bloque',
  goal: 'Cada vez que el Personaje toca una semilla, tiene que sumar 1 punto. Falta un bloque: buscalo y ponelo donde va.',
  project: () => project([
    sprite(ID.player, 'Personaje', 'player', -150, LANE.floor),
    sprite(ID.seed, 'Semilla', 'seed', 400, LANE.floor, { stacks: scripts(runner(LANE.floor, { onTouch: [] })) }),
  ]),
  focus: ID.seed,
  monitors: ['puntos'],
  highlight: { cat: 'variables', ops: ['changeVar'] },
  hint: 'Mirá el bloque «si … tocando Personaje»: adentro tiene que cambiar algo.',
  check: (p) => pointsPerTouch(p, ID.seed, 'puntos', 1),
  solve: (p) => withScripts(p, ID.seed, [runner(LANE.floor, { onTouch: [make('changeVar', { VAR: 'puntos', V: 1 })] })]),
};

const I16B: VmItem = {
  id: 'pp-l16b', rung: 16, concept: 'variables', format: 'complete',
  title: 'Falta otro bloque',
  goal: 'Cada vez que un tronco choca al Personaje, tiene que perder 1 vida. Falta un bloque: buscalo y ponelo donde va.',
  project: () => project([
    sprite(ID.player, 'Personaje', 'player', -150, LANE.floor),
    sprite(ID.log, 'Tronco', 'obstacle', 400, LANE.floor, { stacks: scripts(runner(LANE.floor, { onTouch: [] })) }),
  ], { vidas: 9 }),
  focus: ID.log,
  monitors: ['vidas'],
  highlight: { cat: 'variables', ops: ['changeVar'] },
  hint: 'Mirá el bloque «si … tocando Personaje»: adentro tiene que cambiar algo.',
  check: (p) => pointsPerTouch(p, ID.log, 'vidas', -1),
  solve: (p) => withScripts(p, ID.log, [runner(LANE.floor, { onTouch: [make('changeVar', { VAR: 'vidas', V: -1 })] })]),
};

// ------------------------------------------------------------------ 17 · broadcast

/** The variable moves once per touch AND through a `al recibir [msg]` script (not straight in the sender). */
function checkMessage(p: Project, what: string, msg: string, name: VarName, sign: 1 | -1): VmCheck {
  const sends = scriptsWith(p, 'flag').some((s) => s.sprite === what && contains(s.blocks, 'broadcast', ['MSG', msg]));
  if (!sends) return { ok: false, why: `${what === ID.seed ? 'La semilla' : 'El tronco'} ya no envía «${msg}».` };
  const receivers = scriptsWith(p, 'receive', msg);
  const behaviour = pointsPerTouch(p, what, name, sign);
  if (!receivers.length) return { ok: false, why: behaviour.ok ? `${name === 'vidas' ? 'Las vidas cambian' : 'Los puntos suben'}, pero no al recibir «${msg}».` : `Nadie recibe el mensaje «${msg}».` };
  if (!receivers.some((r) => contains(r.blocks, 'changeVar', ['VAR', name]))) return { ok: false, why: `Alguien recibe «${msg}», pero ${name === 'vidas' ? 'las vidas no cambian' : 'los puntos no cambian'}.` };
  return behaviour;
}

const I17: VmItem = {
  id: 'pp-l17', rung: 17, concept: 'broadcast', format: 'complete',
  title: 'Un mensaje',
  goal: 'Cuando el Personaje la toca, la semilla envía el mensaje «punto». Hacé que el Escenario, al recibir «punto», sume 1 punto.',
  project: () => project([
    sprite(ID.player, 'Personaje', 'player', -150, LANE.floor),
    sprite(ID.seed, 'Semilla', 'seed', 400, LANE.floor, { stacks: scripts(runner(LANE.floor, { onTouch: [make('broadcast', { MSG: 'punto' })] })) }),
  ]),
  focus: ID.stage,
  monitors: ['puntos'],
  highlight: { cat: 'events', ops: ['receive'] },
  hint: 'Buscá en Eventos el bloque que empieza un programa cuando llega un mensaje.',
  check: (p) => checkMessage(p, ID.seed, 'punto', 'puntos', 1),
  solve: (p) => withScripts(p, ID.stage, [[make('receive', { MSG: 'punto' }), make('changeVar', { VAR: 'puntos', V: 1 })]]),
};

const I17B: VmItem = {
  id: 'pp-l17b', rung: 17, concept: 'broadcast', format: 'complete',
  title: 'Otro mensaje',
  goal: 'Cuando choca al Personaje, el tronco envía el mensaje «choque». Hacé que el Personaje, al recibir «choque», pierda 1 vida.',
  project: () => project([
    sprite(ID.player, 'Personaje', 'player', -150, LANE.ceiling),
    sprite(ID.log, 'Tronco', 'obstacle', 400, LANE.ceiling, { stacks: scripts(runner(LANE.ceiling, { onTouch: [make('broadcast', { MSG: 'choque' })] })) }),
  ], { vidas: 9 }),
  focus: ID.player,
  monitors: ['vidas'],
  highlight: { cat: 'events', ops: ['receive'] },
  hint: 'Buscá en Eventos el bloque que empieza un programa cuando llega un mensaje.',
  check: (p) => checkMessage(p, ID.log, 'choque', 'vidas', -1),
  solve: (p) => withScripts(p, ID.player, [[make('receive', { MSG: 'choque' }), make('changeVar', { VAR: 'vidas', V: -1 })]]),
};

// ------------------------------------------------------------------ 18 · modify then make

/** Ends `end` only once its condition is met (`setup` pokes the run near it), never before. */
function checkEnds(p: Project, o: { end: 'won' | 'lost'; frames: number; nearPoke?: Partial<Record<VarName, number>>; trigger: string; early: string; never: string }): VmCheck {
  const calm = simulate(p, { frames: 60 });
  if (calm.end !== 'running') return { ok: false, why: o.early };
  const near = simulate(p, { frames: o.frames, ...(o.nearPoke ? { pokes: { 2: o.nearPoke } } : {}) });
  if (near.end !== o.end) return { ok: false, why: near.end === 'running' ? o.never : o.early };
  const touched = near.snaps.some((s) => s.touch.includes(o.trigger));
  if (!touched) return { ok: false, why: o.early };
  return { ok: true };
}

const gameWithPoints = () => project([
  sprite(ID.player, 'Personaje', 'player', -150, LANE.floor),
  sprite(ID.seed, 'Semilla', 'seed', 400, LANE.floor, { stacks: scripts(runner(LANE.floor, { onTouch: [make('changeVar', { VAR: 'puntos', V: 1 })] })) }),
]);
const winAtFive = () => [make('flag'), make('forever', {}, [[make('if', { COND: gt(v('puntos'), 4) }, [[make('win')]])]])];

const I18: VmItem = {
  id: 'pp-l18', rung: 18, concept: 'modify_make', format: 'modify',
  title: 'Cambiá el juego',
  goal: 'Este juego anda, pero no termina nunca. Cambialo: que se gane al llegar a 5 puntos.',
  project: gameWithPoints,
  focus: ID.stage,
  monitors: ['puntos'],
  highlight: { cat: 'game', ops: ['win'] },
  hint: 'Hace falta un programa que mire los puntos todo el tiempo.',
  check: (p) => checkEnds(p, {
    end: 'won', frames: 480, nearPoke: { puntos: 4 }, trigger: ID.seed,
    early: 'Se gana antes de llegar a 5 puntos.', never: 'Llega a 5 puntos y el juego sigue.',
  }),
  solve: (p) => withScripts(p, ID.stage, [winAtFive()]),
};

const birdRun = (): Block[] => [
  make('flag'), make('goto', { X: 300, Y: LANE.floor }),
  make('forever', {}, [[make('changeX', { DX: -5 }), make('if', { COND: lt(make('xpos'), -240) }, [[make('goto', { X: 240, Y: LANE.floor })]])]]),
];
const loseOnBird = (): Block[] => [make('flag'), make('forever', {}, [[make('if', { COND: touching(ID.bird) }, [[make('lose')]])]])];

const I18B: VmItem = {
  id: 'pp-l18b', rung: 18, concept: 'modify_make', format: 'modify',
  title: 'Cambiá este juego',
  goal: 'En este juego el pájaro pasa volando y no pasa nada. Cambialo: que se pierda cuando el pájaro toca al Personaje.',
  project: () => project([
    sprite(ID.player, 'Personaje', 'player', -150, LANE.floor),
    sprite(ID.bird, 'Pájaro', 'bird', 300, LANE.floor, { stacks: scripts(birdRun()) }),
  ]),
  focus: ID.player,
  monitors: [],
  highlight: { cat: 'game', ops: ['lose'] },
  hint: 'Hace falta un programa que mire todo el tiempo si el pájaro lo está tocando.',
  check: (p) => checkEnds(p, {
    end: 'lost', frames: 240, trigger: ID.bird,
    early: 'Se pierde sin que el pájaro lo toque.', never: 'El pájaro lo toca y el juego sigue.',
  }),
  solve: (p) => withScripts(p, ID.player, [loseOnBird()]),
};

/** Rungs 13–18, in order (their first items). */
export const VM_ITEMS: readonly VmItem[] = [I13, I14, I15, I16, I17, I18];
/** Each rung's second item, by rung. */
export const VM_VARIANT_ITEMS: Readonly<Record<number, VmItem>> = { 13: I13B, 14: I14B, 15: I15B, 16: I16B, 17: I17B, 18: I18B };
export const vmItem = (id: string): VmItem | null => VM_ITEMS.find((i) => i.id === id) ?? Object.values(VM_VARIANT_ITEMS).find((i) => i.id === id) ?? null;

/** An edit item's check, or a predict item's: the chosen spot is where the run lands. */
export function checkVm(item: VmItem, p: Project, guess?: number): VmCheck {
  if (item.format === 'predict') {
    const pr = item.predict!;
    if (guess == null) return { ok: false, why: 'Primero tocá dónde va a quedar.' };
    const right = nearestSpot(pr.spots, predictEnd(item, p));
    return guess === right ? { ok: true } : { ok: false, why: 'Quedó en otro lugar. Mirá otra vez los programas.' };
  }
  return item.check!(p);
}

/** The text of a project's scripts (the `run` event's `program`), one line per script: `sprite: block; block…`. */
export function scriptsText(p: Project): string {
  const line = (b: Block): string => {
    const ins = Object.entries(b.in).map(([, s]) => (s.r ? `(${line(s.r)})` : s.v)).filter((x) => x !== '');
    const subs = b.subs ? b.subs.map((m) => `[${m.map(line).join('; ')}]`).join('') : '';
    return `${b.op}${ins.length ? ` ${ins.join(' ')}` : ''}${subs}`;
  };
  return p.sprites.flatMap((s) => s.stacks.filter((st) => st.blocks.length).map((st) => `${s.id}: ${st.blocks.map(line).join('; ')}`)).join(' | ');
}
