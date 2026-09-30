// 4to's game maker ("Hacé tu juego", the pilot playtest's probe): 3ro's idea
// that a game is a set of rules that keep applying, grown into a tiny game
// maker. Several objects share one board (the child's character, a seed, a
// stone, and a bird the child may add), each with its own rule cards; a
// "juego" object holds the rules of the whole game (win and lose). New
// triggers: "al empezar", "siempre" (every little while), "cuando toco a …"
// (another object, the ground, the edge), "cuando recibo <mensaje>", "si los
// puntos llegan a N", "si las vidas llegan a 0". New actions: move (one cell,
// or ahead), turn around, back to the top, points ±, lives ±, say, show or
// hide, "avisar <mensaje>" (Scratch's broadcast: one object sends, every
// object listening for that message runs its rule), win, lose.
//
// A sibling of rules.ts, not a change to it: 3ro's pages keep their engine
// byte for byte (their tests are untouched). It borrows the seeded random
// generator and the tick of rules.ts. Pure like it: no DOM, no timers, no
// Math.random; the same rules, keys and seed always give the same game.
//
// Blocks are strings "kind:param" ("key:left", "score:2", "send:yum"); the
// param is the block's dropdown (a chip the child taps to cycle it, like
// Scratch's menus). The editing operations and the equivalent Scratch
// script of every rule (La Traductora) live here too, as data.

import { DIRS, type Cell, type Dir } from './model';
import { nextRandom } from './rules';

export { TICK_MS } from './rules';

export const GM_COLS = 7;
export const GM_ROWS = 5;

export const SPRITES = ['me', 'seed', 'stone', 'bird'] as const;
export type SpriteId = typeof SPRITES[number];
export type ObjId = SpriteId | 'game';
export const OBJECTS: readonly ObjId[] = [...SPRITES, 'game'];

export type MsgId = 'yum' | 'ouch' | 'party';
export type SayId = 'mia' | 'ay' | 'pio' | 'bien';

export interface GmRule { hat: string; actions: string[] }
export interface GmObject { id: ObjId; rules: GmRule[] }
/** A game: its objects in board order (the bird only once added), the "juego" object last. */
export type GmGame = GmObject[];

/** Where each sprite starts, which way it faces ("mover adelante"), and how often its "siempre" fires (ticks). */
export interface SpriteDef { start: Cell; dir: Dir; pace: number }
export const SPRITE_DEFS: Record<SpriteId, SpriteDef> = {
  me: { start: { c: 3, r: 4 }, dir: 'right', pace: 4 },
  seed: { start: { c: 1, r: 0 }, dir: 'down', pace: 5 },
  stone: { start: { c: 5, r: 0 }, dir: 'down', pace: 6 },
  bird: { start: { c: 0, r: 1 }, dir: 'right', pace: 4 },
};

export const START_LIVES = 3;
export const MAX_LIVES = 9;
/** Ticks a "decir" bubble stays. */
export const SAY_TICKS = 14;
/** Rule cards per object and actions per card: a small notebook. */
export const MAX_RULES = 5;
export const MAX_ACTIONS = 4;
/** Rules started by other rules in the same moment (touching the ground while moving…): never a loop. */
const MAX_DEPTH = 3;

// ------------------------------------------------------------------ blocks

export type HatKind = 'start' | 'key' | 'tick' | 'touch' | 'recv' | 'points' | 'lives0';
export type ActionKind = 'move' | 'turn' | 'top' | 'score' | 'lives' | 'say' | 'send' | 'vis' | 'win' | 'lose';
export type BlockKind = HatKind | ActionKind;

const HAT_KINDS: readonly string[] = ['start', 'key', 'tick', 'touch', 'recv', 'points', 'lives0'];
const ACTION_KINDS: readonly string[] = ['move', 'turn', 'top', 'score', 'lives', 'say', 'send', 'vis', 'win', 'lose'];

export const kindOf = (id: string): string => id.split(':')[0];
export const paramOf = (id: string): string => id.slice(kindOf(id).length + 1);
export const isGmHat = (id: string) => HAT_KINDS.includes(kindOf(id));
export const isGmAction = (id: string) => ACTION_KINDS.includes(kindOf(id));

/** The values of a block's chip (its dropdown), in the order a tap cycles them. */
export const CHIPS: Partial<Record<BlockKind, readonly string[]>> = {
  key: ['right', 'left', 'up', 'down'],
  touch: ['me', 'seed', 'stone', 'bird', 'ground', 'edge'],
  recv: ['yum', 'ouch', 'party'],
  send: ['yum', 'ouch', 'party'],
  points: ['3', '5', '10', '15'],
  move: ['right', 'left', 'down', 'up', 'ahead'],
  score: ['1', '2', '3', '-1'],
  lives: ['-1', '1'],
  say: ['mia', 'ay', 'pio', 'bien'],
  vis: ['hide', 'show'],
};

export const hasChip = (id: string) => !!CHIPS[kindOf(id) as BlockKind];

/** The block with its chip's next value (a sprite never touches itself; the bird is skipped until it is in the game). */
export function cycleChip(id: string, obj: ObjId, present: readonly ObjId[] = OBJECTS): string {
  const kind = kindOf(id) as BlockKind;
  const values = CHIPS[kind];
  if (!values) return id;
  const ok = (v: string) => kind !== 'touch' || (v !== obj && (!(SPRITES as readonly string[]).includes(v) || present.includes(v as ObjId)));
  const i = values.indexOf(paramOf(id));
  for (let k = 1; k <= values.length; k++) {
    const v = values[(i + k) % values.length];
    if (ok(v)) return `${kind}:${v}`;
  }
  return id;
}

/** The blocks of the palette for an object's cards: a sprite's, or the whole game's. */
export function paletteFor(obj: ObjId): { hats: string[]; actions: string[] } {
  if (obj === 'game') return { hats: ['start', 'points:5', 'lives0', 'recv:party'], actions: ['win', 'lose', 'lives:1', 'score:1', 'send:party'] };
  return {
    hats: ['start', 'key:right', 'tick', obj === 'me' ? 'touch:seed' : 'touch:me', 'recv:yum'],
    actions: ['move:right', 'turn', 'top', 'score:1', 'lives:-1', 'say:mia', 'send:yum', 'vis:hide'],
  };
}

/** Can this block go on this object's cards? (The game has no place on the board: it does not move, say or hide.) */
export function allows(obj: ObjId, block: string): boolean {
  const k = kindOf(block);
  if (obj === 'game') return ['start', 'points', 'lives0', 'recv', 'win', 'lose', 'lives', 'score', 'send'].includes(k);
  return !['points', 'lives0', 'win', 'lose'].includes(k);
}

// ------------------------------------------------------------------ the ready game

/** Phase 1's ready-made game: catch the falling seeds with the arrows; a stone takes a life. */
export const READY: GmGame = [
  { id: 'me', rules: [
    { hat: 'key:left', actions: ['move:left'] },
    { hat: 'key:right', actions: ['move:right'] },
    { hat: 'touch:stone', actions: ['say:ay'] },
  ] },
  { id: 'seed', rules: [
    { hat: 'tick', actions: ['move:down'] },
    { hat: 'touch:me', actions: ['score:1', 'top'] },
    { hat: 'touch:ground', actions: ['top'] },
  ] },
  { id: 'stone', rules: [
    { hat: 'tick', actions: ['move:down'] },
    { hat: 'touch:me', actions: ['lives:-1', 'top'] },
    { hat: 'touch:ground', actions: ['top'] },
  ] },
  { id: 'game', rules: [
    { hat: 'points:5', actions: ['win'] },
    { hat: 'lives0', actions: ['lose'] },
  ] },
];

export const cloneGame = (g: GmGame): GmGame => g.map((o) => ({ id: o.id, rules: o.rules.map((r) => ({ hat: r.hat, actions: [...r.actions] })) }));
export const objectOf = (g: GmGame, id: ObjId) => g.find((o) => o.id === id) ?? null;
export const presentOf = (g: GmGame): ObjId[] => g.map((o) => o.id);

// ------------------------------------------------------------------ editing

export type EditRefusal = 'dup' | 'full' | 'not-here' | 'no-card' | 'no-object';

/** One edit, as the probe logs it (`rule_edit`). */
export interface GmEdit {
  op: 'add' | 'remove' | 'change';
  object: ObjId;
  hat: string;
  /** The action concerned (null for a whole card). */
  action: string | null;
  /** A change: the block before and after. */
  from?: string;
  to?: string;
}

export interface EditDone { game: GmGame; edit: GmEdit; rule: number }
export type EditResult = EditDone | { refused: EditRefusal; rule?: number };

const withObject = (g: GmGame, id: ObjId, fn: (o: GmObject) => void): GmGame => {
  const next = cloneGame(g);
  const o = next.find((x) => x.id === id);
  if (o) fn(o);
  return next;
};

/** A new card with this hat on the object (never two cards with the same hat). */
export function addRule(g: GmGame, obj: ObjId, hat: string): EditResult {
  const o = objectOf(g, obj);
  if (!o) return { refused: 'no-object' };
  if (!isGmHat(hat) || !allows(obj, hat)) return { refused: 'not-here' };
  const dup = o.rules.findIndex((r) => r.hat === hat);
  if (dup >= 0) return { refused: 'dup', rule: dup };
  if (o.rules.length >= MAX_RULES) return { refused: 'full' };
  return { game: withObject(g, obj, (x) => x.rules.push({ hat, actions: [] })), edit: { op: 'add', object: obj, hat, action: null }, rule: o.rules.length };
}

/** An action at the end of (or at `at` in) a card. */
export function addAction(g: GmGame, obj: ObjId, rule: number, action: string, at?: number): EditResult {
  const o = objectOf(g, obj);
  const r = o?.rules[rule];
  if (!o) return { refused: 'no-object' };
  if (!r) return { refused: 'no-card' };
  if (!isGmAction(action) || !allows(obj, action)) return { refused: 'not-here', rule };
  if (r.actions.length >= MAX_ACTIONS) return { refused: 'full', rule };
  const pos = Math.max(0, Math.min(at ?? r.actions.length, r.actions.length));
  return { game: withObject(g, obj, (x) => x.rules[rule].actions.splice(pos, 0, action)), edit: { op: 'add', object: obj, hat: r.hat, action }, rule };
}

/** Takes out a whole card (`action` null) or one action. */
export function removeBlock(g: GmGame, obj: ObjId, rule: number, action: number | null): EditResult {
  const r = objectOf(g, obj)?.rules[rule];
  if (!r) return { refused: 'no-card' };
  if (action == null) return { game: withObject(g, obj, (x) => x.rules.splice(rule, 1)), edit: { op: 'remove', object: obj, hat: r.hat, action: null }, rule };
  const a = r.actions[action];
  if (a == null) return { refused: 'no-card', rule };
  return { game: withObject(g, obj, (x) => x.rules[rule].actions.splice(action, 1)), edit: { op: 'remove', object: obj, hat: r.hat, action: a }, rule };
}

/** Taps a block's chip: its next value (a hat that would repeat another card's is skipped over). */
export function changeChip(g: GmGame, obj: ObjId, rule: number, action: number | null): EditResult {
  const o = objectOf(g, obj);
  const r = o?.rules[rule];
  if (!o || !r) return { refused: 'no-card' };
  const present = presentOf(g);
  if (action == null) {
    let hat = r.hat;
    for (let k = 0; k < 8; k++) {
      hat = cycleChip(hat, obj, present);
      if (hat === r.hat) return { refused: 'dup', rule };
      if (!o.rules.some((x, i) => i !== rule && x.hat === hat)) break;
    }
    if (hat === r.hat) return { refused: 'dup', rule };
    return { game: withObject(g, obj, (x) => { x.rules[rule].hat = hat; }), edit: { op: 'change', object: obj, hat, action: null, from: r.hat, to: hat }, rule };
  }
  const a = r.actions[action];
  if (a == null) return { refused: 'no-card', rule };
  const to = cycleChip(a, obj, present);
  if (to === a) return { refused: 'not-here', rule };
  return { game: withObject(g, obj, (x) => { x.rules[rule].actions[action] = to; }), edit: { op: 'change', object: obj, hat: r.hat, action: to, from: a, to }, rule };
}

/** Puts the bird (or another sprite) in the game, with no rules yet, before the "juego" object. */
export function addObject(g: GmGame, id: SpriteId): EditResult {
  if (objectOf(g, id)) return { refused: 'dup' };
  const next = cloneGame(g);
  const at = next.findIndex((o) => o.id === 'game');
  next.splice(at < 0 ? next.length : at, 0, { id, rules: [] });
  return { game: next, edit: { op: 'add', object: id, hat: '', action: null }, rule: -1 };
}

// ------------------------------------------------------------------ summaries (for the data)

/** The game in one short line: `me[key:left>move:left;…] seed[…] game[points:5>win]`. */
export const compact = (g: GmGame) => g.map((o) => `${o.id}[${o.rules.map((r) => `${r.hat}>${r.actions.join(',')}`).join(';')}]`).join(' ');

/** A message some object sends and some object listens to. */
export function broadcasts(g: GmGame): MsgId[] {
  const sent = new Set<string>(), heard = new Set<string>();
  for (const o of g) for (const r of o.rules) {
    if (kindOf(r.hat) === 'recv') heard.add(paramOf(r.hat));
    for (const a of r.actions) if (kindOf(a) === 'send') sent.add(paramOf(a));
  }
  return [...sent].filter((m) => heard.has(m)) as MsgId[];
}

/** The game's ways to end: the points that win (the lowest "si los puntos llegan a" that wins), and whether losing all lives loses. */
export function endings(g: GmGame): { win_points: number | null; lose_lives: boolean } {
  let win: number | null = null;
  let lose = false;
  for (const o of g) for (const r of o.rules) {
    if (kindOf(r.hat) === 'points' && r.actions.includes('win')) win = Math.min(win ?? Infinity, Number(paramOf(r.hat)));
    if (r.hat === 'lives0' && r.actions.includes('lose')) lose = true;
  }
  return { win_points: win, lose_lives: lose };
}

export const ruleCount = (g: GmGame) => g.reduce((n, o) => n + o.rules.length, 0);

// ------------------------------------------------------------------ the engine

export interface GmSprite { id: SpriteId; c: number; r: number; dir: Dir; visible: boolean; say: SayId | null; sayUntil: number }

export interface GmState {
  tick: number;
  sprites: Partial<Record<SpriteId, GmSprite>>;
  score: number;
  lives: number;
  /** Messages sent this tick: heard at the next one. */
  inbox: MsgId[];
  rand: number;
  over: 'win' | 'lose' | null;
  /** Pairs of sprites on the same cell ("a|b"): a touch fires once, when it begins. */
  touching: string[];
  /** Game hats already fired ("points:5", "lives0"). */
  done: string[];
  /** Messages heard by at least one rule so far. */
  heard: number;
}

export type GmEvent =
  | { t: 'fire'; obj: ObjId; rule: number }
  | { t: 'shrug'; key: Dir }
  | { t: 'move'; obj: SpriteId; c: number; r: number }
  | { t: 'bump'; obj: SpriteId; edge: 'ground' | 'edge' }
  | { t: 'top'; obj: SpriteId; c: number }
  | { t: 'turn'; obj: SpriteId; dir: Dir }
  | { t: 'score'; score: number; delta: number }
  | { t: 'lives'; lives: number; delta: number }
  | { t: 'say'; obj: SpriteId; say: SayId }
  | { t: 'vis'; obj: SpriteId; visible: boolean }
  | { t: 'send'; obj: ObjId; msg: MsgId }
  | { t: 'recv'; obj: ObjId; msg: MsgId }
  | { t: 'touch'; a: SpriteId; b: SpriteId }
  | { t: 'end'; result: 'win' | 'lose' };

const STEP: Record<Dir, Cell> = { up: { c: 0, r: -1 }, down: { c: 0, r: 1 }, left: { c: -1, r: 0 }, right: { c: 1, r: 0 } };
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const isSprite = (id: ObjId): id is SpriteId => id !== 'game';

export function gmInit(g: GmGame, seed = 7): GmState {
  const sprites: GmState['sprites'] = {};
  for (const o of g) {
    if (!isSprite(o.id)) continue;
    const d = SPRITE_DEFS[o.id];
    sprites[o.id] = { id: o.id, c: d.start.c, r: d.start.r, dir: d.dir, visible: true, say: null, sayUntil: 0 };
  }
  return { tick: 0, sprites, score: 0, lives: START_LIVES, inbox: [], rand: seed >>> 0 || 1, over: null, touching: [], done: [], heard: 0 };
}

/**
 * One tick of the game (TICK_MS). `keys` are the arrow keys pressed since
 * the last tick. Order: on the first tick every "al empezar"; the messages
 * sent last tick are heard; keys fire their rules (a key nobody listens to
 * is a shrug); every "siempre" whose moment has come; new touches between
 * objects; then the game's own hats (points, lives). A rule whose action
 * ends the game stops everything at once.
 */
export function gmStep(g: GmGame, prev: GmState, keys: readonly Dir[] = []): { state: GmState; events: GmEvent[] } {
  if (prev.over) return { state: prev, events: [] };
  const sprites: GmState['sprites'] = {};
  for (const [k, v] of Object.entries(prev.sprites)) sprites[k as SpriteId] = { ...v };
  const s: GmState = { ...prev, tick: prev.tick + 1, sprites, inbox: [], touching: [...prev.touching], done: [...prev.done] };
  const events: GmEvent[] = [];
  const outbox: MsgId[] = [];

  const act = (obj: ObjId, a: string, depth: number) => {
    const kind = kindOf(a), p = paramOf(a);
    const sp = isSprite(obj) ? s.sprites[obj] : undefined;
    switch (kind) {
      case 'move': {
        if (!sp) return;
        const dir = p === 'ahead' ? sp.dir : (p as Dir);
        if (!STEP[dir]) return;
        const c = sp.c + STEP[dir].c, r = sp.r + STEP[dir].r;
        if (c < 0 || c >= GM_COLS || r < 0 || r >= GM_ROWS) {
          const edge = dir === 'down' && r >= GM_ROWS ? 'ground' : 'edge';
          events.push({ t: 'bump', obj: sp.id, edge });
          fire(obj, `touch:${edge}`, depth + 1);
          return;
        }
        sp.c = c; sp.r = r;
        events.push({ t: 'move', obj: sp.id, c, r });
        return;
      }
      case 'turn':
        if (!sp) return;
        sp.dir = OPPOSITE[sp.dir];
        events.push({ t: 'turn', obj: sp.id, dir: sp.dir });
        return;
      case 'top': {
        if (!sp) return;
        let x: number;
        [x, s.rand] = nextRandom(s.rand);
        let c = Math.floor(x * GM_COLS);
        if (c === sp.c) c = (c + 1 + Math.floor(x * 97) % (GM_COLS - 1)) % GM_COLS;
        sp.c = c; sp.r = 0;
        events.push({ t: 'top', obj: sp.id, c });
        return;
      }
      case 'score': {
        const d = Number(p) || 0;
        const score = Math.max(0, s.score + d);
        events.push({ t: 'score', score, delta: score - s.score });
        s.score = score;
        return;
      }
      case 'lives': {
        const d = Number(p) || 0;
        const lives = Math.max(0, Math.min(MAX_LIVES, s.lives + d));
        events.push({ t: 'lives', lives, delta: lives - s.lives });
        s.lives = lives;
        return;
      }
      case 'say':
        if (!sp) return;
        sp.say = p as SayId;
        sp.sayUntil = s.tick + SAY_TICKS;
        events.push({ t: 'say', obj: sp.id, say: sp.say });
        return;
      case 'vis':
        if (!sp) return;
        sp.visible = p === 'show';
        events.push({ t: 'vis', obj: sp.id, visible: sp.visible });
        return;
      case 'send':
        if (!outbox.includes(p as MsgId)) outbox.push(p as MsgId);
        events.push({ t: 'send', obj, msg: p as MsgId });
        return;
      case 'win':
      case 'lose':
        if (!s.over) { s.over = kind; events.push({ t: 'end', result: kind }); }
        return;
    }
  };

  /** Every rule of `obj` whose hat is `hat` runs, in card order. Returns whether one did. */
  function fire(obj: ObjId, hat: string, depth = 0): boolean {
    if (depth > MAX_DEPTH || s.over) return false;
    const o = g.find((x) => x.id === obj);
    if (!o) return false;
    let any = false;
    o.rules.forEach((r, i) => {
      if (r.hat !== hat || s.over) return;
      any = true;
      events.push({ t: 'fire', obj, rule: i });
      for (const a of r.actions) { if (s.over) break; act(obj, a, depth); }
    });
    return any;
  }
  const fireAll = (hat: string) => { for (const o of g) fire(o.id, hat); };
  const finish = () => {
    s.inbox = outbox;
    return { state: s, events };
  };

  // 1. the start
  if (prev.tick === 0) fireAll('start');
  // 2. last tick's messages
  for (const m of prev.inbox) {
    let heard = false;
    for (const o of g) {
      if (s.over) break;
      if (!o.rules.some((r) => r.hat === `recv:${m}`)) continue;
      events.push({ t: 'recv', obj: o.id, msg: m });
      heard = fire(o.id, `recv:${m}`) || heard;
    }
    if (heard) s.heard++;
  }
  if (s.over) return finish();
  // 3. keys
  for (const k of keys) {
    let any = false;
    for (const o of g) any = fire(o.id, `key:${k}`) || any;
    if (!any) events.push({ t: 'shrug', key: k });
  }
  // 4. "siempre": each sprite at its own pace
  for (const o of g) {
    if (!isSprite(o.id) || s.tick % SPRITE_DEFS[o.id].pace !== 0) continue;
    fire(o.id, 'tick');
  }
  if (s.over) return finish();
  // 5. bubbles end
  for (const sp of Object.values(s.sprites)) if (sp && sp.say && s.tick >= sp.sayUntil) sp.say = null;
  // 6. touches that begin now (hidden objects touch nothing)
  const vis = Object.values(s.sprites).filter((x): x is GmSprite => !!x && x.visible);
  const now: string[] = [];
  for (let i = 0; i < vis.length; i++) {
    for (let j = i + 1; j < vis.length; j++) {
      const a = vis[i], b = vis[j];
      if (a.c !== b.c || a.r !== b.r) continue;
      const key = [a.id, b.id].sort().join('|');
      now.push(key);
      if (s.touching.includes(key)) continue;
      events.push({ t: 'touch', a: a.id, b: b.id });
      fire(a.id, `touch:${b.id}`);
      fire(b.id, `touch:${a.id}`);
    }
  }
  // a pair that was moved apart by its own touch rule is not touching any more
  s.touching = now.filter((k) => {
    const [a, b] = k.split('|') as SpriteId[];
    const x = s.sprites[a], y = s.sprites[b];
    return !!x && !!y && x.c === y.c && x.r === y.r;
  });
  // 7. the game's hats
  for (const o of g) {
    for (const r of o.rules) {
      if (s.over || s.done.includes(r.hat)) continue;
      const k = kindOf(r.hat);
      const due = (k === 'points' && s.score >= Number(paramOf(r.hat))) || (k === 'lives0' && s.lives <= 0);
      if (!due) continue;
      s.done.push(r.hat);
      fire(o.id, r.hat);
    }
  }
  return finish();
}

/** Plays `ticks` ticks with keys from `input(state)`; for tests. */
export function gmPlay(g: GmGame, ticks: number, input: (s: GmState) => Dir[] = () => [], seed = 7) {
  let state = gmInit(g, seed);
  const events: GmEvent[] = [];
  for (let i = 0; i < ticks && !state.over; i++) {
    const r = gmStep(g, state, input(state));
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

/** A simple player: walk under the seed that falls, away from a stone right above. For tests and the ghost's help. */
export function chaser(s: GmState): Dir | null {
  const me = s.sprites.me, seed = s.sprites.seed;
  if (!me || !seed || !seed.visible) return null;
  if (seed.c === me.c) return null;
  return seed.c > me.c ? 'right' : 'left';
}

/** The arrow keys some rule of the game listens to. */
export const keysOf = (g: GmGame): Dir[] => DIRS.filter((d) => g.some((o) => o.rules.some((r) => r.hat === `key:${d}`)));

// ------------------------------------------------------------------ La Traductora: the same rule in Scratch

export type ScratchCat = 'events' | 'motion' | 'looks' | 'control' | 'variables' | 'sensing' | 'operators';
/** A piece of a Scratch block: words, or an input (a white round slot, a dropdown, a boolean, a green flag). */
export type SPart = string | { in: string; kind: 'num' | 'text' | 'drop' | 'var' | 'flag' | 'bool' | 'op'; cat?: ScratchCat };
export interface SBlock { cat: ScratchCat; shape: 'hat' | 'stack' | 'c' | 'cap'; parts: SPart[]; body?: SBlock[] }

/** The sprites' names in Scratch (the child's character is named after it). */
export const SCRATCH_NAMES: Record<Exclude<ObjId, 'me'>, string> = { seed: 'Semilla', stone: 'Piedra', bird: 'Pájaro', game: 'Escenario' };
export const MSG_WORD: Record<MsgId, string> = { yum: '¡ñam!', ouch: '¡ay!', party: '¡fiesta!' };
export const SAY_WORD: Record<SayId, string> = { mia: '¡Mía!', ay: '¡Ay!', pio: '¡Pío!', bien: '¡Bien!' };
const KEY_WORD: Record<Dir, string> = { right: 'flecha derecha', left: 'flecha izquierda', up: 'flecha arriba', down: 'flecha abajo' };

const flagHat = (): SBlock => ({ cat: 'events', shape: 'hat', parts: ['al hacer clic en', { in: '', kind: 'flag' }] });
const forever = (body: SBlock[]): SBlock => ({ cat: 'control', shape: 'c', parts: ['por siempre'], body });
const ifThen = (cond: SPart, body: SBlock[]): SBlock => ({ cat: 'control', shape: 'c', parts: ['si', cond, 'entonces'], body });

function scratchAction(a: string): SBlock[] {
  const p = paramOf(a);
  switch (kindOf(a)) {
    case 'move':
      if (p === 'ahead') return [{ cat: 'motion', shape: 'stack', parts: ['mover', { in: '40', kind: 'num' }, 'pasos'] }];
      return [{ cat: 'motion', shape: 'stack', parts: [p === 'left' || p === 'right' ? 'cambiar x en' : 'cambiar y en', { in: p === 'right' || p === 'up' ? '40' : '-40', kind: 'num' }] }];
    case 'turn': return [{ cat: 'motion', shape: 'stack', parts: ['girar ↻', { in: '180', kind: 'num' }, 'grados'] }];
    case 'top': return [{ cat: 'motion', shape: 'stack', parts: ['ir a x:', { in: 'al azar', kind: 'op', cat: 'operators' }, 'y:', { in: '160', kind: 'num' }] }];
    case 'score': return [{ cat: 'variables', shape: 'stack', parts: ['sumar', { in: p, kind: 'num' }, 'a', { in: 'puntos', kind: 'drop' }] }];
    case 'lives': return [{ cat: 'variables', shape: 'stack', parts: ['sumar', { in: p, kind: 'num' }, 'a', { in: 'vidas', kind: 'drop' }] }];
    case 'say': return [{ cat: 'looks', shape: 'stack', parts: ['decir', { in: SAY_WORD[p as SayId] ?? p, kind: 'text' }, 'por', { in: '2', kind: 'num' }, 'segundos'] }];
    case 'send': return [{ cat: 'events', shape: 'stack', parts: ['enviar', { in: MSG_WORD[p as MsgId] ?? p, kind: 'drop' }] }];
    case 'vis': return [{ cat: 'looks', shape: 'stack', parts: [p === 'show' ? 'mostrar' : 'esconder'] }];
    case 'win':
    case 'lose':
      return [
        { cat: 'looks', shape: 'stack', parts: ['decir', { in: kindOf(a) === 'win' ? '¡Ganaste!' : '¡Fin del juego!', kind: 'text' }] },
        { cat: 'control', shape: 'cap', parts: ['detener', { in: 'todos', kind: 'drop' }] },
      ];
    default: return [];
  }
}

/** A rule of the game maker as the Scratch script that does the same (Spanish Scratch 3 wording). `me` is the character's name. */
export function scratchOf(rule: GmRule, me = 'Brote'): SBlock[] {
  const body = rule.actions.flatMap(scratchAction);
  const p = paramOf(rule.hat);
  switch (kindOf(rule.hat)) {
    case 'start': return [flagHat(), ...body];
    case 'key': return [{ cat: 'events', shape: 'hat', parts: ['al presionar tecla', { in: KEY_WORD[p as Dir] ?? p, kind: 'drop' }] }, ...body];
    case 'tick': return [flagHat(), forever([...body, { cat: 'control', shape: 'stack', parts: ['esperar', { in: '0.5', kind: 'num' }, 'segundos'] }])];
    case 'touch': {
      const what = p === 'me' ? me : p === 'ground' ? 'suelo' : p === 'edge' ? 'borde' : SCRATCH_NAMES[p as Exclude<ObjId, 'me'>] ?? p;
      return [flagHat(), forever([ifThen({ in: `¿tocando ${what}?`, kind: 'bool', cat: 'sensing' }, body)])];
    }
    case 'recv': return [{ cat: 'events', shape: 'hat', parts: ['al recibir', { in: MSG_WORD[p as MsgId] ?? p, kind: 'drop' }] }, ...body];
    case 'points': return [flagHat(), forever([ifThen({ in: `puntos = ${p}`, kind: 'bool', cat: 'operators' }, body)])];
    case 'lives0': return [flagHat(), forever([ifThen({ in: 'vidas = 0', kind: 'bool', cat: 'operators' }, body)])];
    default: return body;
  }
}
