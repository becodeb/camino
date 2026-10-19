// The Workshop's VM (T40): pure, deterministic, unit-tested (vm.test.ts).
// Scratch's semantics, simplified: every script under a hat is a thread;
// threads take turns, each running until a yield point (the end of a loop's
// pass, `esperar`, the end of its script) and the stage is drawn between
// frames; a fixed timestep of 30 frames a second (the page drives it with
// requestAnimationFrame and an accumulator, Stage.tsx). Events: the green
// flag, a key pressed, a message received. Variables are global. A sprite
// has x, y (Scratch's stage: 480 × 360, the centre at 0, 0, y up), a
// direction, visibility and a costume; `¿tocando?` compares bounding boxes.
// `detener todo`, `ganar` and `perder` end the game.
//
// A runaway script cannot freeze the page: every loop yields once per pass
// and a frame runs at most MAX_OPS blocks (the rest waits for the next
// frame). Each ▶ starts from the project's own starting state (positions,
// costumes, variables), so a run never depends on the previous one.

import { EDGE, KEYS, VARS, type VarName } from './blocks';
import type { Block, Project, Slot, SpriteKind } from './model';

export const FPS = 30;
export const DT = 1 / FPS;
export const STAGE_W = 480;
export const STAGE_H = 360;
export const EDGE_X = STAGE_W / 2;
export const EDGE_Y = STAGE_H / 2;
/** Blocks run in one frame, at most (a runaway guard). */
export const MAX_OPS = 4000;

/** Each kind's hit box (a little smaller than its drawing, so touches feel fair). */
export const HITBOX: Record<SpriteKind, { w: number; h: number }> = {
  stage: { w: 0, h: 0 },
  player: { w: 40, h: 50 },
  floor: { w: STAGE_W, h: 50 },
  obstacle: { w: 44, h: 40 },
  seed: { w: 30, h: 30 },
  bird: { w: 44, h: 30 },
  star: { w: 34, h: 34 },
};

export interface SpriteState {
  id: string;
  name: string;
  kind: SpriteKind;
  x: number;
  y: number;
  dir: number;
  visible: boolean;
  costume: string;
  say: string | null;
}

export type EndState = 'running' | 'won' | 'lost' | 'stopped';

export interface VmStats { sounds: number; says: number; costumes: number; broadcasts: number; ops: number }
export interface VmSound { frame: number; sprite: string; name: string }

export interface Snapshot {
  frame: number;
  sprites: { id: string; kind: SpriteKind; x: number; y: number; visible: boolean; costume: string }[];
  vars: Record<VarName, number>;
  state: EndState;
  /** The sprites that touched the player at any moment of this frame (a script asked, or they overlapped between turns). */
  touch: string[];
}

interface Thread { key: string; sprite: SpriteState; gen: Generator<void, void, void>; done: boolean }

/** mulberry32: the VM's own seeded random (deterministic runs). */
function random32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const toNum = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const isNumeric = (v: unknown) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.trim().replace(',', '.'))));
function compare(a: unknown, b: unknown): number {
  if (isNumeric(a) && isNumeric(b)) return toNum(a) - toNum(b);
  const x = String(a ?? '').toLowerCase(), y = String(b ?? '').toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

const clampPos = (v: number) => Math.max(-1000, Math.min(1000, v));

export class VM {
  readonly sprites: SpriteState[] = [];
  vars = {} as Record<VarName, number>;
  state: EndState = 'running';
  frame = 0;
  readonly stats: VmStats = { sounds: 0, says: 0, costumes: 0, broadcasts: 0, ops: 0 };
  /** Sounds started since the page last took them (Stage plays them). */
  sounds: VmSound[] = [];
  private threads: Thread[] = [];
  private keysDown = new Set<string>();
  private pendingKeys: string[] = [];
  private ops = 0;
  private frameTouches = new Set<string>();
  private rand: () => number;
  private readonly scripts: { sprite: SpriteState; hat: Block; body: Block[] }[] = [];

  constructor(readonly project: Project, seed = 1) {
    this.rand = random32(seed);
    for (const s of project.sprites) {
      const st: SpriteState = { id: s.id, name: s.name, kind: s.kind, x: s.x, y: s.y, dir: s.dir, visible: s.visible, costume: s.costume, say: null };
      this.sprites.push(st);
      for (const stack of s.stacks) {
        const [hat, ...body] = stack.blocks;
        if (hat && (hat.op === 'flag' || hat.op === 'key' || hat.op === 'receive')) this.scripts.push({ sprite: st, hat, body });
      }
    }
    for (const v of VARS) this.vars[v] = toNum(project.vars[v] ?? 0);
  }

  get time() { return this.frame * DT; }
  sprite(id: string) { return this.sprites.find((s) => s.id === id) ?? null; }
  get running() { return this.state === 'running'; }

  /** The green flag: every `al hacer clic en la bandera verde` script starts. */
  start(): void {
    for (const sc of this.scripts) if (sc.hat.op === 'flag') this.spawn(sc);
  }

  /** A key went down (an edge: holding it does not repeat). `key` is KeyboardEvent.key or Scratch's name. */
  keyDown(key: string): void {
    const name = KEYS.find((k) => k.key === key || k.name === key)?.name;
    if (!name || this.keysDown.has(name)) return;
    this.keysDown.add(name);
    this.pendingKeys.push(name);
  }
  keyUp(key: string): void {
    const name = KEYS.find((k) => k.key === key || k.name === key)?.name;
    if (name) this.keysDown.delete(name);
  }

  /** The stop button. */
  stop(): void { this.end('stopped'); }

  private end(s: Exclude<EndState, 'running'>) {
    if (this.state !== 'running') return;
    this.state = s;
    this.threads = [];
  }

  private spawn(sc: { sprite: SpriteState; hat: Block; body: Block[] }) {
    const key = `${sc.sprite.id}:${sc.hat.id}`;
    // Scratch: an event that starts a script already running restarts it
    for (const t of this.threads) if (t.key === key) t.done = true;
    const t: Thread = { key, sprite: sc.sprite, gen: undefined as unknown as Generator<void, void, void>, done: false };
    t.gen = this.run(sc.body, t);
    this.threads.push(t);
  }

  /** One frame: queued events start their scripts, then every thread runs to its next yield. */
  step(): void {
    if (this.state !== 'running') return;
    this.frame++;
    this.ops = 0;
    this.frameTouches.clear();
    this.noteTouches();
    for (const k of this.pendingKeys.splice(0)) {
      for (const sc of this.scripts) if (sc.hat.op === 'key' && sc.hat.in.KEY?.v === k) this.spawn(sc);
    }
    // index-based: scripts a message starts during this frame run later in this same frame (like Scratch)
    for (let i = 0; i < this.threads.length; i++) {
      const t = this.threads[i];
      if (t.done) continue;
      const r = t.gen.next();
      if (r.done) t.done = true;
      this.noteTouches();
      if (this.state !== 'running') return;
    }
    this.threads = this.threads.filter((t) => !t.done);
  }

  snapshot(): Snapshot {
    return {
      frame: this.frame,
      sprites: this.sprites.map((s) => ({ id: s.id, kind: s.kind, x: s.x, y: s.y, visible: s.visible, costume: s.costume })),
      vars: { ...this.vars },
      state: this.state,
      touch: [...this.frameTouches],
    };
  }

  /** Whatever overlaps the player right now counts as a touch of this frame. */
  private noteTouches() {
    for (const pl of this.sprites) {
      if (pl.kind !== 'player' || !pl.visible) continue;
      for (const o of this.sprites) if (o !== pl && this.overlaps(pl, o)) this.frameTouches.add(o.id);
    }
  }
  private overlaps(a: SpriteState, b: SpriteState): boolean {
    if (!a.visible || !b.visible || a.kind === 'stage' || b.kind === 'stage' || b.kind === 'floor' || a.kind === 'floor') return false;
    const ha = HITBOX[a.kind], hb = HITBOX[b.kind];
    return Math.abs(a.x - b.x) * 2 < ha.w + hb.w && Math.abs(a.y - b.y) * 2 < ha.h + hb.h;
  }

  /** Whether two sprites touch (both visible, boxes overlapping); `other` may be "borde". */
  touching(a: SpriteState, other: string): boolean {
    if (!a.visible || a.kind === 'stage') return false;
    const ha = HITBOX[a.kind];
    if (other === EDGE) return Math.abs(a.x) + ha.w / 2 > EDGE_X || Math.abs(a.y) + ha.h / 2 > EDGE_Y;
    const b = this.sprites.find((s) => s.id === other || s.name === other);
    if (!b || b === a || !b.visible || b.kind === 'stage') return false;
    const hb = HITBOX[b.kind];
    const hit = Math.abs(a.x - b.x) * 2 < ha.w + hb.w && Math.abs(a.y - b.y) * 2 < ha.h + hb.h;
    if (hit && a.kind === 'player') this.frameTouches.add(b.id);
    else if (hit && b.kind === 'player') this.frameTouches.add(a.id);
    return hit;
  }

  // ---------------------------------------------------------------- evaluation

  private value(slot: Slot | undefined, t: Thread): unknown {
    if (!slot) return '';
    return slot.r ? this.report(slot.r, t) : slot.v;
  }
  private num(slot: Slot | undefined, t: Thread) { return toNum(this.value(slot, t)); }
  private truth(slot: Slot | undefined, t: Thread): boolean {
    if (!slot?.r) return false;
    const v = this.report(slot.r, t);
    return v === true || (typeof v === 'string' && v.toLowerCase() === 'true') || (typeof v === 'number' && v !== 0);
  }

  private report(b: Block, t: Thread): unknown {
    this.ops++;
    this.stats.ops++;
    const s = t.sprite;
    switch (b.op) {
      case 'xpos': return Math.round(s.x * 100) / 100;
      case 'ypos': return Math.round(s.y * 100) / 100;
      case 'add': return this.num(b.in.A, t) + this.num(b.in.B, t);
      case 'sub': return this.num(b.in.A, t) - this.num(b.in.B, t);
      case 'random': {
        const a = this.num(b.in.A, t), c = this.num(b.in.B, t);
        const lo = Math.min(a, c), hi = Math.max(a, c);
        if (Number.isInteger(lo) && Number.isInteger(hi)) return lo + Math.floor(this.rand() * (hi - lo + 1));
        return lo + this.rand() * (hi - lo);
      }
      case 'gt': return compare(this.value(b.in.A, t), this.value(b.in.B, t)) > 0;
      case 'lt': return compare(this.value(b.in.A, t), this.value(b.in.B, t)) < 0;
      case 'eq': return compare(this.value(b.in.A, t), this.value(b.in.B, t)) === 0;
      case 'and': return this.truth(b.in.A, t) && this.truth(b.in.B, t);
      case 'touching': return this.touching(s, b.in.OBJ?.v ?? '');
      case 'keyPressed': return this.keysDown.has(b.in.KEY?.v ?? '');
      case 'var': return this.vars[(b.in.VAR?.v ?? '') as VarName] ?? 0;
      default: return '';
    }
  }

  private *run(blocks: readonly Block[], t: Thread): Generator<void, void, void> {
    const s = t.sprite;
    for (const b of blocks) {
      if (this.state !== 'running') return;
      if (++this.ops > MAX_OPS) yield;
      this.stats.ops++;
      switch (b.op) {
        case 'move': {
          const n = this.num(b.in.N, t);
          const r = (s.dir * Math.PI) / 180;
          s.x = clampPos(s.x + n * Math.sin(r));
          s.y = clampPos(s.y + n * Math.cos(r));
          // keep exact numbers for the usual left/right moves
          if (Math.abs(Math.cos(r)) < 1e-9) s.y = clampPos(Math.round(s.y * 1e6) / 1e6);
          break;
        }
        case 'changeX': s.x = clampPos(s.x + this.num(b.in.DX, t)); break;
        case 'setX': s.x = clampPos(this.num(b.in.X, t)); break;
        case 'changeY': s.y = clampPos(s.y + this.num(b.in.DY, t)); break;
        case 'setY': s.y = clampPos(this.num(b.in.Y, t)); break;
        case 'goto': s.x = clampPos(this.num(b.in.X, t)); s.y = clampPos(this.num(b.in.Y, t)); break;
        case 'say': s.say = String(this.value(b.in.MSG, t)) || null; this.stats.says++; break;
        case 'sayFor': {
          const text = String(this.value(b.in.MSG, t)) || null;
          s.say = text;
          this.stats.says++;
          yield* this.wait(this.num(b.in.SECS, t));
          if (s.say === text) s.say = null;
          break;
        }
        case 'costume': {
          const c = b.in.C?.v ?? '';
          if (c && c !== s.costume) { s.costume = c; this.stats.costumes++; }
          break;
        }
        case 'show': s.visible = true; break;
        case 'hide': s.visible = false; break;
        case 'sound': this.stats.sounds++; this.sounds.push({ frame: this.frame, sprite: s.id, name: b.in.S?.v ?? '' }); break;
        case 'wait': yield* this.wait(this.num(b.in.SECS, t)); break;
        case 'repeat': {
          const n = Math.round(this.num(b.in.N, t));
          for (let i = 0; i < n; i++) {
            yield* this.run(b.subs?.[0] ?? [], t);
            if (this.state !== 'running') return;
            yield;
          }
          break;
        }
        case 'forever':
          for (;;) {
            yield* this.run(b.subs?.[0] ?? [], t);
            if (this.state !== 'running') return;
            yield;
          }
        case 'if':
          if (this.truth(b.in.COND, t)) yield* this.run(b.subs?.[0] ?? [], t);
          break;
        case 'ifElse':
          yield* this.run((this.truth(b.in.COND, t) ? b.subs?.[0] : b.subs?.[1]) ?? [], t);
          break;
        case 'stop': this.end('stopped'); return;
        case 'win': this.end('won'); return;
        case 'lose': this.end('lost'); return;
        case 'broadcast': {
          this.stats.broadcasts++;
          const m = b.in.MSG?.v ?? '';
          for (const sc of this.scripts) if (sc.hat.op === 'receive' && sc.hat.in.MSG?.v === m) this.spawn(sc);
          break;
        }
        case 'setVar': {
          const v = (b.in.VAR?.v ?? '') as VarName;
          if (v in this.vars) this.vars[v] = this.num(b.in.V, t);
          break;
        }
        case 'changeVar': {
          const v = (b.in.VAR?.v ?? '') as VarName;
          if (v in this.vars) this.vars[v] = Math.round((this.vars[v] + this.num(b.in.V, t)) * 1e6) / 1e6;
          break;
        }
        default: break; // hats in the middle and loose reporters do nothing
      }
    }
  }

  private *wait(secs: number): Generator<void, void, void> {
    const until = this.time + Math.max(0, secs);
    do { yield; } while (this.state === 'running' && this.time < until - 1e-9);
  }

  /** Testing and the checks: a variable set from outside (as if something in the game changed it). */
  poke(v: Partial<Record<VarName, number>>): void {
    for (const [k, n] of Object.entries(v)) if (k in this.vars) this.vars[k as VarName] = n as number;
  }
}

// ------------------------------------------------------------------ headless runs (the checks, the tests)

export interface SimOptions {
  frames: number;
  /** Keys pressed at a frame (down for that one frame). */
  keys?: Record<number, string[]>;
  /** Variables set at a frame, before it runs. */
  pokes?: Record<number, Partial<Record<VarName, number>>>;
  seed?: number;
}
export interface Trace { snaps: Snapshot[]; end: EndState; stats: VmStats; endFrame: number | null }

/** Runs a project from the green flag with no page: a snapshot after every frame. */
export function simulate(project: Project, o: SimOptions): Trace {
  const vm = new VM(project, o.seed ?? 7);
  vm.start();
  const snaps: Snapshot[] = [vm.snapshot()];
  let endFrame: number | null = null;
  let up: string[] = [];
  for (let f = 1; f <= o.frames; f++) {
    for (const k of up) vm.keyUp(k);
    up = [];
    if (o.pokes?.[f]) vm.poke(o.pokes[f]);
    for (const k of o.keys?.[f] ?? []) { vm.keyDown(k); up.push(k); }
    vm.step();
    snaps.push(vm.snapshot());
    if (vm.state !== 'running') { endFrame = f; break; }
  }
  return { snaps, end: vm.state, stats: { ...vm.stats }, endFrame };
}
