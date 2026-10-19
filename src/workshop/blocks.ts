// The Game Workshop's blocks (T40): a small Scratch inside Camino. Every
// block keeps Scratch 3's Spanish wording and its category colour (adapted
// to the notebook palette: a little softer, ink outlines and ink text, so it
// still reads as Scratch on paper), so what 4to learns here transfers to
// Scratch next year and back.
//
// A spec's `label` is the text of the block with its inputs in place:
// `%NAME` is an input (its type in `inputs`), `@flag` the green flag icon,
// `$NAME` an input shown as plain text (a variable reporter's name). Shapes:
// `hat` (starts a script), `stack` (a puzzle piece), `c` (one mouth:
// repetir, por siempre, si), `e` (two mouths: si … si no), `reporter`
// (round, a value) and `boolean` (hexagonal, true or false). `cap` blocks
// end a script (nothing attaches below): por siempre, detener todo, ganar,
// perder.

export type Cat = 'events' | 'motion' | 'looks' | 'sound' | 'control' | 'sensing' | 'operators' | 'variables' | 'game';
export type Shape = 'hat' | 'stack' | 'c' | 'e' | 'reporter' | 'boolean';
export type InType = 'num' | 'text' | 'menu' | 'bool';
/** Where a dropdown's options come from (some depend on the project: the sprites, a sprite's costumes). */
export type MenuKind = 'key' | 'touch' | 'var' | 'msg' | 'costume' | 'sound';

export type Op =
  | 'flag' | 'key' | 'receive' | 'broadcast'
  | 'move' | 'changeX' | 'setX' | 'changeY' | 'setY' | 'goto' | 'xpos' | 'ypos'
  | 'sayFor' | 'say' | 'costume' | 'show' | 'hide'
  | 'sound'
  | 'wait' | 'repeat' | 'forever' | 'if' | 'ifElse' | 'stop'
  | 'touching' | 'keyPressed'
  | 'add' | 'sub' | 'random' | 'gt' | 'lt' | 'eq' | 'and'
  | 'var' | 'setVar' | 'changeVar'
  | 'win' | 'lose';

export interface InputSpec { type: InType; def: string; menu?: MenuKind }

export interface BlockSpec {
  op: Op;
  cat: Cat;
  shape: Shape;
  label: string;
  /** The middle row of an `e` block. */
  elseLabel?: string;
  /** Nothing attaches below it. */
  cap?: boolean;
  inputs: Record<string, InputSpec>;
}

const num = (def: number | string): InputSpec => ({ type: 'num', def: String(def) });
const text = (def: string): InputSpec => ({ type: 'text', def });
const menu = (m: MenuKind, def: string): InputSpec => ({ type: 'menu', menu: m, def });
const bool: InputSpec = { type: 'bool', def: '' };

export const SPECS: Record<Op, BlockSpec> = {
  // events
  flag: { op: 'flag', cat: 'events', shape: 'hat', label: 'al hacer clic en @flag', inputs: {} },
  key: { op: 'key', cat: 'events', shape: 'hat', label: 'al presionar tecla %KEY', inputs: { KEY: menu('key', 'espacio') } },
  receive: { op: 'receive', cat: 'events', shape: 'hat', label: 'al recibir %MSG', inputs: { MSG: menu('msg', 'choque') } },
  broadcast: { op: 'broadcast', cat: 'events', shape: 'stack', label: 'enviar %MSG', inputs: { MSG: menu('msg', 'choque') } },
  // motion
  move: { op: 'move', cat: 'motion', shape: 'stack', label: 'mover %N pasos', inputs: { N: num(10) } },
  changeX: { op: 'changeX', cat: 'motion', shape: 'stack', label: 'cambiar x en %DX', inputs: { DX: num(10) } },
  setX: { op: 'setX', cat: 'motion', shape: 'stack', label: 'fijar x a %X', inputs: { X: num(0) } },
  changeY: { op: 'changeY', cat: 'motion', shape: 'stack', label: 'cambiar y en %DY', inputs: { DY: num(10) } },
  setY: { op: 'setY', cat: 'motion', shape: 'stack', label: 'fijar y a %Y', inputs: { Y: num(0) } },
  goto: { op: 'goto', cat: 'motion', shape: 'stack', label: 'ir a x: %X y: %Y', inputs: { X: num(0), Y: num(0) } },
  xpos: { op: 'xpos', cat: 'motion', shape: 'reporter', label: 'posición en x', inputs: {} },
  ypos: { op: 'ypos', cat: 'motion', shape: 'reporter', label: 'posición en y', inputs: {} },
  // looks
  sayFor: { op: 'sayFor', cat: 'looks', shape: 'stack', label: 'decir %MSG por %SECS segundos', inputs: { MSG: text('¡Hola!'), SECS: num(2) } },
  say: { op: 'say', cat: 'looks', shape: 'stack', label: 'decir %MSG', inputs: { MSG: text('¡Hola!') } },
  costume: { op: 'costume', cat: 'looks', shape: 'stack', label: 'cambiar disfraz a %C', inputs: { C: menu('costume', '') } },
  show: { op: 'show', cat: 'looks', shape: 'stack', label: 'mostrar', inputs: {} },
  hide: { op: 'hide', cat: 'looks', shape: 'stack', label: 'esconder', inputs: {} },
  // sound
  sound: { op: 'sound', cat: 'sound', shape: 'stack', label: 'iniciar sonido %S', inputs: { S: menu('sound', 'salto') } },
  // control
  wait: { op: 'wait', cat: 'control', shape: 'stack', label: 'esperar %SECS segundos', inputs: { SECS: num(1) } },
  repeat: { op: 'repeat', cat: 'control', shape: 'c', label: 'repetir %N', inputs: { N: num(10) } },
  forever: { op: 'forever', cat: 'control', shape: 'c', label: 'por siempre', cap: true, inputs: {} },
  if: { op: 'if', cat: 'control', shape: 'c', label: 'si %COND entonces', inputs: { COND: bool } },
  ifElse: { op: 'ifElse', cat: 'control', shape: 'e', label: 'si %COND entonces', elseLabel: 'si no', inputs: { COND: bool } },
  stop: { op: 'stop', cat: 'control', shape: 'stack', label: 'detener todo', cap: true, inputs: {} },
  // sensing
  touching: { op: 'touching', cat: 'sensing', shape: 'boolean', label: '¿tocando %OBJ?', inputs: { OBJ: menu('touch', '') } },
  keyPressed: { op: 'keyPressed', cat: 'sensing', shape: 'boolean', label: '¿tecla %KEY presionada?', inputs: { KEY: menu('key', 'espacio') } },
  // operators
  add: { op: 'add', cat: 'operators', shape: 'reporter', label: '%A + %B', inputs: { A: num(''), B: num('') } },
  sub: { op: 'sub', cat: 'operators', shape: 'reporter', label: '%A - %B', inputs: { A: num(''), B: num('') } },
  random: { op: 'random', cat: 'operators', shape: 'reporter', label: 'número al azar entre %A y %B', inputs: { A: num(1), B: num(10) } },
  gt: { op: 'gt', cat: 'operators', shape: 'boolean', label: '%A > %B', inputs: { A: num(''), B: num(50) } },
  lt: { op: 'lt', cat: 'operators', shape: 'boolean', label: '%A < %B', inputs: { A: num(''), B: num(50) } },
  eq: { op: 'eq', cat: 'operators', shape: 'boolean', label: '%A = %B', inputs: { A: num(''), B: num(50) } },
  and: { op: 'and', cat: 'operators', shape: 'boolean', label: '%A y %B', inputs: { A: bool, B: bool } },
  // variables
  var: { op: 'var', cat: 'variables', shape: 'reporter', label: '$VAR', inputs: { VAR: menu('var', 'puntos') } },
  setVar: { op: 'setVar', cat: 'variables', shape: 'stack', label: 'fijar %VAR a %V', inputs: { VAR: menu('var', 'puntos'), V: num(0) } },
  changeVar: { op: 'changeVar', cat: 'variables', shape: 'stack', label: 'cambiar %VAR en %V', inputs: { VAR: menu('var', 'puntos'), V: num(1) } },
  // the game's own
  win: { op: 'win', cat: 'game', shape: 'stack', label: 'ganar', cap: true, inputs: {} },
  lose: { op: 'lose', cat: 'game', shape: 'stack', label: 'perder', cap: true, inputs: {} },
};

export const spec = (op: Op): BlockSpec => SPECS[op];
export const isValueShape = (s: Shape) => s === 'reporter' || s === 'boolean';
export const hasMouths = (s: Shape) => s === 'c' || s === 'e';
export const mouthCount = (s: Shape) => (s === 'e' ? 2 : s === 'c' ? 1 : 0);

/** The categories in the palette's order, with Scratch 3's Spanish names and colours (softened to sit on paper). */
export const CATS: readonly { id: Cat; name: string; fill: string; dark: string }[] = [
  { id: 'events', name: 'Eventos', fill: '#f5c64f', dark: '#d9a52a' },
  { id: 'motion', name: 'Movimiento', fill: '#7aa6e8', dark: '#5585cc' },
  { id: 'looks', name: 'Apariencia', fill: '#ad93e3', dark: '#8a6dc9' },
  { id: 'sound', name: 'Sonido', fill: '#d892d8', dark: '#bb6dbb' },
  { id: 'control', name: 'Control', fill: '#f6b45a', dark: '#dd9233' },
  { id: 'sensing', name: 'Sensores', fill: '#78c1dc', dark: '#4fa3c2' },
  { id: 'operators', name: 'Operadores', fill: '#84c777', dark: '#5ea852' },
  { id: 'variables', name: 'Variables', fill: '#f39657', dark: '#d97332' },
  { id: 'game', name: 'Juego', fill: '#ec7f8e', dark: '#cf5a6b' },
];
export const catOf = (c: Cat) => CATS.find((x) => x.id === c)!;

/** The palette, by category, in Scratch's order (only what the game needs). */
export const PALETTE: Record<Cat, readonly Op[]> = {
  events: ['flag', 'key', 'receive', 'broadcast'],
  motion: ['changeX', 'setX', 'changeY', 'setY', 'goto', 'move', 'xpos', 'ypos'],
  looks: ['sayFor', 'say', 'costume', 'show', 'hide'],
  sound: ['sound'],
  control: ['wait', 'repeat', 'forever', 'if', 'ifElse', 'stop'],
  sensing: ['touching', 'keyPressed'],
  operators: ['add', 'sub', 'random', 'lt', 'gt', 'eq', 'and'],
  variables: ['var', 'setVar', 'changeVar'],
  game: ['win', 'lose'],
};

// ------------------------------------------------------------------ dropdowns

/** Scratch's Spanish key names, and the keyboard key each one means. */
export const KEYS: readonly { name: string; key: string }[] = [
  { name: 'espacio', key: ' ' },
  { name: 'flecha arriba', key: 'ArrowUp' },
  { name: 'flecha abajo', key: 'ArrowDown' },
  { name: 'flecha izquierda', key: 'ArrowLeft' },
  { name: 'flecha derecha', key: 'ArrowRight' },
];
export const keyName = (key: string): string | null => KEYS.find((k) => k.key === key || k.key.toLowerCase() === key.toLowerCase())?.name ?? null;

export const VARS = ['puntos', 'vidas', 'velocidad', 'poder'] as const;
export type VarName = (typeof VARS)[number];
export const MESSAGES = ['choque', 'punto', 'poder'] as const;
export const SOUNDS = ['salto', 'punto', 'choque', 'ganar'] as const;
/** The `touching` menu's extra option (Scratch: "borde"). */
export const EDGE = 'borde';

// ------------------------------------------------------------------ label parsing

export type LabelToken = { t: 'text'; s: string } | { t: 'icon'; s: 'flag' } | { t: 'input'; name: string } | { t: 'name'; name: string };

const cache = new Map<string, LabelToken[]>();

/** A label split into its words, icons and inputs. */
export function tokens(label: string): LabelToken[] {
  const hit = cache.get(label);
  if (hit) return hit;
  const out: LabelToken[] = [];
  const re = /(%[A-Z]+|\$[A-Z]+|@flag)/g;
  let at = 0;
  for (const m of label.matchAll(re)) {
    const s = label.slice(at, m.index).trim();
    if (s) out.push({ t: 'text', s });
    const tok = m[0];
    if (tok === '@flag') out.push({ t: 'icon', s: 'flag' });
    else if (tok[0] === '%') out.push({ t: 'input', name: tok.slice(1) });
    else out.push({ t: 'name', name: tok.slice(1) });
    at = (m.index ?? 0) + tok.length;
  }
  const rest = label.slice(at).trim();
  if (rest) out.push({ t: 'text', s: rest });
  cache.set(label, out);
  return out;
}

/** The block as one line of text (Scratch's Spanish), for the data and the tests: inputs in brackets. */
export function labelText(op: Op, values: Record<string, string> = {}): string {
  return tokens(SPECS[op].label).map((k) => (k.t === 'text' ? k.s : k.t === 'icon' ? 'bandera verde' : k.t === 'name' ? values[k.name] ?? SPECS[op].inputs[k.name]?.def ?? '' : `[${values[k.name] ?? SPECS[op].inputs[k.name]?.def ?? ''}]`)).join(' ');
}
