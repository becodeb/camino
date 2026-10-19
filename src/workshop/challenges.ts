// The Workshop's challenges (T40): "Al revés" built step by step, PRIMM
// (Predict, Run, Investigate, Modify, Make; Sentance et al., building on
// Use-Modify-Create, Lee et al. 2011). Each one has its goal (shown large
// inside the screen), a looping preview of the expected behaviour (the
// game itself running the canonical solution, game.ts), graded help (a
// hint line, the relevant blocks highlighted in the palette, a similar
// worked example — never the answer) and a check.
//
// A check never compares the child's script with one exact answer: it runs
// the child's project headless (vm.ts `simulate`) with a scripted player
// (no keys; space once to go to the ceiling; space now and then) and reads
// what happened — positions, variables, contacts, the game's end — so any
// correct solution passes. A failed check says what it saw, in one line
// that does not give the solution away.

import type { Cat, Op } from './blocks';
import { LANE, obstaclesOf, SPRITE_IDS } from './game';
import { make, type Block, type Project } from './model';
import { simulate, type Snapshot, type Trace } from './vm';

export interface Check { ok: boolean; why?: string }

export interface Example { caption: string; sprite: string; blocks: () => Block[] }

export interface Challenge {
  n: number;
  title: string;
  /** What to do (large, in the goal card and the goal note). */
  goal: string;
  primm: 'predict' | 'investigate' | 'modify' | 'make';
  concept: string;
  /** The sprite whose scripts the challenge is about (selected when it opens). */
  focus: string;
  hint: string;
  highlight: { cat: Cat; ops: readonly Op[] };
  example: Example;
  free?: boolean;
  check(p: Project, o?: { baseline?: string }): Check;
}

// ------------------------------------------------------------------ reading a trace

type Snap = Snapshot['sprites'][number];
const sp = (s: Snapshot, id: string): Snap | undefined => s.sprites.find((x) => x.id === id);
/** How many times `other` began touching the player (the VM notes touches during the frame, so a log sent back on the same frame still counts). */
export function contacts(t: Trace, other: string): number {
  let n = 0;
  let was = false;
  for (const s of t.snaps) {
    const now = s.touch.includes(other);
    if (now && !was) n++;
    was = now;
  }
  return n;
}
/** The frames where a sprite moved left (a step), right, and jumped back to the right (a wrap). */
export function motionOf(t: Trace, id: string, from = 2) {
  let left = 0, right = 0, wraps = 0, frames = 0, still = 0;
  for (let i = Math.max(1, from); i < t.snaps.length; i++) {
    const a = sp(t.snaps[i - 1], id), b = sp(t.snaps[i], id);
    if (!a || !b) continue;
    frames++;
    const dx = b.x - a.x;
    if (dx > 150) wraps++;
    else if (dx < -0.4) left++;
    else if (dx > 0.4) right++;
    else still++;
  }
  return { left, right, wraps, frames, still };
}
const visibleShare = (t: Trace, id: string) => t.snaps.filter((s) => sp(s, id)?.visible).length / Math.max(1, t.snaps.length);
const meanY = (t: Trace, id: string) => {
  const ys = t.snaps.slice(3).map((s) => sp(s, id)).filter((s): s is Snap => !!s && s.visible).map((s) => s.y);
  return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
};
const range = (t: Trace, id: string, k: 'x' | 'y') => {
  const v = t.snaps.slice(3).map((s) => sp(s, id)).filter((s): s is Snap => !!s && s.visible).map((s) => s[k]);
  return v.length ? Math.max(...v) - Math.min(...v) : 0;
};
/** How much a variable went down (every drop added) and up. */
export function varMoves(t: Trace, name: keyof Snapshot['vars'], from = 3) {
  let down = 0, up = 0;
  for (let i = Math.max(1, from); i < t.snaps.length; i++) {
    const d = t.snaps[i].vars[name] - t.snaps[i - 1].vars[name];
    if (d < 0) down -= d; else up += d;
  }
  return { down, up };
}

/** The scripted players: nobody touches a key; space once (to the ceiling); space now and then. */
const KEEP_LIVES = { 2: { vidas: 99 } } as const;
const keysEvery = (every: number, from: number, frames: number) => {
  const k: Record<number, string[]> = {};
  for (let f = from; f < frames; f += every) k[f] = ['espacio'];
  return k;
};
const runFloor = (p: Project, frames = 450, pokes: Record<number, Record<string, number>> = KEEP_LIVES) => simulate(p, { frames, pokes });
const runCeiling = (p: Project, frames = 450) => simulate(p, { frames, pokes: KEEP_LIVES, keys: { 3: ['espacio'] } });
const runFlipping = (p: Project, frames = 600) => simulate(p, { frames, pokes: KEEP_LIVES, keys: keysEvery(40, 20, frames) });

// ------------------------------------------------------------------ the checks

const P = SPRITE_IDS.player;

function checkWorld(p: Project): Check {
  const t = runFloor(p, 300);
  const f = motionOf(t, SPRITE_IDS.floor);
  if (f.left + f.wraps < 10 && f.right > 10) return { ok: false, why: 'El suelo va para el otro lado: tiene que ir hacia la izquierda.' };
  if (f.left < f.frames * 0.5) return { ok: false, why: 'El suelo todavía no corre.' };
  if (!f.wraps) return { ok: false, why: 'El suelo se va hacia la izquierda, pero no vuelve a empezar.' };
  const log = obstaclesOf(p)[0];
  if (log && !motionOf(t, log.id).wraps) return { ok: false, why: 'El suelo anda, pero el Tronco ya no vuelve.' };
  return { ok: true };
}

function checkFlip(p: Project): Check {
  const presses = [20, 50, 80];
  const t = simulate(p, { frames: 100, pokes: KEEP_LIVES, keys: Object.fromEntries(presses.map((f) => [f, ['espacio']])) });
  const y = (f: number) => sp(t.snaps[Math.min(f, t.snaps.length - 1)], P)?.y ?? 0;
  const before = y(18), a = y(40), b = y(70), c = y(98);
  if (Math.abs(a - before) < 30) return { ok: false, why: 'Con la tecla espacio no pasa nada.' };
  const up1 = a > before;
  if (up1 && Math.abs(b - a) < 30) return { ok: false, why: 'Con espacio sube al techo, pero no vuelve a bajar.' };
  if (!up1 && Math.abs(b - a) < 30) return { ok: false, why: 'Con espacio baja, pero no vuelve a subir.' };
  if (Math.sign(b - a) === Math.sign(a - before) || Math.sign(c - b) !== Math.sign(a - before)) return { ok: false, why: 'Todavía no da vuelta cada vez que tocás espacio.' };
  if (Math.max(a, b, c, before) < 40 || Math.min(a, b, c, before) > -40) return { ok: false, why: 'Da vuelta, pero no llega al techo y al piso.' };
  return { ok: true };
}

function checkCeiling(p: Project): Check {
  const obs = obstaclesOf(p);
  if (obs.length < 2) return { ok: false, why: 'Todavía hay un solo tronco: duplicalo.' };
  const t = runFloor(p, 300);
  const runs = obs.map((o) => ({ y: meanY(t, o.id), m: motionOf(t, o.id), vis: visibleShare(t, o.id) }));
  const running = runs.filter((r) => r.vis > 0.5 && r.m.left > r.m.frames * 0.5 && r.m.wraps > 0);
  if (!running.some((r) => r.y > 40)) return { ok: false, why: runs.some((r) => r.y > 40) ? 'El tronco del techo no corre (o no vuelve a empezar).' : 'Todos los troncos van por el piso: uno tiene que ir por el techo.' };
  if (!running.some((r) => r.y < -40)) return { ok: false, why: 'Falta un tronco que corra por el piso.' };
  return { ok: true };
}

/** Lives lost against contacts with any obstacle, in one run. */
function lifeRun(t: Trace, p: Project) {
  const episodes = obstaclesOf(p).reduce((n, o) => n + contacts(t, o.id), 0);
  return { episodes, lost: varMoves(t, 'vidas').down };
}
function checkLives(p: Project): Check {
  const a = lifeRun(runFloor(p), p);
  if (!a.episodes) return { ok: false, why: 'Ningún tronco llega a tocar al Personaje.' };
  if (!a.lost) return { ok: false, why: 'Los troncos te tocan, pero no perdés vidas.' };
  if (a.lost > a.episodes) return { ok: false, why: 'Cada choque te saca muchas vidas: después del choque, que el tronco vuelva a la derecha.' };
  if (a.lost < a.episodes) return { ok: false, why: 'Algún tronco te toca y no te saca una vida.' };
  // the ceiling's logs too, when the character can get up there
  const tc = runCeiling(p);
  const up = sp(tc.snaps[Math.min(30, tc.snaps.length - 1)], P)?.y ?? 0;
  if (up > 40) {
    const b = lifeRun(tc, p);
    if (b.episodes && !b.lost) return { ok: false, why: 'El tronco del techo te toca, pero no te saca vidas.' };
    if (b.lost > b.episodes) return { ok: false, why: 'Arriba, cada choque te saca muchas vidas: que el tronco vuelva a la derecha.' };
    if (b.lost < b.episodes) return { ok: false, why: 'El tronco del techo te toca y no te saca una vida.' };
  }
  return { ok: true };
}

function checkPoints(p: Project): Check {
  const t = runFloor(p, 600);
  const seed = SPRITE_IDS.seed;
  const episodes = contacts(t, seed);
  const got = varMoves(t, 'puntos').up;
  if (!episodes) return { ok: false, why: visibleShare(t, seed) < 0.3 ? 'La semilla no aparece.' : 'La semilla no llega hasta el Personaje.' };
  if (!got) return { ok: false, why: 'Tocás la semilla, pero no suma puntos.' };
  if (got > episodes) return { ok: false, why: 'Cada semilla suma muchos puntos: después de tocarla, que vuelva a la derecha.' };
  if (episodes < 2) return { ok: false, why: 'La semilla suma, pero no vuelve a aparecer.' };
  if (got < episodes) return { ok: false, why: 'A veces tocás la semilla y no suma.' };
  return { ok: true };
}

/** How fast the obstacles move (pixels per frame, wraps left out), between two frames. */
function obstacleSpeed(t: Trace, p: Project, from: number, to: number): number {
  const ds: number[] = [];
  for (const o of obstaclesOf(p)) {
    for (let i = from + 1; i <= Math.min(to, t.snaps.length - 1); i++) {
      const a = sp(t.snaps[i - 1], o.id), b = sp(t.snaps[i], o.id);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      if (dx < 0 && dx > -100) ds.push(-dx);
    }
  }
  if (!ds.length) return 0;
  ds.sort((a, b) => a - b);
  return ds[Math.floor(ds.length / 2)];
}
function checkSpeed(p: Project): Check {
  const plain = runFloor(p, 600);
  const v0 = plain.snaps[Math.min(4, plain.snaps.length - 1)].vars.velocidad;
  const fast = runFloor(p, 90, { 2: { vidas: 99 }, 30: { velocidad: v0 + 8 } });
  const uses = obstacleSpeed(fast, p, 34, 80) - obstacleSpeed(plain, p, 34, 80) >= 4;
  if (!uses) return { ok: false, why: 'Los troncos no usan la variable velocidad para moverse.' };
  const max = Math.max(...plain.snaps.slice(4).map((s) => s.vars.velocidad));
  if (!(max > v0)) return { ok: false, why: 'Los troncos usan la velocidad, pero la velocidad nunca sube.' };
  return { ok: true };
}

function checkEnd(p: Project): Check {
  const lose = runFloor(p, 900, { 2: { vidas: 1 } });
  if (lose.end !== 'lost') return { ok: false, why: lose.end === 'won' ? 'Con 0 vidas ganás: tendría que ser perder.' : 'Con 0 vidas el juego sigue: tiene que perder.' };
  const win = runFloor(p, 900, { 2: { vidas: 99, puntos: 19 } });
  if (win.end !== 'won') return { ok: false, why: win.end === 'lost' ? 'Con 20 puntos perdés: tendría que ser ganar.' : 'Con 20 puntos el juego sigue: tiene que ganar.' };
  return { ok: true };
}

// free challenges: lenient on purpose (any idea of the kind counts)
function checkMoreTraps(p: Project): Check {
  const obs = obstaclesOf(p);
  if (obs.length < 3) return { ok: false, why: 'Hacen falta tres troncos (o más).' };
  const t = runFlipping(p);
  const moving = obs.filter((o) => visibleShare(t, o.id) > 0.5 && motionOf(t, o.id).left > 30);
  return moving.length >= 3 ? { ok: true } : { ok: false, why: 'Hay troncos que no se mueven.' };
}
function checkBird(p: Project): Check {
  const t = runFlipping(p);
  const b = SPRITE_IDS.bird;
  if (visibleShare(t, b) < 0.4) return { ok: false, why: 'El Pájaro no se ve: usá «mostrar».' };
  if (range(t, b, 'x') < 80 && range(t, b, 'y') < 30) return { ok: false, why: 'El Pájaro se ve, pero no vuela.' };
  if (range(t, b, 'y') < 30) return { ok: false, why: 'El Pájaro vuela derecho: que suba y baje.' };
  return { ok: true };
}
function checkStar(p: Project): Check {
  const s = SPRITE_IDS.star;
  for (const t of [runFloor(p, 600), runCeiling(p, 600), runFlipping(p)]) {
    if (visibleShare(t, s) < 0.2) continue;
    let was = false;
    for (let i = 1; i < t.snaps.length; i++) {
      const now = t.snaps[i].touch.includes(s);
      if (now && !was) {
        const a = t.snaps[i - 1].vars, after = t.snaps[Math.min(i + 6, t.snaps.length - 1)].vars;
        if (after.vidas > a.vidas || after.poder !== a.poder || after.puntos !== a.puntos) return { ok: true };
      }
      was = now;
    }
  }
  return { ok: false, why: 'Mostrá la Estrella y que al tocarla te dé algo (una vida, un poder).' };
}
function checkSound(p: Project): Check {
  const a = runFloor(p, 450), c = runFlipping(p, 450);
  return a.stats.sounds + a.stats.says + c.stats.sounds + c.stats.says > 0 ? { ok: true } : { ok: false, why: 'Todavía no suena nada ni nadie dice nada.' };
}
function checkCostume(p: Project): Check {
  const a = runFloor(p, 450), c = runFlipping(p, 450);
  return a.stats.costumes + c.stats.costumes > 0 ? { ok: true } : { ok: false, why: 'Ningún disfraz cambia mientras jugás.' };
}

/** A project's scripts as text without ids or positions (to tell an edit from moving blocks around). */
export function scriptsKey(p: Project): string {
  const blk = (b: Block): unknown => [b.op, Object.entries(b.in).map(([k, s]) => [k, s.r ? blk(s.r) : s.v]), (b.subs ?? []).map((l) => l.map(blk))];
  return JSON.stringify(p.sprites.map((s) => [s.name, s.visible, s.stacks.map((st) => st.blocks.map(blk)).sort((x, y) => (JSON.stringify(x) < JSON.stringify(y) ? -1 : 1))]));
}

// ------------------------------------------------------------------ the list

const ex = (caption: string, sprite: string, blocks: () => Block[]): Example => ({ caption, sprite, blocks });

export const CHALLENGES: readonly Challenge[] = [
  {
    n: 1, title: 'Que el mundo corra', primm: 'predict', concept: 'loops_motion', focus: SPRITE_IDS.floor,
    goal: 'Hacé que el Suelo también corra hacia la izquierda y vuelva a empezar, como el Tronco.',
    hint: 'Mirá el programa del Tronco: el Suelo necesita uno parecido, con «por siempre».',
    highlight: { cat: 'motion', ops: ['changeX', 'setX', 'forever', 'if', 'lt', 'xpos'] },
    example: ex('Una nube que cruza el cielo hacia la derecha y vuelve a salir por la izquierda.', 'Nube', () => [
      make('flag'), make('goto', { X: -240, Y: 120 }),
      make('forever', {}, [[make('changeX', { DX: 2 }), make('if', { COND: make('gt', { A: make('xpos'), B: 240 }) }, [[make('setX', { X: -240 })]])]]),
    ]),
    check: checkWorld,
  },
  {
    n: 2, title: 'Que dé vuelta', primm: 'investigate', concept: 'events_ifelse', focus: SPRITE_IDS.player,
    goal: 'Arreglalo: con espacio, si está abajo que suba al techo; si no, que baje al piso.',
    hint: 'Usá «si … entonces / si no»: preguntá si la posición en y es menor que 0.',
    highlight: { cat: 'control', ops: ['ifElse', 'lt', 'ypos', 'setY'] },
    example: ex('Un pez que cambia de lado: si está a la izquierda va a la derecha; si no, a la izquierda.', 'Pez', () => [
      make('key', { KEY: 'flecha derecha' }),
      make('ifElse', { COND: make('lt', { A: make('xpos'), B: 0 }) }, [[make('setX', { X: 150 })], [make('setX', { X: -150 })]]),
    ]),
    check: checkFlip,
  },
  {
    n: 3, title: 'Trampas arriba y abajo', primm: 'modify', concept: 'duplicate_modify', focus: SPRITE_IDS.log,
    goal: 'Duplicá el Tronco y hacé que la copia corra por el techo (y = 100).',
    hint: 'Tocá ⧉ en la tarjeta del Tronco. En la copia, cambiá los números de «y».',
    highlight: { cat: 'motion', ops: ['goto'] },
    example: ex('Dos nubes: la copia es igual, pero va más arriba (otra y).', 'Nube2', () => [
      make('flag'), make('goto', { X: -240, Y: 150 }),
      make('forever', {}, [[make('changeX', { DX: 2 }), make('if', { COND: make('gt', { A: make('xpos'), B: 240 }) }, [[make('goto', { X: -240, Y: 150 })]])]]),
    ]),
    check: checkCeiling,
  },
  {
    n: 4, title: '¡Auch!', primm: 'make', concept: 'sensing_variables', focus: SPRITE_IDS.log,
    goal: 'Si un tronco toca al Personaje: una vida menos, y el tronco vuelve a la derecha. En los dos troncos.',
    hint: 'Adentro del «por siempre» de cada tronco: «si ¿tocando Personaje? entonces …».',
    highlight: { cat: 'sensing', ops: ['touching', 'if', 'changeVar', 'goto'] },
    example: ex('Una pelota que, si toca el borde, cuenta un rebote y vuelve al centro.', 'Pelota', () => [
      make('flag'),
      make('forever', {}, [[make('changeX', { DX: 4 }), make('if', { COND: make('touching', { OBJ: 'borde' }) }, [[make('changeVar', { VAR: 'puntos', V: 1 }), make('goto', { X: 0, Y: 0 })]])]]),
    ]),
    check: checkLives,
  },
  {
    n: 5, title: 'Puntos', primm: 'make', concept: 'variables', focus: SPRITE_IDS.seed,
    goal: 'Cada semilla que agarrás suma un punto, y la semilla vuelve a aparecer a la derecha.',
    hint: 'En el programa de la Semilla: si toca al Personaje, cambiá puntos y mandala a la derecha.',
    highlight: { cat: 'variables', ops: ['changeVar', 'touching', 'if', 'goto'] },
    example: ex('Un gato que junta quesos: si toca el queso, dice ¡Rico! y el queso salta a otro lugar.', 'Queso', () => [
      make('flag'),
      make('forever', {}, [[make('if', { COND: make('touching', { OBJ: 'Gato' }) }, [[make('sayFor', { MSG: '¡Rico!', SECS: 1 }), make('goto', { X: make('random', { A: -200, B: 200 }), Y: 0 })]])]]),
    ]),
    check: checkPoints,
  },
  {
    n: 6, title: 'Cada vez más rápido', primm: 'modify', concept: 'variable_expression', focus: SPRITE_IDS.log,
    goal: 'Que los troncos se muevan con la variable velocidad, y que la velocidad suba cada vez que juntás una semilla.',
    hint: 'Para ir a la izquierda con la velocidad: «cambiar x en (0 - velocidad)».',
    highlight: { cat: 'operators', ops: ['sub', 'var', 'changeVar', 'changeX'] },
    example: ex('Una lluvia que cae cada vez más rápido: baja con la velocidad, y la velocidad sube sola.', 'Gota', () => [
      make('flag'),
      make('forever', {}, [[make('changeY', { DY: make('sub', { A: 0, B: make('var', { VAR: 'velocidad' }) }) }), make('if', { COND: make('lt', { A: make('ypos'), B: -180 }) }, [[make('setY', { Y: 180 }), make('changeVar', { VAR: 'velocidad', V: 1 })]])]]),
    ]),
    check: checkSpeed,
  },
  {
    n: 7, title: 'Ganar o perder', primm: 'make', concept: 'conditions_variables', focus: SPRITE_IDS.stage,
    goal: 'Con 0 vidas, perdés. Con 20 puntos, ganás.',
    hint: 'En el Escenario: «por siempre», con dos «si» que miren las variables vidas y puntos.',
    highlight: { cat: 'game', ops: ['lose', 'win', 'if', 'lt', 'gt', 'var', 'forever'] },
    example: ex('Un juego de preguntas: si las respuestas buenas llegan a 10, dice ¡Campeón! y se detiene todo.', 'Escenario', () => [
      make('flag'),
      make('forever', {}, [[make('if', { COND: make('gt', { A: make('var', { VAR: 'puntos' }), B: 9 }) }, [[make('sayFor', { MSG: '¡Campeón!', SECS: 2 }), make('stop')]])]]),
    ]),
    check: checkEnd,
  },
  // the free challenges: any order, each optional, each with its own star
  {
    n: 8, title: 'Más trampas', primm: 'make', concept: 'free', focus: SPRITE_IDS.log, free: true,
    goal: 'Agregá otro tronco con su propio camino (tres o más).', hint: 'Duplicá un tronco y cambiale la x o la y.',
    highlight: { cat: 'motion', ops: ['goto'] }, example: ex('Un tronco que sale más tarde: empieza más a la derecha.', 'Tronco3', () => [make('flag'), make('goto', { X: 480, Y: LANE.floor })]),
    check: checkMoreTraps,
  },
  {
    n: 9, title: 'Un pájaro', primm: 'make', concept: 'free', focus: SPRITE_IDS.bird, free: true,
    goal: 'Mostrá el Pájaro y hacelo volar por el medio, subiendo y bajando.', hint: 'Mostralo, y adentro de «por siempre» usá «repetir» para que suba un rato y baje otro rato.',
    highlight: { cat: 'control', ops: ['show', 'repeat', 'changeY', 'forever'] },
    example: ex('Una mariposa que sube y baja.', 'Mariposa', () => [make('flag'), make('show'), make('forever', {}, [[make('repeat', { N: 20 }, [[make('changeY', { DY: 3 })]]), make('repeat', { N: 20 }, [[make('changeY', { DY: -3 })]])]])]),
    check: checkBird,
  },
  {
    n: 10, title: 'Poder especial', primm: 'make', concept: 'free', focus: SPRITE_IDS.star, free: true,
    goal: 'Mostrá la Estrella: al tocarla, que te dé algo (una vida extra, un poder).', hint: 'La Estrella puede correr como un tronco; si toca al Personaje, cambiá vidas o poder.',
    highlight: { cat: 'variables', ops: ['show', 'touching', 'changeVar', 'setVar'] },
    example: ex('Un corazón que da una vida.', 'Corazón', () => [make('flag'), make('show'), make('forever', {}, [[make('if', { COND: make('touching', { OBJ: P }) }, [[make('changeVar', { VAR: 'vidas', V: 1 }), make('hide')]])]])]),
    check: checkStar,
  },
  {
    n: 11, title: 'Con sonido', primm: 'make', concept: 'free', focus: SPRITE_IDS.player, free: true,
    goal: 'Que suene algo o que alguien diga algo mientras jugás.', hint: 'Probá «iniciar sonido» o «decir» cuando pasa algo.',
    highlight: { cat: 'sound', ops: ['sound', 'sayFor'] },
    example: ex('Un salto con ruido.', 'Personaje', () => [make('key', { KEY: 'espacio' }), make('sound', { S: 'salto' })]),
    check: checkSound,
  },
  {
    n: 12, title: 'Disfraz nuevo', primm: 'make', concept: 'free', focus: SPRITE_IDS.player, free: true,
    goal: 'Cambiá un disfraz mientras jugás (el Personaje mareado al chocar, el suelo de lava…).', hint: 'Usá «cambiar disfraz a» cuando pasa algo.',
    highlight: { cat: 'looks', ops: ['costume'] },
    example: ex('Al empezar, el suelo es de lava.', 'Suelo', () => [make('flag'), make('costume', { C: 'lava' })]),
    check: checkCostume,
  },
  {
    n: 13, title: 'Tu propia idea', primm: 'make', concept: 'free', focus: SPRITE_IDS.player, free: true,
    goal: 'Cambiá lo que quieras de tu juego y probalo.', hint: 'Cualquier idea vale: otra velocidad, otro camino, otro final.',
    highlight: { cat: 'events', ops: [] },
    example: ex('Por ejemplo: con la flecha arriba, el Personaje dice ¡Vamos!', 'Personaje', () => [make('key', { KEY: 'flecha arriba' }), make('sayFor', { MSG: '¡Vamos!', SECS: 1 })]),
    check: (p, o) => (o?.baseline && scriptsKey(p) !== o.baseline ? { ok: true } : { ok: false, why: 'Cambiá algo y tocá la bandera verde.' }),
  },
];

export const CORE = CHALLENGES.filter((c) => !c.free);
export const FREE = CHALLENGES.filter((c) => c.free);
export const challenge = (n: number) => CHALLENGES.find((c) => c.n === n) ?? null;
/** The core challenge after which "Tu juego" is in the Arcade. */
export const ARCADE_AFTER = 5;

// ------------------------------------------------------------------ PRIMM questions

/** Challenge 1's predict question: what the log's given script will do (three drawn choices, the first right). */
export const PREDICT = {
  n: 1,
  question: 'El Tronco ya tiene su programa. ¿Qué va a pasar cuando toques la bandera verde?',
  choices: [
    { id: 'wraps', text: 'Se va a la izquierda y vuelve a salir por la derecha' },
    { id: 'leaves', text: 'Se va a la izquierda y desaparece para siempre' },
    { id: 'still', text: 'Se queda quieto' },
  ],
  right: 'wraps',
  yes: '¡Bien predicho! El bloque «si posición en x < -240» lo trae de vuelta por la derecha.',
  no: 'Pasó otra cosa: vuelve a salir por la derecha. Lo hace el bloque «si posición en x < -240 entonces ir a x: 240».',
} as const;

/** Challenge 2's investigate question: the buggy flip only goes up; which block is to blame. */
export const INVESTIGATE = {
  n: 2,
  question: 'Con la tecla espacio el Personaje sube al techo… pero nunca vuelve a bajar. Tocá el bloque que tiene la culpa.',
  right: 'setY' as Op,
  yes: '¡Ese es! «fijar y a 100» lo manda siempre arriba, aunque ya esté arriba.',
  no: 'Ese no tiene la culpa. Mirá el otro: «fijar y a 100» lo manda siempre arriba.',
} as const;
