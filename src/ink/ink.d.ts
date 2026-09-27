// Types for the hand-drawn geometry helpers ported verbatim from demo-estilo/js/ink.js.
export const NS: string;
export function rng(seed: number): () => number;
export function smoothClosed(pts: [number, number][]): string;
export function smoothOpen(pts: [number, number][]): string;
export function blob(cx: number, cy: number, rx: number, ry: number, o?: { wob?: number; n?: number; seed?: number; rot?: number }): string;
export function wobblyPoly(points: [number, number][], o?: { wob?: number; bow?: number; seed?: number }): string;
export function wobblyLine(x1: number, y1: number, x2: number, y2: number, o?: { bow?: number; seed?: number; segs?: number; jit?: number }): string;
export function penLoop(cx: number, cy: number, rx: number, ry: number, o?: { seed?: number; turns?: number; start?: number }): string;
export function leaf(x0: number, y0: number, x1: number, y1: number, w: number): string;
export function spiral(cx: number, cy: number, r: number, turns?: number, seed?: number): string;
export function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs?: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K];
