import { describe, expect, it } from 'vitest';
import { levelById } from './levels';
import {
  GM_COLS, GM_ROWS, READY, SPRITE_DEFS, START_LIVES, addAction, addObject, addRule, allows, broadcasts, chaser, changeChip,
  cloneGame, compact, cycleChip, endings, gmInit, gmPlay, gmStep, keysOf, paletteFor, removeBlock, scratchOf,
  type EditDone, type EditResult, type GmEvent, type GmGame, type GmState,
} from './gameMaker';
import { rtPlay, type RtState } from './rules';
import type { Dir } from './model';

const game = (...objs: GmGame): GmGame => objs;
const ok = (r: EditResult): EditDone => {
  if ('refused' in r) throw new Error(`refused: ${r.refused}`);
  return r;
};

describe('the ready game', () => {
  it('starts with three objects on the board, 0 points and three lives', () => {
    const s = gmInit(READY);
    expect(Object.keys(s.sprites).sort()).toEqual(['me', 'seed', 'stone']);
    expect(s.sprites.me).toMatchObject(SPRITE_DEFS.me.start);
    expect(s.score).toBe(0);
    expect(s.lives).toBe(START_LIVES);
  });

  it('"siempre" makes the seed fall one row at its pace; the ground sends it back to the top', () => {
    const g = game({ id: 'seed', rules: READY[1].rules });
    let s = gmInit(g);
    const rows: number[] = [];
    for (let i = 0; i < SPRITE_DEFS.seed.pace * 7; i++) {
      s = gmStep(g, s).state;
      if (s.tick % SPRITE_DEFS.seed.pace === 0) rows.push(s.sprites.seed!.r);
    }
    // 1 … 5, then off the bottom: the ground rule puts it on row 0, then it falls again
    expect(rows).toEqual([1, 2, 3, 4, 5, 0, 1]);
  });

  it('the arrows move the character, clamped at the edges (an edge is a bump)', () => {
    const r = gmPlay(READY, 6, (s) => (s.tick < 5 ? ['left'] : []));
    expect(r.state.sprites.me!.c).toBe(0);
    expect(r.events.some((e) => e.t === 'bump' && e.obj === 'me' && e.edge === 'edge')).toBe(true);
  });

  it('a key no rule listens to is a shrug', () => {
    const { events } = gmStep(READY, gmInit(READY), ['up']);
    expect(events).toContainEqual({ t: 'shrug', key: 'up' });
  });

  it('catching seeds scores and wins at 5 points; the game stops there', () => {
    const r = gmPlay(READY, 4000, (s) => { const d = chaser(s); return d ? [d] : []; });
    expect(r.state.over).toBe('win');
    expect(r.state.score).toBe(5);
    expect(r.events.filter((e) => e.t === 'end')).toEqual([{ t: 'end', result: 'win' }]);
    // nothing moves once it is over
    expect(gmStep(READY, r.state, ['left']).events).toEqual([]);
  });

  it('a stone that touches the character takes a life and the character says ¡Ay!; three stones lose the game', () => {
    // a still player under the stone's column
    const g = cloneGame(READY);
    g[1].rules = [];
    let s: GmState = gmInit(g);
    s.sprites.me!.c = SPRITE_DEFS.stone.start.c;
    const events: GmEvent[] = [];
    for (let i = 0; i < 3000 && !s.over; i++) {
      // keep the character under the stone
      const st = s.sprites.stone!;
      const me = s.sprites.me!;
      const keys: Dir[] = st.c > me.c ? ['right'] : st.c < me.c ? ['left'] : [];
      const r = gmStep(g, s, keys);
      s = r.state;
      events.push(...r.events);
    }
    expect(s.over).toBe('lose');
    expect(s.lives).toBe(0);
    expect(events.filter((e) => e.t === 'lives').map((e) => (e as { lives: number }).lives)).toEqual([2, 1, 0]);
    expect(events.filter((e) => e.t === 'say')).toHaveLength(3);
  });

  it('the same rules, keys and seed give the same game', () => {
    const play = () => gmPlay(READY, 600, (s) => { const d = chaser(s); return d ? [d] : []; }, 42);
    expect(play()).toEqual(play());
    expect(gmPlay(READY, 600, () => [], 1).state.sprites).not.toEqual(gmPlay(READY, 600, () => [], 99).state.sprites);
  });
});

describe('rules of the new triggers and actions', () => {
  it('"al empezar" runs once, on the first tick', () => {
    const g = game({ id: 'me', rules: [{ hat: 'start', actions: ['say:bien'] }] });
    const r = gmPlay(g, 30);
    expect(r.events.filter((e) => e.t === 'say')).toHaveLength(1);
    expect(r.events[0]).toEqual({ t: 'fire', obj: 'me', rule: 0 });
  });

  it('a "decir" bubble lasts a moment', () => {
    const g = game({ id: 'me', rules: [{ hat: 'start', actions: ['say:mia'] }] });
    expect(gmPlay(g, 5).state.sprites.me!.say).toBe('mia');
    expect(gmPlay(g, 40).state.sprites.me!.say).toBeNull();
  });

  it('"mover adelante" and "dar la vuelta" make the bird fly back and forth (touching the edge)', () => {
    const g = game({ id: 'bird', rules: [{ hat: 'tick', actions: ['move:ahead'] }, { hat: 'touch:edge', actions: ['turn'] }] });
    let s = gmInit(g);
    const cols: number[] = [];
    for (let i = 0; i < SPRITE_DEFS.bird.pace * 16; i++) {
      s = gmStep(g, s).state;
      if (s.tick % SPRITE_DEFS.bird.pace === 0) cols.push(s.sprites.bird!.c);
    }
    // 1..6, the edge (turn, stays), 5..0, the edge, 1..
    expect(cols).toEqual([1, 2, 3, 4, 5, 6, 6, 5, 4, 3, 2, 1, 0, 0, 1, 2]);
  });

  it('a hidden object touches nothing; "mostrar" brings it back', () => {
    const g = game(
      { id: 'me', rules: [{ hat: 'start', actions: ['vis:hide'] }, { hat: 'key:up', actions: ['vis:show'] }] },
      { id: 'seed', rules: [{ hat: 'touch:me', actions: ['score:1'] }] },
    );
    let s = gmInit(g);
    s.sprites.seed!.c = s.sprites.me!.c; s.sprites.seed!.r = s.sprites.me!.r;
    s = gmStep(g, s).state;
    expect(s.sprites.me!.visible).toBe(false);
    expect(s.score).toBe(0);
    const r = gmStep(g, s, ['up']);
    expect(r.state.sprites.me!.visible).toBe(true);
    expect(r.state.score).toBe(1);
  });

  it('a touch fires once when it begins, on both objects, not every tick', () => {
    const g = game(
      { id: 'me', rules: [{ hat: 'touch:stone', actions: ['say:ay'] }] },
      { id: 'stone', rules: [{ hat: 'touch:me', actions: ['score:1'] }] },
    );
    let s = gmInit(g);
    s.sprites.stone!.c = s.sprites.me!.c; s.sprites.stone!.r = s.sprites.me!.r;
    const events: GmEvent[] = [];
    for (let i = 0; i < 10; i++) { const r = gmStep(g, s); s = r.state; events.push(...r.events); }
    expect(events.filter((e) => e.t === 'touch')).toHaveLength(1);
    expect(s.score).toBe(1);
    expect(events.filter((e) => e.t === 'say')).toHaveLength(1);
  });

  it('points and lives stay in their range', () => {
    const g = game({ id: 'me', rules: [{ hat: 'key:left', actions: ['score:-1', 'lives:1'] }] });
    let s = gmInit(g);
    for (let i = 0; i < 12; i++) s = gmStep(g, s, ['left']).state;
    expect(s.score).toBe(0);
    expect(s.lives).toBe(9);
  });

  it('a seed worth 2: the change of one rule doubles the points', () => {
    const g = ok(changeChip(READY, 'seed', 1, 0)).game;
    expect(g[1].rules[1].actions[0]).toBe('score:2');
    const r = gmPlay(g, 4000, (s) => { const d = chaser(s); return d ? [d] : []; });
    expect(r.state.over).toBe('win');
    // three seeds reach 6 ≥ 5
    expect(r.state.score).toBe(6);
  });
});

describe('avisar (broadcast)', () => {
  const g = game(
    { id: 'me', rules: [{ hat: 'key:up', actions: ['send:yum'] }] },
    { id: 'seed', rules: [{ hat: 'recv:yum', actions: ['say:mia'] }] },
    { id: 'bird', rules: [{ hat: 'recv:yum', actions: ['say:pio'] }, { hat: 'recv:ouch', actions: ['turn'] }] },
  );

  it('one object sends, every object listening to that message runs its rule, on the next tick', () => {
    let s = gmInit(g);
    s = gmStep(g, s).state;
    const sent = gmStep(g, s, ['up']);
    expect(sent.events).toContainEqual({ t: 'send', obj: 'me', msg: 'yum' });
    expect(sent.events.some((e) => e.t === 'say')).toBe(false);
    expect(sent.state.inbox).toEqual(['yum']);
    const heard = gmStep(g, sent.state);
    expect(heard.events.filter((e) => e.t === 'recv').map((e) => (e as { obj: string }).obj)).toEqual(['seed', 'bird']);
    expect(heard.state.sprites.seed!.say).toBe('mia');
    expect(heard.state.sprites.bird!.say).toBe('pio');
    expect(heard.state.sprites.bird!.dir).toBe('right');
    expect(heard.state.heard).toBe(1);
    expect(heard.state.inbox).toEqual([]);
  });

  it('a message nobody listens to is sent and not heard', () => {
    const h = game({ id: 'me', rules: [{ hat: 'key:up', actions: ['send:party'] }] });
    const r = gmPlay(h, 4, (s) => (s.tick === 1 ? ['up'] : []));
    expect(r.state.heard).toBe(0);
    expect(r.events.filter((e) => e.t === 'recv')).toEqual([]);
  });

  it('two objects answering each other never loop inside one tick', () => {
    const ping = game(
      { id: 'me', rules: [{ hat: 'start', actions: ['send:yum'] }, { hat: 'recv:ouch', actions: ['send:yum', 'score:1'] }] },
      { id: 'seed', rules: [{ hat: 'recv:yum', actions: ['send:ouch'] }] },
    );
    const r = gmPlay(ping, 11);
    // one exchange every two ticks
    expect(r.state.score).toBe(5);
  });

  it('broadcasts() names the messages some object sends and some object hears', () => {
    expect(broadcasts(g)).toEqual(['yum']);
    expect(broadcasts(READY)).toEqual([]);
  });
});

describe('win and lose', () => {
  it('"si los puntos llegan a N" wins once the score reaches N', () => {
    const g = game(
      { id: 'me', rules: [{ hat: 'key:right', actions: ['score:2'] }] },
      { id: 'game', rules: [{ hat: 'points:3', actions: ['win'] }] },
    );
    const r = gmPlay(g, 10, () => ['right']);
    expect(r.state.over).toBe('win');
    expect(r.state.score).toBe(4);
    expect(r.state.tick).toBe(2);
  });

  it('"si las vidas llegan a 0" loses; without it the game goes on at 0 lives', () => {
    const lose = game({ id: 'me', rules: [{ hat: 'key:right', actions: ['lives:-1'] }] }, { id: 'game', rules: [{ hat: 'lives0', actions: ['lose'] }] });
    expect(gmPlay(lose, 10, () => ['right']).state.over).toBe('lose');
    const on = game({ id: 'me', rules: [{ hat: 'key:right', actions: ['lives:-1'] }] });
    const r = gmPlay(on, 10, () => ['right']);
    expect(r.state.over).toBeNull();
    expect(r.state.lives).toBe(0);
  });

  it('a game hat can do other things than end the game (a message, points)', () => {
    const g = game(
      { id: 'me', rules: [{ hat: 'key:right', actions: ['score:1'] }, { hat: 'recv:party', actions: ['say:bien'] }] },
      { id: 'game', rules: [{ hat: 'points:3', actions: ['send:party'] }, { hat: 'points:5', actions: ['win'] }] },
    );
    const r = gmPlay(g, 20, () => ['right']);
    expect(r.state.over).toBe('win');
    expect(r.events.filter((e) => e.t === 'say')).toHaveLength(1);
  });

  it('endings() reads the win points and the lose rule', () => {
    expect(endings(READY)).toEqual({ win_points: 5, lose_lives: true });
    expect(endings([{ id: 'game', rules: [] }])).toEqual({ win_points: null, lose_lives: false });
  });
});

describe('editing a game', () => {
  it('adds a card; never two cards with the same hat', () => {
    const r = ok(addRule(READY, 'me', 'key:up'));
    expect(r.game[0].rules.map((x) => x.hat)).toEqual(['key:left', 'key:right', 'touch:stone', 'key:up']);
    expect(r.edit).toEqual({ op: 'add', object: 'me', hat: 'key:up', action: null });
    expect(r.rule).toBe(3);
    expect(addRule(READY, 'me', 'key:left')).toEqual({ refused: 'dup', rule: 0 });
    // READY is untouched
    expect(READY[0].rules).toHaveLength(3);
  });

  it('refuses blocks that do not belong to the object', () => {
    expect(addRule(READY, 'game', 'key:up')).toEqual({ refused: 'not-here' });
    expect(addRule(READY, 'me', 'points:5')).toEqual({ refused: 'not-here' });
    expect(addAction(READY, 'game', 0, 'move:down')).toEqual({ refused: 'not-here', rule: 0 });
    expect(addAction(READY, 'me', 0, 'win')).toEqual({ refused: 'not-here', rule: 0 });
    expect(allows('game', 'send:party')).toBe(true);
    for (const obj of ['me', 'seed', 'stone', 'bird', 'game'] as const) {
      const p = paletteFor(obj);
      expect([...p.hats, ...p.actions].every((b) => allows(obj, b))).toBe(true);
    }
  });

  it('adds and removes actions and cards, with the edit to log', () => {
    let r = ok(addAction(READY, 'seed', 1, 'send:yum'));
    expect(r.game[1].rules[1].actions).toEqual(['score:1', 'top', 'send:yum']);
    expect(r.edit).toEqual({ op: 'add', object: 'seed', hat: 'touch:me', action: 'send:yum' });
    r = ok(removeBlock(r.game, 'seed', 1, 0));
    expect(r.game[1].rules[1].actions).toEqual(['top', 'send:yum']);
    expect(r.edit).toEqual({ op: 'remove', object: 'seed', hat: 'touch:me', action: 'score:1' });
    r = ok(removeBlock(r.game, 'seed', 2, null));
    expect(r.game[1].rules.map((x) => x.hat)).toEqual(['tick', 'touch:me']);
    expect(r.edit).toEqual({ op: 'remove', object: 'seed', hat: 'touch:ground', action: null });
  });

  it('a full card refuses one more action', () => {
    let g = READY;
    for (let i = 0; i < 3; i++) g = ok(addAction(g, 'me', 0, 'say:mia')).game;
    expect(addAction(g, 'me', 0, 'say:mia')).toEqual({ refused: 'full', rule: 0 });
  });

  it('a chip cycles its values; a sprite never touches itself; the bird only once it is in the game', () => {
    expect(cycleChip('score:1', 'seed')).toBe('score:2');
    expect(cycleChip('score:-1', 'seed')).toBe('score:1');
    expect(cycleChip('touch:stone', 'seed', ['me', 'seed', 'stone', 'game'])).toBe('touch:ground');
    expect(cycleChip('touch:edge', 'me')).toBe('touch:seed');
    expect(cycleChip('touch:ground', 'me')).toBe('touch:edge');
    expect(cycleChip('turn', 'me')).toBe('turn');
    const r = ok(changeChip(READY, 'game', 0, null));
    expect(r.game[3].rules[0].hat).toBe('points:10');
    expect(r.edit).toEqual({ op: 'change', object: 'game', hat: 'points:10', action: null, from: 'points:5', to: 'points:10' });
  });

  it('a hat chip skips a value another card of the object already has', () => {
    // me has key:left and key:right: key:left's chip goes right → up
    const r = ok(changeChip(READY, 'me', 0, null));
    expect(r.game[0].rules[0].hat).toBe('key:up');
  });

  it('adds the bird before the game object, once', () => {
    const r = ok(addObject(READY, 'bird'));
    expect(r.game.map((o) => o.id)).toEqual(['me', 'seed', 'stone', 'bird', 'game']);
    expect(addObject(r.game, 'bird')).toEqual({ refused: 'dup' });
    expect(gmInit(r.game).sprites.bird).toMatchObject({ c: 0, r: 1, dir: 'right' });
  });

  it('compact() writes the whole game on one line', () => {
    expect(compact(READY)).toBe('me[key:left>move:left;key:right>move:right;touch:stone>say:ay] seed[tick>move:down;touch:me>score:1,top;touch:ground>top] stone[tick>move:down;touch:me>lives:-1,top;touch:ground>top] game[points:5>win;lives0>lose]');
    expect(keysOf(READY)).toEqual(['right', 'left']);
  });
});

describe('La Traductora', () => {
  const words = (bs: ReturnType<typeof scratchOf>): string => bs.map((b) => [...b.parts.map((p) => (typeof p === 'string' ? p : `(${p.in})`)), b.body ? `{${words(b.body)}}` : ''].join(' ').trim()).join(' / ');

  it('a key rule is an event hat with its motion block', () => {
    expect(words(scratchOf({ hat: 'key:right', actions: ['move:right'] }))).toBe('al presionar tecla (flecha derecha) / cambiar x en (40)');
    expect(scratchOf({ hat: 'key:right', actions: [] })[0]).toMatchObject({ cat: 'events', shape: 'hat' });
  });

  it('a touch rule is "por siempre / si ¿tocando …? entonces", named after the character', () => {
    expect(words(scratchOf({ hat: 'touch:me', actions: ['score:1', 'top'] }, 'Mina')))
      .toBe('al hacer clic en () / por siempre {si (¿tocando Mina?) entonces {sumar (1) a (puntos) / ir a x: (al azar) y: (160)}}');
  });

  it('"siempre" waits a little inside "por siempre"; avisar and recibir are Scratch\'s broadcast', () => {
    expect(words(scratchOf({ hat: 'tick', actions: ['move:down'] }))).toBe('al hacer clic en () / por siempre {cambiar y en (-40) / esperar (0.5) segundos}');
    expect(words(scratchOf({ hat: 'recv:yum', actions: ['say:pio'] }))).toBe('al recibir (¡ñam!) / decir (¡Pío!) por (2) segundos');
    expect(words(scratchOf({ hat: 'start', actions: ['send:yum', 'vis:hide'] }))).toBe('al hacer clic en () / enviar (¡ñam!) / esconder');
  });

  it('win and lose say it and stop everything', () => {
    const w = scratchOf({ hat: 'points:5', actions: ['win'] });
    expect(words(w)).toBe('al hacer clic en () / por siempre {si (puntos = 5) entonces {decir (¡Ganaste!) / detener (todos)}}');
    expect(w[1].body![0].body![1].shape).toBe('cap');
  });

  it('every palette block has a translation', () => {
    for (const obj of ['me', 'game'] as const) {
      const p = paletteFor(obj);
      for (const h of p.hats) expect(scratchOf({ hat: h, actions: [] }).length).toBeGreaterThan(0);
      for (const a of p.actions) expect(scratchOf({ hat: 'start', actions: [a] }).length).toBeGreaterThan(1);
    }
  });
});

describe("3ro's rule game is unchanged", () => {
  it('its two pages still win with their reference rules', () => {
    const one = levelById('3ro-1')!;
    const b = one.worlds[0];
    const presses: Dir[] = ['up', 'up', 'right', 'right', 'right', 'down', 'right', 'right', 'up', 'up'];
    let i = 0;
    const r1 = rtPlay(b, one.realtime!, one.realtime!.solution, 400, (s: RtState) => (s.busy === 0 && !s.queue.length && i < presses.length ? [presses[i++]] : []));
    expect(r1.state.won).toBe(true);
    const two = levelById('3ro-2')!;
    const r2 = rtPlay(two.worlds[0], two.realtime!, two.realtime!.solution, 6000, (s: RtState) => {
      const f = s.seeds.filter((x) => !x.touched).sort((a, c) => c.y - a.y)[0];
      return f && s.busy === 0 && f.c !== s.robot.c ? [f.c > s.robot.c ? 'right' : 'left'] : [];
    });
    expect(r2.state.won).toBe(true);
  });

  it('the board is 7 × 6', () => {
    expect([GM_COLS, GM_ROWS]).toEqual([7, 6]);
  });
});
