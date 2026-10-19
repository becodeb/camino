import { describe, expect, it } from 'vitest';
import { CHALLENGES, CORE, FREE, scriptsKey } from './challenges';
import { ENTER, LANE, newProject, obstaclesOf, runScript, solvedUpTo, SPRITE_IDS } from './game';
import { approxMeasure, duplicateSprite, findBlock, make, setInput, spriteById, stackOf, type Block, type Project } from './model';
import { simulate } from './vm';

const ctx = { measure: approxMeasure };
const check = (n: number, p: Project) => CHALLENGES.find((c) => c.n === n)!.check(p);
/** The project as challenge n opens: 1..n-1 solved, n's given scripts added. */
const opening = (n: number) => { const p = solvedUpTo(n - 1); return ENTER[n] ? ENTER[n](p) : p; };
const scripts = (p: Project, id: string, blocks: Block[][]): Project => ({
  ...p, sprites: p.sprites.map((s) => (s.id === id ? { ...s, stacks: blocks.map((b, i) => stackOf(20, 20 + 200 * i, b)) } : s)),
});
const lt = (a: Block, b: number) => make('lt', { A: a, B: b });

describe('the game', () => {
  it('opens with the character, the floor, one log running on its given script, and the hidden extras', () => {
    const p = newProject();
    expect(p.sprites.map((s) => s.name)).toEqual(['Escenario', 'Personaje', 'Suelo', 'Tronco', 'Semilla', 'Pájaro', 'Estrella']);
    const t = simulate(p, { frames: 120 });
    const xs = t.snaps.map((s) => s.sprites.find((x) => x.id === SPRITE_IDS.log)!.x);
    expect(Math.min(...xs)).toBeLessThan(-230);
    expect(xs.some((x, i) => i > 0 && x - xs[i - 1] > 200)).toBe(true); // it comes back from the right
    expect(spriteById(p, SPRITE_IDS.seed)!.visible).toBe(false);
  });
  it('the canonical game, all seven challenges solved, is a whole game you can win and lose', () => {
    const p = solvedUpTo(7);
    expect(obstaclesOf(p)).toHaveLength(2);
    // no keys: logs keep hitting the character until it loses
    expect(simulate(p, { frames: 3000 }).end).toBe('lost');
    // flipping now and then: still a game that ends
    const keys: Record<number, string[]> = {};
    for (let f = 20; f < 3000; f += 23) keys[f] = ['espacio'];
    expect(['lost', 'won']).toContain(simulate(p, { frames: 3000, keys }).end);
  });
});

describe('every core challenge: fails as it opens, passes with its solution', () => {
  for (const c of CORE) {
    it(`${c.n}. ${c.title}`, () => {
      const before = check(c.n, opening(c.n));
      expect(before.ok).toBe(false);
      expect(before.why).toBeTruthy();
      expect(check(c.n, solvedUpTo(c.n)).ok).toBe(true);
    });
  }
  it('the later challenges do not break the earlier ones', () => {
    const p = solvedUpTo(7);
    for (const n of [1, 2, 3, 5, 6]) expect(check(n, p)).toEqual({ ok: true });
  });
});

describe('any correct solution passes, not one exact script', () => {
  it('1: the floor with "mover pasos" (it points left) and "fijar x" at the edge', () => {
    const p = scripts(opening(1), SPRITE_IDS.floor, [[make('flag'), make('forever', {}, [[make('move', { N: 4 }), make('if', { COND: lt(make('xpos'), -240) }, [[make('setX', { X: 240 })]])]])]]);
    expect(check(1, p)).toEqual({ ok: true });
  });
  it('1: says what is missing: a floor that leaves and never comes back', () => {
    const p = scripts(opening(1), SPRITE_IDS.floor, [[make('flag'), make('forever', {}, [[make('changeX', { DX: -6 })]])]]);
    expect(check(1, p)).toEqual({ ok: false, why: 'El suelo se va hacia la izquierda, pero no vuelve a empezar.' });
  });
  it('2: the buggy flip is named for what it does; "cambiar y en" with a condition also works', () => {
    expect(check(2, opening(2)).why).toBe('Con espacio sube al techo, pero no vuelve a bajar.');
    const pl = spriteById(opening(2), SPRITE_IDS.player)!;
    const alt = scripts(opening(2), SPRITE_IDS.player, [pl.stacks[0].blocks, [
      make('key', { KEY: 'espacio' }),
      make('if', { COND: make('gt', { A: make('ypos'), B: 0 }) }, [[make('changeY', { DY: -200 }), make('stop')]]),
    ]]);
    expect(check(2, alt).ok).toBe(false);
    const alt2 = scripts(opening(2), SPRITE_IDS.player, [pl.stacks[0].blocks, [
      make('key', { KEY: 'espacio' }),
      make('ifElse', { COND: make('gt', { A: make('ypos'), B: 0 }) }, [[make('changeY', { DY: -200 })], [make('changeY', { DY: 200 })]]),
    ]]);
    expect(check(2, alt2)).toEqual({ ok: true });
  });
  it('3: duplicating the log for real and editing the copy\'s two y numbers', () => {
    const p = opening(3);
    const d = duplicateSprite(p, SPRITE_IDS.log)!;
    let stacks = d.sprite.stacks;
    for (const st of stacks) for (const b of st.blocks.flatMap(function walk(x: Block): Block[] { return [x, ...(x.subs ?? []).flat().flatMap(walk)]; })) {
      if (b.op === 'goto') stacks = setInput(stacks, b.id, 'Y', '100');
    }
    const q = { ...d.project, sprites: d.project.sprites.map((s) => (s.id === d.sprite.id ? { ...s, stacks } : s)) };
    expect(check(3, q)).toEqual({ ok: true });
    // a copy left on the floor is not enough
    expect(check(3, d.project).why).toBe('Todos los troncos van por el piso: uno tiene que ir por el techo.');
  });
  it('4: the hit can live in the character (a broadcast sends the log back)', () => {
    const p = opening(4);
    const [floorLog, ceilLog] = obstaclesOf(p);
    const pl = spriteById(p, SPRITE_IDS.player)!;
    const hit = (id: string, msg: string) => make('if', { COND: make('touching', { OBJ: id }) }, [[make('changeVar', { VAR: 'vidas', V: -1 }), make('broadcast', { MSG: msg })]]);
    let q = scripts(p, SPRITE_IDS.player, [...pl.stacks.map((s) => s.blocks), [make('flag'), make('forever', {}, [[hit(floorLog.id, 'choque'), hit(ceilLog.id, 'punto')]])]]);
    q = scripts(q, floorLog.id, [runScript(LANE.floor), [make('receive', { MSG: 'choque' }), make('goto', { X: 240, Y: LANE.floor })]]);
    q = scripts(q, ceilLog.id, [runScript(LANE.ceiling), [make('receive', { MSG: 'punto' }), make('goto', { X: 240, Y: LANE.ceiling })]]);
    expect(check(4, q)).toEqual({ ok: true });
  });
  it('4: a hit that never sends the log away takes many lives, and one log forgotten is noticed', () => {
    const p = opening(4);
    const [floorLog, ceilLog] = obstaclesOf(p);
    const sticky = [make('flag'), make('goto', { X: 240, Y: LANE.floor }), make('forever', {}, [[make('changeX', { DX: -6 }), make('if', { COND: lt(make('xpos'), -240) }, [[make('goto', { X: 240, Y: LANE.floor })]]), make('if', { COND: make('touching', { OBJ: SPRITE_IDS.player }) }, [[make('changeVar', { VAR: 'vidas', V: -1 })]])]])];
    expect(check(4, scripts(p, floorLog.id, [sticky])).why).toBe('Cada choque te saca muchas vidas: después del choque, que el tronco vuelva a la derecha.');
    expect(check(4, scripts(p, floorLog.id, [runScript(LANE.floor, { hit: 'life' })])).why).toBe('El tronco del techo te toca, pero no te saca vidas.');
    expect(ceilLog).toBeTruthy();
  });
  it('5: a seed that hides and comes back a moment later also counts', () => {
    const p = opening(5);
    const seed = [make('flag'), make('show'), make('goto', { X: 400, Y: LANE.floor }), make('forever', {}, [[
      make('changeX', { DX: -6 }), make('if', { COND: lt(make('xpos'), -240) }, [[make('goto', { X: 240, Y: LANE.floor })]]),
      make('if', { COND: make('touching', { OBJ: SPRITE_IDS.player }) }, [[make('changeVar', { VAR: 'puntos', V: 1 }), make('hide'), make('setX', { X: 240 }), make('wait', { SECS: 0.5 }), make('show')]]),
    ]])];
    expect(check(5, scripts(p, SPRITE_IDS.seed, [seed]))).toEqual({ ok: true });
    // one that never comes back is named
    const gone = [make('flag'), make('show'), make('goto', { X: 400, Y: LANE.floor }), make('forever', {}, [[
      make('changeX', { DX: -6 }), make('if', { COND: lt(make('xpos'), -240) }, [[make('goto', { X: 240, Y: LANE.floor })]]),
      make('if', { COND: make('touching', { OBJ: SPRITE_IDS.player }) }, [[make('changeVar', { VAR: 'puntos', V: 1 }), make('hide')]]),
    ]])];
    expect(check(5, scripts(p, SPRITE_IDS.seed, [gone])).why).toBe('La semilla suma, pero no vuelve a aparecer.');
  });
  it('6: "mover (velocidad) pasos" works as well as "cambiar x en (0 - velocidad)"', () => {
    let p = opening(6);
    for (const o of obstaclesOf(p)) {
      const lane = o.id === SPRITE_IDS.log ? LANE.floor : LANE.ceiling;
      p = scripts(p, o.id, [[make('flag'), make('goto', { X: 240, Y: lane }), make('forever', {}, [[
        make('move', { N: make('var', { VAR: 'velocidad' }) }),
        make('if', { COND: lt(make('xpos'), -240) }, [[make('goto', { X: 240, Y: lane })]]),
        make('if', { COND: make('touching', { OBJ: SPRITE_IDS.player }) }, [[make('changeVar', { VAR: 'vidas', V: -1 }), make('goto', { X: 240, Y: lane })]]),
      ]])]]);
    }
    expect(check(6, p).why).toBe('Los troncos usan la velocidad, pero la velocidad nunca sube.');
    // the speed goes up every 5 seconds instead: also faster and faster
    p = scripts(p, SPRITE_IDS.stage, [[make('flag'), make('forever', {}, [[make('wait', { SECS: 5 }), make('changeVar', { VAR: 'velocidad', V: 1 })]])]]);
    expect(check(6, p)).toEqual({ ok: true });
  });
  it('7: the rules may sit in the character, with "=" instead of "<" and ">"', () => {
    const p = opening(7);
    const pl = spriteById(p, SPRITE_IDS.player)!;
    const q = scripts(p, SPRITE_IDS.player, [...pl.stacks.map((s) => s.blocks), [make('flag'), make('forever', {}, [[
      make('if', { COND: make('eq', { A: make('var', { VAR: 'vidas' }), B: 0 }) }, [[make('lose')]]),
      make('if', { COND: make('eq', { A: make('var', { VAR: 'puntos' }), B: 20 }) }, [[make('win')]]),
    ]])]]);
    expect(check(7, q)).toEqual({ ok: true });
    // backwards rules are named
    const back = scripts(p, SPRITE_IDS.player, [...pl.stacks.map((s) => s.blocks), [make('flag'), make('forever', {}, [[
      make('if', { COND: lt(make('var', { VAR: 'vidas' }), 1) }, [[make('win')]]),
    ]])]]);
    expect(check(7, back).why).toBe('Con 0 vidas ganás: tendría que ser perder.');
  });
});

describe('free challenges', () => {
  it('each one passes with its own kind of idea, and none passes on the finished core game', () => {
    const p = solvedUpTo(7);
    for (const c of FREE) expect(c.check(p, { baseline: scriptsKey(p) }).ok, `${c.n}`).toBe(false);
    const free = (n: number) => FREE.find((c) => c.n === n)!;
    // three logs
    const d = duplicateSprite(p, SPRITE_IDS.log)!;
    expect(free(8).check(d.project).ok).toBe(true);
    // the bird flies up and down
    const bird = scripts(p, SPRITE_IDS.bird, [[make('flag'), make('show'), make('forever', {}, [[make('changeX', { DX: -3 }), make('repeat', { N: 15 }, [[make('changeY', { DY: 3 })]]), make('repeat', { N: 15 }, [[make('changeY', { DY: -3 })]])]])]]);
    expect(free(9).check(bird).ok).toBe(true);
    // the star gives a life
    const star = scripts(p, SPRITE_IDS.star, [runScript(LANE.floor, { show: true }).map((b) => b), [make('flag'), make('forever', {}, [[make('if', { COND: make('touching', { OBJ: SPRITE_IDS.player }) }, [[make('changeVar', { VAR: 'vidas', V: 1 }), make('setX', { X: 300 })]])]])]]);
    expect(free(10).check(star).ok).toBe(true);
    // a sound on space, a costume on a hit
    const pl = spriteById(p, SPRITE_IDS.player)!;
    const snd = scripts(p, SPRITE_IDS.player, [...pl.stacks.map((s) => s.blocks), [make('key', { KEY: 'espacio' }), make('sound', { S: 'salto' })]]);
    expect(free(11).check(snd).ok).toBe(true);
    const cos = scripts(p, SPRITE_IDS.floor, [...spriteById(p, SPRITE_IDS.floor)!.stacks.map((s) => s.blocks), [make('flag'), make('costume', { C: 'lava' })]]);
    expect(free(12).check(cos).ok).toBe(true);
    // their own idea: any change of the scripts (moving a stack around is not one)
    const moved = { ...p, sprites: p.sprites.map((s) => ({ ...s, stacks: s.stacks.map((st) => ({ ...st, x: st.x + 50 })) })) };
    expect(free(13).check(moved, { baseline: scriptsKey(p) }).ok).toBe(false);
    const log = obstaclesOf(p)[0];
    const goto = findBlock(log.stacks, log.stacks[0].blocks[1].id)!.block;
    const edited = scripts(p, log.id, [setInput(log.stacks, goto.id, 'X', '300')[0].blocks]);
    expect(free(13).check(edited, { baseline: scriptsKey(p) }).ok).toBe(true);
    void ctx;
  });
});
