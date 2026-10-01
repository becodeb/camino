// "Hacé tu juego" (the 4to probe) as data and rules, apart from its screen
// (GameMaker.tsx). Round 2 (T15): the game is built step by step, playing
// after each step, so the child knows what each rule does because they put
// it there:
//
//   1 `move`        an empty stage, the character standing still: "make it
//                   move with the arrows" (cuando aprieto ← / → + mover).
//   2 `stone`       a stone appears: "make it fall" (siempre + mover abajo,
//                   cuando toco el suelo + volver arriba).
//   3 `seed_read`   a seed that already falls on its own: "tap it to see how
//                   it is programmed" (an example to read, the same rules).
//   4 `touch_rules` "if the stone touches you, you lose a life; if you catch
//                   the seed, a point" (cuando toco a + perder / sumar).
//   5 `win`         "when do you win?": one rule on the game's card.
//   6 `free`        every block: change whatever you like.
//
// Each step names its object (whose cards are on screen), the few blocks of
// its palette, the canonical rules it asks for (what the help's ghost hand
// builds and what a skipped step leaves built) and what the engine must show
// for the step to count as done. Pure: no DOM, no timers.

import {
  addAction, addObject, addRule, cloneGame, endings, objectOf, paletteFor,
  type EditResult, type GmEvent, type GmGame, type GmRule, type GmState, type ObjId,
} from '../game/gameMaker';

export type GmStep = 'move' | 'stone' | 'seed_read' | 'touch_rules' | 'win' | 'free';
export const STEPS: readonly GmStep[] = ['move', 'stone', 'seed_read', 'touch_rules', 'win', 'free'];

/** The seed's rules, ready made (step 3 shows them): the same two rules the child gave the stone. */
export const SEED_RULES: GmRule[] = [
  { hat: 'tick', actions: ['move:down'] },
  { hat: 'touch:ground', actions: ['top'] },
];
/** The game's card when it first shows (step 5): losing is already there, winning is the child's. */
export const GAME_RULES: GmRule[] = [{ hat: 'lives0', actions: ['lose'] }];

export interface StepDef {
  id: GmStep;
  /** Whose cards the step is about (selected when it opens). */
  obj: ObjId;
  /** The palette: the step's few blocks (null: none, the step only reads; `all`: every block of the object). */
  palette: { hats: string[]; actions: string[] } | null | 'all';
  /** The rules the step asks for, on `obj`: the ghost's third help builds them, a skip leaves them built. */
  target: GmRule[];
}

export const STEP_DEFS: Record<GmStep, StepDef> = {
  move: {
    id: 'move', obj: 'me',
    palette: { hats: ['key:right', 'key:left'], actions: ['move:right', 'move:left'] },
    target: [{ hat: 'key:right', actions: ['move:right'] }, { hat: 'key:left', actions: ['move:left'] }],
  },
  stone: {
    id: 'stone', obj: 'stone',
    palette: { hats: ['tick', 'touch:ground'], actions: ['move:down', 'top'] },
    target: [{ hat: 'tick', actions: ['move:down'] }, { hat: 'touch:ground', actions: ['top'] }],
  },
  seed_read: { id: 'seed_read', obj: 'seed', palette: null, target: [] },
  touch_rules: {
    id: 'touch_rules', obj: 'me',
    palette: { hats: ['touch:stone', 'touch:seed'], actions: ['lives:-1', 'score:1'] },
    target: [{ hat: 'touch:stone', actions: ['lives:-1'] }, { hat: 'touch:seed', actions: ['score:1'] }],
  },
  win: {
    id: 'win', obj: 'game',
    palette: { hats: ['points:5'], actions: ['win'] },
    target: [{ hat: 'points:5', actions: ['win'] }],
  },
  free: { id: 'free', obj: 'me', palette: 'all', target: [] },
};

/** The palette of `obj` during `step`: the step's blocks on its own object, none on the others (they can be looked at); all in the free step. */
export function stepPalette(step: GmStep, obj: ObjId): { hats: string[]; actions: string[] } {
  const d = STEP_DEFS[step];
  if (d.palette === 'all') return paletteFor(obj);
  if (!d.palette || obj !== d.obj) return { hats: [], actions: [] };
  return d.palette;
}

/** Can the child edit `obj`'s cards during `step`? */
export const editableIn = (step: GmStep, obj: ObjId) => STEP_DEFS[step].palette === 'all' || (STEP_DEFS[step].palette != null && obj === STEP_DEFS[step].obj);

// ------------------------------------------------------------------ the game as each step opens

/** The game the probe starts with: the child's character alone, no rules. */
export const START_GAME: GmGame = [{ id: 'me', rules: [] }];

/** The objects a step brings onto the board (the stone, the ready seed, the game's card). */
export function enterStep(g: GmGame, step: GmStep): GmGame {
  let next = cloneGame(g);
  const sprite = (id: 'stone' | 'seed', rules: GmRule[] = []) => {
    if (objectOf(next, id)) return;
    const r = addObject(next, id);
    if ('game' in r) next = r.game;
    const o = objectOf(next, id);
    if (o) o.rules = rules.map((x) => ({ hat: x.hat, actions: [...x.actions] }));
  };
  const at = STEPS.indexOf(step);
  if (at >= STEPS.indexOf('stone')) sprite('stone');
  if (at >= STEPS.indexOf('seed_read')) sprite('seed', SEED_RULES);
  if (at >= STEPS.indexOf('win') && !objectOf(next, 'game')) next.push({ id: 'game', rules: GAME_RULES.map((x) => ({ hat: x.hat, actions: [...x.actions] })) });
  // the board's order: the character, the seed, the stone (the bird when added), the game
  const order: ObjId[] = ['me', 'seed', 'stone', 'bird', 'game'];
  return next.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

// ------------------------------------------------------------------ what is missing (the help and the skip)

export type MissingEdit = { kind: 'hat'; obj: ObjId; hat: string } | { kind: 'action'; obj: ObjId; hat: string; action: string };

/** The edits that would complete the step's canonical rules, in order (a card, then its actions). */
export function missingEdits(g: GmGame, step: GmStep): MissingEdit[] {
  const d = STEP_DEFS[step];
  const o = objectOf(g, d.obj);
  const out: MissingEdit[] = [];
  for (const t of d.target) {
    const card = o?.rules.find((r) => r.hat === t.hat);
    if (!card) out.push({ kind: 'hat', obj: d.obj, hat: t.hat });
    for (const a of t.actions) if (!card?.actions.includes(a)) out.push({ kind: 'action', obj: d.obj, hat: t.hat, action: a });
  }
  return out;
}

/** One missing edit applied (the action goes into the card with its hat). */
export function applyMissing(g: GmGame, e: MissingEdit): EditResult {
  if (e.kind === 'hat') return addRule(g, e.obj, e.hat);
  const i = objectOf(g, e.obj)?.rules.findIndex((r) => r.hat === e.hat) ?? -1;
  if (i < 0) return { refused: 'no-card' };
  return addAction(g, e.obj, i, e.action);
}

/** The game with every step before `step` done the canonical way (the debug jump; the skip fills one step the same way). */
export function prepared(step: GmStep, g: GmGame = START_GAME): GmGame {
  let next = cloneGame(g);
  for (const s of STEPS) {
    next = enterStep(next, s);
    if (s === step) break;
    for (const e of missingEdits(next, s)) {
      const r = applyMissing(next, e);
      if ('game' in r) next = r.game;
    }
  }
  return next;
}

// ------------------------------------------------------------------ when a step is done (seen on the board)

export interface StepFlags {
  movedLeft: boolean;
  movedRight: boolean;
  stoneFell: boolean;
  /** The stone reached the ground and stayed there (no "volver arriba" yet). */
  stoneStuck: boolean;
  stoneBack: boolean;
  read: boolean;
  lostLife: boolean;
  scored: boolean;
  /** A game ended (won or lost) with a way to win in its rules. */
  ended: 'win' | 'lose' | null;
}
export const noFlags = (): StepFlags => ({ movedLeft: false, movedRight: false, stoneFell: false, stoneStuck: false, stoneBack: false, read: false, lostLife: false, scored: false, ended: null });

/** What one tick of the game showed, for the step on screen. `prev` is the state before the tick. */
export function observe(step: GmStep, f: StepFlags, prev: GmState, events: readonly GmEvent[], g: GmGame): StepFlags {
  const n = { ...f };
  for (const e of events) {
    if (e.t === 'move' && e.obj === 'me') {
      const was = prev.sprites.me;
      if (was && e.c < was.c) n.movedLeft = true;
      if (was && e.c > was.c) n.movedRight = true;
    }
    if (e.t === 'move' && e.obj === 'stone' && e.r > (prev.sprites.stone?.r ?? 0)) n.stoneFell = true;
    if (e.t === 'bump' && e.obj === 'stone' && e.edge === 'ground' && n.stoneFell) n.stoneStuck = true;
    if (e.t === 'top' && e.obj === 'stone' && n.stoneFell) n.stoneBack = true;
    if (e.t === 'lives' && e.delta < 0) n.lostLife = true;
    if (e.t === 'score' && e.delta > 0) n.scored = true;
    if (e.t === 'end' && step === 'win' && endings(g).win_points != null) n.ended = e.result;
  }
  return n;
}

export function stepDone(step: GmStep, f: StepFlags): boolean {
  switch (step) {
    case 'move': return f.movedLeft && f.movedRight;
    case 'stone': return f.stoneFell && f.stoneBack;
    case 'seed_read': return f.read;
    case 'touch_rules': return f.lostLife && f.scored;
    case 'win': return f.ended != null;
    case 'free': return false;
  }
}

// ------------------------------------------------------------------ times

export interface StepTimes {
  /** "Seguir" shows after this long trying a step that is not done (nobody gets stuck). */
  skipMs: number;
  /** A done step turns by itself after this long. */
  autoTurnMs: number;
  /** The free step: the arrow to finish shows after this long; the probe ends at `freeMaxMs`. */
  freeNextMs: number;
  freeMaxMs: number;
}
export const TIMES: StepTimes = { skipMs: 90_000, autoTurnMs: 10_000, freeNextMs: 45_000, freeMaxMs: 300_000 };
/** `?caps=fast` (the scripted checks, as the ladder's): the same rules in seconds. */
export const FAST_TIMES: StepTimes = { skipMs: 8_000, autoTurnMs: 10_000, freeNextMs: 4_000, freeMaxMs: 40_000 };
export const timesFrom = (search: string): StepTimes => (/[?&]caps=fast\b/.test(search) ? FAST_TIMES : TIMES);

// ------------------------------------------------------------------ what is said and written (es-AR; `me` is the character's name)

/** The step's goal, said when it opens, said again by 🔊 and ✋. */
export function stepLine(step: GmStep, me: string): string {
  switch (step) {
    case 'move': return `Hacé que ${me} se mueva con las flechas. Arrastrá los bloques al cuaderno.`;
    case 'stone': return 'Ahora hacé que caiga la piedra.';
    case 'seed_read': return 'Mirá: la semilla ya cae sola. Tocá la semilla para ver cómo está programada.';
    case 'touch_rules': return 'Si la piedra te toca, perdés una vida. Si agarrás la semilla, sumás un punto.';
    case 'win': return '¿Cuándo se gana? Poné en el juego: si los puntos llegan a 5, ganás. Después jugá.';
    case 'free': return 'Ahora cambiá lo que quieras: que la piedra caiga más rápido, que la semilla valga más, o sumá un pájaro.';
  }
}

/** The goal as the note on the notebook writes it (short). */
export function stepGoal(step: GmStep, me: string): string[] {
  switch (step) {
    case 'move': return [`Que ${me} se mueva`, 'con las flechas'];
    case 'stone': return ['Que caiga la piedra'];
    case 'seed_read': return ['Mirá cómo está', 'hecha la semilla'];
    case 'touch_rules': return ['Piedra: −1 vida', 'Semilla: +1 punto'];
    case 'win': return ['¿Cuándo se gana?'];
    case 'free': return ['¡Tu juego!', 'Cambiá lo que quieras'];
  }
}

export const GM_SAY = {
  orphan: 'Esto va debajo de un cuando.',
  noRule: (me: string) => `${me} no sabe qué hacer con esa flecha. Ponele una regla.`,
  oneWay: '¡Bien! Ahora hacé que vaya también para el otro lado.',
  stuck: '¡Cae! Pero se queda abajo. Hacé que vuelva arriba cuando toca el suelo.',
  readDone: 'Tiene las mismas reglas que tu piedra: siempre baja, y cuando toca el suelo vuelve arriba.',
  tryIt: 'Probalo: tocá Probar.',
  tryKeys: 'Listo. Ahora probalo: apretá las flechas.',
  skip: 'Te lo dejo armado. Sigamos.',
  won: '¡Ganaste!',
  lost: '¡Se acabaron las vidas! ¿Otra vez?',
  liked: '¿Te gustó hacer tu juego? Tocá una carita: mucho, más o menos, o no.',
  cheer: '¡Qué buen juego hiciste!',
  lastGame: 'Ya casi terminamos. Cuando quieras, tocá la flecha.',
};

/** Said when the step is done. */
export function doneLine(step: GmStep, me: string, f?: StepFlags): string {
  switch (step) {
    case 'move': return `¡${me} se mueve! Muy bien.`;
    case 'stone': return '¡La piedra cae y vuelve a caer!';
    case 'seed_read': return GM_SAY.readDone;
    case 'touch_rules': return '¡Ya es un juego: puntos y vidas!';
    case 'win': return f?.ended === 'lose' ? 'Perdiste esta vez, pero tu juego ya tiene un final.' : '¡Tu juego ya tiene un final!';
    case 'free': return GM_SAY.cheer;
  }
}

/** The step as the adult's small print in the bar says it. */
export const STEP_NAME: Record<GmStep, string> = {
  move: '1 · moverse', stone: '2 · la piedra', seed_read: '3 · mirar la semilla', touch_rules: '4 · vidas y puntos', win: '5 · cuándo se gana', free: '6 · libre',
};
