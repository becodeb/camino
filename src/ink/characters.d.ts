// Types for the four mascots ported verbatim from demo-estilo/js/characters.js.
export const INK: string;

export interface EyeDef { x: number; y: number; rx: number; ry: number; pr: number }
export interface Dir { dx: number; dy: number }
export interface Point { x: number; y: number }

/** The performance API a character's motions receive (see docs/05 §5). */
export interface ActorApi {
  rig: Record<string, any>;
  def: CharacterDef;
  T(props: Record<string, number>, ms: number, ease?: (t: number) => number): Promise<void>;
  P(ms: number, fn: (p: number, ms: number) => void): Promise<void>;
  wait(ms: number): Promise<void>;
  lookAt(x: number, y: number, ms: number): void;
  bubble(text: string): void;
  mark(): void;
  dizzy(on: boolean): void;
}

export interface CharacterDef {
  id: 'brote' | 'mina' | 'pliegue' | 'ovillo';
  name: string;
  color: string;
  eyes: EyeDef[];
  mouth: { x: number; y: number; w: number } | null;
  top: number;
  head: number;
  pivot: number;
  breathe: { period: number; amp: number };
  defaults: Record<string, number>;
  trail?: { kind: 'pencil' | 'yarn' };
  build(g: SVGGElement, uid: string): any;
  render(rig: Record<string, any>, parts: any, st: { t: number; dt: number; vx: number; vy: number; ay: number }): void;
  m: {
    step(A: ActorApi, to: Point, d: Dir): Promise<void>;
    bump(A: ActorApi, hit: Point, d: Dir): Promise<void>;
    celebrate(A: ActorApi): Promise<void>;
    tap(A: ActorApi): Promise<void>;
    nod(A: ActorApi): Promise<void>;
    sleep(A: ActorApi): Promise<void>;
    fidget(A: ActorApi): Promise<void>;
  };
}

export const CHARACTERS: CharacterDef[];
