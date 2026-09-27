// Types for the frame-driven tween engine ported verbatim from demo-estilo/js/anim.js.
export type Ease = (t: number) => number;
export const ABORT: unique symbol;
export const E: Record<'linear' | 'in' | 'in3' | 'out' | 'out3' | 'inOut' | 'inOut3' | 'back' | 'softBack' | 'hang', Ease>;
export const engine: { update(time: number): void; abort(owner: unknown): void; speed: number; time: number };
export function tween<T extends object>(owner: unknown, target: T, props: Partial<Record<keyof T, number>>, dur: number, ease?: Ease): Promise<void>;
export function proc(owner: unknown, dur: number, fn: (p: number, elapsedMs: number) => void): Promise<void>;
export function wait(owner: unknown, ms: number): Promise<void>;
export function spring(x: number, v: number, target: number, k: number, damp: number, dt: number): [number, number];
