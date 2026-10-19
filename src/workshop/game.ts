// "Al revés" (T40): the game the Workshop's challenges build, a corridor
// runner with flipping gravity (Geometry Dash / VVVVVV). The child's
// character runs in place on the corridor's floor; space flips it to the
// ceiling (drawn upside down) and back; logs come from the right on the
// floor and on the ceiling; seeds give points; the world speeds up.
//
// Here: the sprites and where they start, the scripts each challenge gives
// (the log's starter, the buggy flip of challenge 2, the seed's run), and a
// canonical solution per challenge (`SOLVE`: what a skipped challenge
// leaves in place so the next ones still work; the tests check every
// challenge against it). Stage coordinates are Scratch's: 480 × 360, the
// centre at 0, 0, y up. The floor lane is y = -100, the ceiling lane 100.

import type { VarName } from './blocks';
import { make, newId, spriteById, stackOf, type Block, type Project, type Sprite, type SpriteKind } from './model';
import { simulate } from './vm';

export const LANE = { floor: -100, ceiling: 100 } as const;
export const SPEED = 6;
/** Where everything that runs comes back from (and leaves at). */
export const RIGHT = 240;
export const LEFT = -240;

export const SPRITE_IDS = { stage: 'stage', player: 'player', floor: 'floor', log: 'log', seed: 'seed', bird: 'bird', star: 'star' } as const;

/** Each kind's costumes (the first is its own); Scratch's `cambiar disfraz a`. */
export const COSTUMES: Record<SpriteKind, readonly string[]> = {
  stage: ['pasillo'],
  player: ['normal', 'feliz', 'mareado'],
  floor: ['pasillo', 'pasto', 'lava'],
  obstacle: ['tronco', 'pinches', 'piedra'],
  seed: ['semilla', 'moneda'],
  bird: ['pájaro', 'murciélago'],
  star: ['estrella', 'corazón'],
};

export const INITIAL_VARS: Record<VarName, number> = { puntos: 0, vidas: 3, velocidad: SPEED, poder: 0 };

const sprite = (id: string, name: string, kind: SpriteKind, x: number, y: number, o: Partial<Sprite> = {}): Sprite => ({
  id, name, kind, x, y, dir: kind === 'floor' || kind === 'obstacle' || kind === 'seed' ? -90 : 90, visible: true, costume: COSTUMES[kind][0], stacks: [], ...o,
});

// ------------------------------------------------------------------ scripts (builders)

const lt = (a: Block, b: number | string) => make('lt', { A: a, B: b });
const gt = (a: Block, b: number | string) => make('gt', { A: a, B: b });
const xpos = () => make('xpos');
const ypos = () => make('ypos');
const v = (name: VarName) => make('var', { VAR: name });

/** The log's run: comes from the right, crosses, comes back from the right (challenge 1's given script). */
export function runScript(lane: number, o: { hit?: 'life' | 'point'; speedVar?: boolean; speedUp?: boolean; show?: boolean } = {}): Block[] {
  const step = o.speedVar ? make('changeX', { DX: make('sub', { A: 0, B: v('velocidad') }) }) : make('changeX', { DX: -SPEED });
  const body: Block[] = [step, make('if', { COND: lt(xpos(), LEFT) }, [[make('goto', { X: RIGHT, Y: lane })]])];
  if (o.hit) {
    const then: Block[] = o.hit === 'life'
      ? [make('changeVar', { VAR: 'vidas', V: -1 }), make('goto', { X: RIGHT, Y: lane })]
      : [make('changeVar', { VAR: 'puntos', V: 1 }), ...(o.speedUp ? [make('changeVar', { VAR: 'velocidad', V: 1 })] : []), make('goto', { X: RIGHT, Y: lane })];
    body.push(make('if', { COND: make('touching', { OBJ: SPRITE_IDS.player }) }, [then]));
  }
  return [make('flag'), ...(o.show ? [make('show')] : []), make('goto', { X: o.hit === 'point' || o.show ? 400 : RIGHT, Y: lane }), make('forever', {}, [body])];
}

/** The player's start (given from challenge 1). */
export const playerStart = (): Block[] => [make('flag'), make('goto', { X: -150, Y: LANE.floor })];
/** Challenge 2's buggy flip: it only ever goes up. */
export const buggyFlip = (): Block[] => [make('key', { KEY: 'espacio' }), make('setY', { Y: LANE.ceiling })];
export const goodFlip = (): Block[] => [
  make('key', { KEY: 'espacio' }),
  make('ifElse', { COND: lt(ypos(), 0) }, [[make('setY', { Y: LANE.ceiling })], [make('setY', { Y: LANE.floor })]]),
];
/** The floor's run (challenge 1's answer): left forever, back by one whole tile at the left edge. */
export const floorRun = (): Block[] => [
  make('flag'), make('goto', { X: 0, Y: -155 }),
  make('forever', {}, [[make('changeX', { DX: -SPEED }), make('if', { COND: lt(xpos(), LEFT) }, [[make('setX', { X: RIGHT })]])]]),
];
/** Challenge 7's answer, on the stage. */
export const endRules = (): Block[] => [
  make('flag'),
  make('forever', {}, [[make('if', { COND: lt(v('vidas'), 1) }, [[make('lose')]]), make('if', { COND: gt(v('puntos'), 19) }, [[make('win')]])]]),
];

// ------------------------------------------------------------------ the project at the start

/** The project the Workshop opens with: the corridor, the character, the floor, one log with its given run; the seed, the bird and the star hidden. */
export function newProject(): Project {
  return {
    v: 1,
    vars: { ...INITIAL_VARS },
    sprites: [
      sprite(SPRITE_IDS.stage, 'Escenario', 'stage', 0, 0, { dir: 90 }),
      sprite(SPRITE_IDS.player, 'Personaje', 'player', -150, LANE.floor, { stacks: [stackOf(30, 30, playerStart())] }),
      sprite(SPRITE_IDS.floor, 'Suelo', 'floor', 0, -155),
      sprite(SPRITE_IDS.log, 'Tronco', 'obstacle', RIGHT, LANE.floor, { stacks: [stackOf(30, 30, runScript(LANE.floor))] }),
      sprite(SPRITE_IDS.seed, 'Semilla', 'seed', 400, LANE.floor, { visible: false }),
      sprite(SPRITE_IDS.bird, 'Pájaro', 'bird', 0, 0, { visible: false }),
      sprite(SPRITE_IDS.star, 'Estrella', 'star', 300, LANE.floor, { visible: false }),
    ],
  };
}

export const obstaclesOf = (p: Project) => p.sprites.filter((s) => s.kind === 'obstacle');

/** The lane an obstacle runs in (from a short run of its own scripts; its start when it does not move). */
export function laneOf(p: Project, id: string): number {
  const t = simulate(p, { frames: 20 });
  const ys = t.snaps.slice(2).map((s) => s.sprites.find((x) => x.id === id)?.y ?? 0);
  const y = ys.length ? ys[ys.length - 1] : spriteById(p, id)?.y ?? LANE.floor;
  return y > 0 ? LANE.ceiling : LANE.floor;
}

const setScripts = (p: Project, id: string, blocks: Block[][]): Project => ({
  ...p,
  sprites: p.sprites.map((s) => (s.id === id ? { ...s, stacks: blocks.map((b, i) => stackOf(30, 30 + i * 200, b)) } : s)),
});
const keepOther = (s: Sprite, drop: (b: Block[]) => boolean) => s.stacks.filter((st) => !drop(st.blocks));

/** What each challenge adds to the project as it opens (the given scripts). */
export const ENTER: Record<number, (p: Project) => Project> = {
  2: (p) => ({
    ...p,
    sprites: p.sprites.map((s) => (s.id === SPRITE_IDS.player && !s.stacks.some((st) => st.blocks[0]?.op === 'key')
      ? { ...s, stacks: [...s.stacks, stackOf(30, 150, buggyFlip())] } : s)),
  }),
  5: (p) => ({
    ...p,
    sprites: p.sprites.map((s) => (s.id === SPRITE_IDS.seed && !s.stacks.length
      ? { ...s, visible: true, stacks: [stackOf(30, 30, runScript(LANE.floor, { show: true }))] } : s)),
  }),
};

/**
 * Each core challenge's canonical solution, applied to the project as it is
 * (a skipped challenge leaves it so the next ones work; the tests check that
 * every challenge passes with it and fails without it).
 */
export const SOLVE: Record<number, (p: Project) => Project> = {
  1: (p) => setScripts(p, SPRITE_IDS.floor, [floorRun()]),
  2: (p) => {
    const pl = spriteById(p, SPRITE_IDS.player)!;
    return { ...p, sprites: p.sprites.map((s) => (s === pl ? { ...s, stacks: [...keepOther(s, (b) => b[0]?.op === 'key'), stackOf(30, 150, goodFlip())] } : s)) };
  },
  3: (p) => {
    let q = p;
    if (obstaclesOf(q).length < 2) {
      const log = obstaclesOf(q)[0];
      const copy: Sprite = { ...log, id: newId(), name: `${log.name.replace(/\d+$/, '')}2`, y: LANE.ceiling, stacks: [stackOf(30, 30, runScript(LANE.ceiling))] };
      const i = q.sprites.indexOf(log);
      q = { ...q, sprites: [...q.sprites.slice(0, i + 1), copy, ...q.sprites.slice(i + 1)] };
    }
    const obs = obstaclesOf(q);
    if (!obs.some((o) => laneOf(q, o.id) > 0)) q = setScripts(q, obs[obs.length - 1].id, [runScript(LANE.ceiling)]);
    return q;
  },
  4: (p) => obstaclesOf(p).reduce((q, o) => setScripts(q, o.id, [runScript(laneOf(p, o.id), { hit: 'life' })]), p),
  5: (p) => setScripts(ENTER[5](p), SPRITE_IDS.seed, [runScript(LANE.floor, { hit: 'point', show: true })]),
  6: (p) => {
    const q = obstaclesOf(p).reduce((r, o) => setScripts(r, o.id, [runScript(laneOf(p, o.id), { hit: 'life', speedVar: true })]), p);
    return setScripts(q, SPRITE_IDS.seed, [runScript(LANE.floor, { hit: 'point', show: true, speedVar: true, speedUp: true })]);
  },
  7: (p) => {
    const st = spriteById(p, SPRITE_IDS.stage)!;
    return { ...p, sprites: p.sprites.map((s) => (s === st ? { ...s, stacks: [...s.stacks, stackOf(30, 30 + s.stacks.length * 180, endRules())] } : s)) };
  },
};

/** The project as it would be with challenges 1..n solved the canonical way (the previews, the tests). */
export function solvedUpTo(n: number, base = newProject()): Project {
  let p = base;
  for (let i = 1; i <= n; i++) {
    if (ENTER[i]) p = ENTER[i](p);
    p = SOLVE[i](p);
  }
  return p;
}
