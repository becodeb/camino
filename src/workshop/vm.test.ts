import { describe, expect, it } from 'vitest';
import { make, stackOf, type Block, type Project, type Sprite } from './model';
import { MAX_OPS, simulate, VM } from './vm';

const sprite = (id: string, kind: Sprite['kind'], scripts: Block[][], o: Partial<Sprite> = {}): Sprite => ({
  id, name: id, kind, x: 0, y: 0, dir: 90, visible: true, costume: 'x', stacks: scripts.map((b, i) => stackOf(0, i * 100, b)), ...o,
});
const project = (...sprites: Sprite[]): Project => ({ v: 1, vars: { puntos: 0, vidas: 3, velocidad: 6, poder: 0 }, sprites });
const at = (t: ReturnType<typeof simulate>, f: number, id: string) => t.snaps[f].sprites.find((s) => s.id === id)!;

describe('threads and frames', () => {
  it('runs a green-flag script: straight blocks in one frame, a loop one pass a frame', () => {
    const p = project(sprite('a', 'obstacle', [[make('flag'), make('goto', { X: 10, Y: 20 }), make('forever', {}, [[make('changeX', { DX: -6 })]])]]));
    const t = simulate(p, { frames: 3 });
    expect(at(t, 1, 'a')).toMatchObject({ x: 4, y: 20 });
    expect(at(t, 2, 'a').x).toBe(-2);
    expect(at(t, 3, 'a').x).toBe(-8);
  });
  it('repeats exactly n times, yielding between passes', () => {
    const p = project(sprite('a', 'obstacle', [[make('flag'), make('repeat', { N: 3 }, [[make('changeY', { DY: 5 })]]), make('setX', { X: 99 })]]));
    const t = simulate(p, { frames: 5 });
    expect([1, 2, 3].map((f) => at(t, f, 'a').y)).toEqual([5, 10, 15]);
    expect(at(t, 3, 'a').x).toBe(0);
    expect(at(t, 4, 'a').x).toBe(99);
  });
  it('waits in seconds (30 frames a second)', () => {
    const p = project(sprite('a', 'obstacle', [[make('flag'), make('wait', { SECS: 1 }), make('setX', { X: 50 })]]));
    const t = simulate(p, { frames: 40 });
    expect(at(t, 29, 'a').x).toBe(0);
    expect(at(t, 31, 'a').x).toBe(50);
  });
  it('runs every script of every sprite as its own thread, in turns', () => {
    const p = project(
      sprite('a', 'obstacle', [[make('flag'), make('forever', {}, [[make('changeX', { DX: 1 })]])], [make('flag'), make('forever', {}, [[make('changeY', { DY: 2 })]])]]),
      sprite('b', 'seed', [[make('flag'), make('forever', {}, [[make('changeX', { DX: -3 })]])]]),
    );
    const t = simulate(p, { frames: 10 });
    expect(at(t, 10, 'a')).toMatchObject({ x: 10, y: 20 });
    expect(at(t, 10, 'b').x).toBe(-30);
  });
  it('moves along its direction with "mover n pasos" (-90 is left)', () => {
    const p = project(sprite('a', 'obstacle', [[make('flag'), make('move', { N: 10 })]], { dir: -90 }));
    expect(at(simulate(p, { frames: 1 }), 1, 'a')).toMatchObject({ x: -10, y: 0 });
  });
  it('a runaway loop never freezes a frame: every pass yields, and a frame is capped', () => {
    const big = make('repeat', { N: 100_000 }, [[make('changeVar', { VAR: 'puntos', V: 1 })]]);
    const vm = new VM(project(sprite('a', 'obstacle', [[make('flag'), big]])));
    vm.start();
    vm.step();
    expect(vm.vars.puntos).toBe(1);
    // a long straight script is cut at MAX_OPS blocks per frame
    const long = Array.from({ length: MAX_OPS + 50 }, () => make('changeVar', { VAR: 'vidas', V: 1 }));
    const vm2 = new VM(project(sprite('a', 'obstacle', [[make('flag'), ...long]])));
    vm2.start();
    vm2.step();
    expect(vm2.vars.vidas).toBeLessThan(3 + MAX_OPS + 50);
    vm2.step();
    expect(vm2.vars.vidas).toBe(3 + MAX_OPS + 50);
  });
  it('is deterministic: the same project and seed give the same run (random included)', () => {
    const p = project(sprite('a', 'obstacle', [[make('flag'), make('forever', {}, [[make('setX', { X: make('random', { A: -100, B: 100 }) })]])]]));
    const a = simulate(p, { frames: 20, seed: 3 }).snaps.map((s) => s.sprites[0].x);
    const b = simulate(p, { frames: 20, seed: 3 }).snaps.map((s) => s.sprites[0].x);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBeGreaterThan(5);
    expect(a.every((x) => Number.isInteger(x) && x >= -100 && x <= 100)).toBe(true);
  });
});

describe('events', () => {
  it('starts key scripts on a key press (an edge), and restarts one that is running', () => {
    const p = project(sprite('a', 'player', [[make('key', { KEY: 'espacio' }), make('changeY', { DY: 10 }), make('wait', { SECS: 1 }), make('changeY', { DY: 1 })]]));
    const vm = new VM(p);
    vm.start();
    vm.keyDown(' ');
    vm.step();
    expect(vm.sprites[0].y).toBe(10);
    vm.step(); vm.step();
    vm.keyDown(' '); // still held: no new press
    vm.step();
    expect(vm.sprites[0].y).toBe(10);
    vm.keyUp(' ');
    vm.keyDown('espacio');
    vm.step();
    expect(vm.sprites[0].y).toBe(20);
  });
  it('broadcasts reach "al recibir" scripts in the same frame', () => {
    const p = project(
      sprite('a', 'obstacle', [[make('flag'), make('broadcast', { MSG: 'choque' })]]),
      sprite('b', 'seed', [[make('receive', { MSG: 'choque' }), make('setX', { X: 77 })], [make('receive', { MSG: 'punto' }), make('setX', { X: -1 })]]),
    );
    const t = simulate(p, { frames: 3 });
    expect(at(t, 1, 'b').x).toBe(77);
  });
  it('"¿tecla presionada?" reads the key held now', () => {
    const p = project(sprite('a', 'player', [[make('flag'), make('forever', {}, [[make('if', { COND: make('keyPressed', { KEY: 'flecha arriba' }) }, [[make('changeY', { DY: 1 })]])]])]]));
    const t = simulate(p, { frames: 6, keys: { 3: ['ArrowUp'], 4: ['ArrowUp'] } });
    expect(at(t, 6, 'a').y).toBe(2);
  });
});

describe('values and conditions', () => {
  it('evaluates reporters, operators, if and if/else', () => {
    const flip = [make('key', { KEY: 'espacio' }), make('ifElse', { COND: make('lt', { A: make('ypos'), B: 0 }) }, [[make('setY', { Y: 100 })], [make('setY', { Y: -100 })]])];
    const p = project(sprite('a', 'player', [flip], { y: -100 }));
    const t = simulate(p, { frames: 6, keys: { 2: [' '], 4: [' '] } });
    expect(at(t, 2, 'a').y).toBe(100);
    expect(at(t, 4, 'a').y).toBe(-100);
  });
  it('sets and changes global variables; a reporter in a number slot', () => {
    const p = project(sprite('a', 'obstacle', [[make('flag'), make('setVar', { VAR: 'velocidad', V: 4 }), make('changeVar', { VAR: 'velocidad', V: 2 }), make('changeX', { DX: make('sub', { A: 0, B: make('var', { VAR: 'velocidad' }) }) })]]));
    const t = simulate(p, { frames: 1 });
    expect(t.snaps[1].vars.velocidad).toBe(6);
    expect(at(t, 1, 'a').x).toBe(-6);
  });
  it('compares numbers as numbers (10 > 9) and text as text', () => {
    const p = project(sprite('a', 'obstacle', [[make('flag'),
      make('if', { COND: make('gt', { A: '10', B: '9' }) }, [[make('changeVar', { VAR: 'puntos', V: 1 })]]),
      make('if', { COND: make('eq', { A: 'Hola', B: 'hola' }) }, [[make('changeVar', { VAR: 'puntos', V: 10 })]]),
      make('if', { COND: make('and', { A: make('lt', { A: 1, B: 2 }), B: make('gt', { A: 1, B: 2 }) }) }, [[make('changeVar', { VAR: 'puntos', V: 100 })]]),
    ]]));
    expect(simulate(p, { frames: 1 }).snaps[1].vars.puntos).toBe(11);
  });
  it('touching: boxes overlap, both visible; never a hidden sprite; the edge', () => {
    const p = project(
      sprite('pl', 'player', [], { x: 0, y: 0 }),
      sprite('o', 'obstacle', [], { x: 30, y: 0 }),
      sprite('far', 'obstacle', [], { x: 200, y: 0 }),
      sprite('h', 'seed', [], { x: 0, y: 0, visible: false }),
      sprite('e', 'bird', [], { x: 235, y: 0 }),
    );
    const vm = new VM(p);
    const pl = vm.sprite('pl')!;
    expect(vm.touching(pl, 'o')).toBe(true);
    expect(vm.touching(pl, 'far')).toBe(false);
    expect(vm.touching(pl, 'h')).toBe(false);
    expect(vm.touching(vm.sprite('e')!, 'borde')).toBe(true);
    expect(vm.touching(pl, 'borde')).toBe(false);
    pl.visible = false;
    expect(vm.touching(pl, 'o')).toBe(false);
  });
});

describe('looks, sound and the end', () => {
  it('shows, hides, says, changes costume and counts sounds', () => {
    const p = project(sprite('a', 'player', [[make('flag'), make('hide'), make('costume', { C: 'mareado' }), make('sayFor', { MSG: '¡Ay!', SECS: 0.1 }), make('show'), make('sound', { S: 'choque' })]]));
    const vm = new VM(p);
    vm.start();
    vm.step();
    expect(vm.sprites[0]).toMatchObject({ visible: false, costume: 'mareado', say: '¡Ay!' });
    for (let i = 0; i < 4; i++) vm.step();
    expect(vm.sprites[0]).toMatchObject({ visible: true, say: null });
    expect(vm.stats).toMatchObject({ sounds: 1, says: 1, costumes: 1 });
    expect(vm.sounds[0].name).toBe('choque');
  });
  it('ganar, perder and detener todo end the game and every thread', () => {
    const win = project(sprite('a', 'stage', [[make('flag'), make('forever', {}, [[make('if', { COND: make('gt', { A: make('var', { VAR: 'puntos' }), B: 19 }) }, [[make('win')]])]])]]));
    const t = simulate(win, { frames: 30, pokes: { 10: { puntos: 20 } } });
    expect(t.end).toBe('won');
    expect(t.endFrame).toBe(10);
    const lose = project(sprite('a', 'stage', [[make('flag'), make('lose')]]));
    expect(simulate(lose, { frames: 5 }).end).toBe('lost');
    const stop = project(sprite('a', 'stage', [[make('flag'), make('wait', { SECS: 0.2 }), make('stop')]]), sprite('b', 'obstacle', [[make('flag'), make('forever', {}, [[make('changeX', { DX: 1 })]])]]));
    const ts = simulate(stop, { frames: 30 });
    expect(ts.end).toBe('stopped');
    expect(ts.snaps[ts.snaps.length - 1].sprites[1].x).toBeLessThan(10);
  });
  it('starts each run from the project\'s own start (positions and variables)', () => {
    const p = project(sprite('a', 'obstacle', [[make('flag'), make('changeX', { DX: 5 }), make('changeVar', { VAR: 'puntos', V: 1 })]], { x: 100 }));
    expect(at(simulate(p, { frames: 1 }), 1, 'a').x).toBe(105);
    expect(at(simulate(p, { frames: 1 }), 1, 'a').x).toBe(105);
    expect(simulate(p, { frames: 1 }).snaps[1].vars.puntos).toBe(1);
  });
  it('ignores loose blocks and scripts without a hat', () => {
    const p = project(sprite('a', 'obstacle', [[make('changeX', { DX: 5 })], [make('xpos')]]));
    expect(at(simulate(p, { frames: 3 }), 3, 'a').x).toBe(0);
  });
});
