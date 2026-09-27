// The look of the music recess's notes (sheet 9), shared by the note cards,
// the xylophone on the board, the song strip and the small drawings: each
// note is a xylophone bar in its own colour, as long as the note is low (do
// the longest, sol the shortest), with a darker flat facet and two nails; a
// silence is the rest sign of the music notebook. Colours from the palette
// (docs/05): do red, re orange, mi yellow, fa green, sol blue.

import { rng } from '../ink/ink.js';
import type { Pitch, Tone } from '../game/music';

/** The bars' colours. */
export const BAR_FILL: Record<Pitch, string> = { do: '#d9705f', re: '#de8a56', mi: '#f0d27a', fa: '#a4b86d', sol: '#7298c1' };
/** Their darker flat facet. */
export const BAR_DARK: Record<Pitch, string> = { do: '#b85746', re: '#bf6f3f', mi: '#d3b25a', fa: '#879b52', sol: '#5a7fa6' };
/** The note cards: a pale tint of their bar, so the bar on them stands out; the silence on grey paper. */
export const NOTE_CARD: Record<Tone, string> = { do: '#edc1b5', re: '#efcbb1', mi: '#f7e8c0', fa: '#d8deba', sol: '#c4d1dc', rest: '#e9e2d3' };
/** The length of each bar on the board, in board units (a cell is 100). */
export const BAR_LEN: Record<Pitch, number> = { do: 150, re: 136, mi: 122, fa: 108, sol: 94 };

/**
 * A bar: a rounded rectangle centred on (cx, cy), `w` by `h`, its corners
 * cut by hand (a seeded jitter), for SVG paths anywhere.
 */
export function barPath(cx: number, cy: number, w: number, h: number, r: number, seed: number): string {
  const R = rng(seed);
  const j = () => (R() - 0.5) * Math.min(1.6, w * 0.04);
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  const f = (n: number) => n.toFixed(1);
  return `M${f(x0 + r)},${f(y0 + j())} L${f(x1 - r)},${f(y0 + j())} Q${f(x1)},${f(y0)} ${f(x1 + j())},${f(y0 + r)}`
    + ` L${f(x1 + j())},${f(y1 - r)} Q${f(x1)},${f(y1)} ${f(x1 - r)},${f(y1 + j())} L${f(x0 + r)},${f(y1 + j())}`
    + ` Q${f(x0)},${f(y1)} ${f(x0 + j())},${f(y1 - r)} L${f(x0 + j())},${f(y0 + r)} Q${f(x0)},${f(y0)} ${f(x0 + r)},${f(y0)} Z`;
}

/** The rest sign (a quarter rest), drawn in a 48 × 48 box: a zigzag and its curl, one ink stroke. */
export const REST_PATH = 'M20,6 L29.5,16.5 L21,25.5 L29.5,33.5 C24.5,31 18.5,33.5 21,38.5 C22,40.5 24,41.5 26,42';

/** A seed per note, so each bar keeps its own wobble. */
export const toneSeed = (t: Tone) => ['do', 're', 'mi', 'fa', 'sol', 'rest'].indexOf(t) * 7 + 3;
