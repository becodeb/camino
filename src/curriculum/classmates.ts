// The class corkboard's example levels, made by fictional classmates. There
// are no accounts in this demo: these cards stand in for the class, clearly
// marked as examples for the adult (the corkboard's small print, "ejemplo"
// on each card), next to every level made on this device. Four come from the
// first workshop (sheet 7: the forest, a notebook as long as the shortest
// plan) and four from the limited one (sheet 15: the river, few lines, a
// repeat needed). The tests prove each one: its author's program wins and
// fits, and a limited one cannot be done without a repeat.

import type { Program } from '../game/model';
import type { MadeLevel } from './workshop';

/** A fictional classmate: a first name (for the adult's small print), the character they chose and the colour of their badge. */
export interface Classmate { id: string; name: string; character: 'brote' | 'mina' | 'pliegue' | 'ovillo'; color: string }

export const CLASSMATES: readonly Classmate[] = [
  { id: 'juli', name: 'Juli', character: 'mina', color: '#e7a3a0' },
  { id: 'tomi', name: 'Tomi', character: 'pliegue', color: '#f2d98c' },
  { id: 'lu', name: 'Lu', character: 'ovillo', color: '#a9c3de' },
  { id: 'benja', name: 'Benja', character: 'brote', color: '#b7c77f' },
  { id: 'mora', name: 'Mora', character: 'pliegue', color: '#eeb3ac' },
  { id: 'santi', name: 'Santi', character: 'ovillo', color: '#f2d98c' },
  { id: 'cami', name: 'Cami', character: 'mina', color: '#b7c77f' },
  { id: 'nico', name: 'Nico', character: 'brote', color: '#a9c3de' },
];

export const classmateById = (id: string) => CLASSMATES.find((c) => c.id === id) ?? null;

const arrows = (...ds: string[]): Program => ds.map((cmd) => ({ t: 'cmd', cmd }));
const times = (count: number, ...body: string[]): Program[number] => ({ t: 'loop', count, body });

export const EXAMPLES: readonly MadeLevel[] = [
  // sheet 7: a notebook with as many lines as the shortest plan, arrows only
  {
    id: 'ej-1', sheet: 7, by: 'juli', lines: 8,
    board: { start: [0, 0], seed: [2, 2], goal: [5, 1], rocks: [[3, 0], [3, 1], [3, 3]] },
    solution: arrows('down', 'down', 'right', 'right', 'right', 'right', 'right', 'up'),
  },
  {
    id: 'ej-2', sheet: 7, by: 'tomi', lines: 9,
    board: { start: [0, 1], seed: [2, 3], goal: [5, 1], rocks: [[1, 1], [3, 1], [3, 2]] },
    solution: arrows('down', 'down', 'right', 'right', 'right', 'right', 'up', 'up', 'right'),
  },
  {
    id: 'ej-3', sheet: 7, by: 'lu', lines: 8,
    board: { start: [2, 3], seed: [4, 0], goal: [5, 2], rocks: [[3, 0], [3, 1], [5, 1]] },
    solution: arrows('up', 'right', 'right', 'up', 'up', 'down', 'down', 'right'),
  },
  {
    id: 'ej-4', sheet: 7, by: 'benja', lines: 7,
    board: { start: [0, 3], seed: [1, 1], goal: [4, 0], rocks: [[2, 2], [2, 3]] },
    solution: arrows('up', 'up', 'right', 'up', 'right', 'right', 'right'),
  },
  // sheet 15: few lines, by the river; the author's program uses a repeat
  {
    id: 'ej-5', sheet: 15, by: 'mora', lines: 2,
    board: { start: [0, 3], seed: [3, 3], goal: [5, 3], rocks: [[1, 1], [4, 1]] },
    solution: [times(5, 'right')],
  },
  {
    id: 'ej-6', sheet: 15, by: 'santi', lines: 2,
    board: { start: [0, 3], seed: [2, 1], goal: [3, 0], rocks: [[0, 2], [1, 1], [2, 0]] },
    solution: [times(3, 'right', 'up')],
  },
  {
    id: 'ej-7', sheet: 15, by: 'cami', lines: 2,
    board: { start: [0, 0], seed: [5, 0], goal: [5, 3], rocks: [[2, 2], [3, 1]] },
    solution: [times(5, 'right'), times(3, 'down')],
  },
  {
    id: 'ej-8', sheet: 15, by: 'nico', lines: 3,
    board: { start: [0, 0], seed: [2, 1], goal: [4, 2], rocks: [[3, 0], [1, 1], [5, 1]] },
    solution: [times(2, 'right', 'right', 'down')],
  },
];
