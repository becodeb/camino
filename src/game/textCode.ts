// A tiny, strict Python-like text for Camino programs (the 5to probe "Del
// bloque al texto" of the pilot playtest). Pure: parse, run on a board,
// and map text <-> the engine's Program so the same program shows as blocks
// and as text, line by line.
//
// The subset, exactly (one statement per line, 4 spaces per level; a tab
// counts as 4 spaces):
//
//   derecha()  izquierda()  arriba()  abajo()   one step, like Camino's arrows
//                                              (absolute directions: design
//                                              rule 6, there is no "avanzar")
//   saltar()                                   a jump to the right (the "saltar"
//                                              block; every Camino jump goes right)
//   for i in range(3):                         "repetir 3" (any loop variable name)
//   while not llegue():                        "repetir hasta llegar"
//   if hay_piedra():                           "si hay piedra" (looks right)
//   else:                                      only in text: blocks have no "si no"
//
// Nesting as the editor draws it: a loop holds calls and ifs; an if (and its
// else) holds calls; a loop cannot hold a loop. `if hay_piedra():` holding
// exactly `saltar()` and no else is the "si hay piedra [saltar]" block
// (`ifrock:right`); any other if runs here but has no block.
//
// Errors are for a child of 5to: one kind, one line, one short sentence in
// Rioplatense Spanish (`show` on screen, `say` for the speech), never a
// stack trace.

import { MAX_PASSES, applyCommand } from './engine';
import { initialState, isHole, isWin, obstacleAt, type Board, type CardRef, type Program, type RobotState, type Trace, type TraceStep } from './model';

export type Action = 'derecha' | 'izquierda' | 'arriba' | 'abajo' | 'saltar';

/** Each call and the engine command it is. */
export const ACTION_CMD: Record<Action, string> = { derecha: 'right', izquierda: 'left', arriba: 'up', abajo: 'down', saltar: 'jump:right' };
const CMD_ACTION: Record<string, Action> = Object.fromEntries(Object.entries(ACTION_CMD).map(([a, c]) => [c, a as Action]));
const isAction = (w: string): w is Action => w in ACTION_CMD;

export type IfStmt = { k: 'if'; line: number; then: Stmt[]; else: Stmt[] | null; elseLine?: number };
export type Stmt =
  | { k: 'call'; name: Action; line: number }
  | { k: 'for'; count: number; line: number; body: Stmt[] }
  | { k: 'while'; line: number; body: Stmt[] }
  | IfStmt;

export type TextErrorKind =
  | 'empty' | 'too_long' | 'bad_char' | 'unknown_name' | 'uppercase' | 'missing_paren' | 'extra_args' | 'missing_colon'
  | 'bad_number' | 'big_number' | 'same_line' | 'extra' | 'bad_line' | 'missing_indent' | 'unexpected_indent'
  | 'bad_indent' | 'empty_block' | 'else_without_if' | 'nesting';

export const TEXT_ERROR_KINDS: readonly TextErrorKind[] = [
  'empty', 'too_long', 'bad_char', 'unknown_name', 'uppercase', 'missing_paren', 'extra_args', 'missing_colon',
  'bad_number', 'big_number', 'same_line', 'extra', 'bad_line', 'missing_indent', 'unexpected_indent',
  'bad_indent', 'empty_block', 'else_without_if', 'nesting',
];

export interface TextError {
  kind: TextErrorKind;
  /** 1-based, as the editor numbers them. */
  line: number;
  /** On screen (code in «»). */
  show: string;
  /** For the speech: the same sentence without code punctuation. */
  say: string;
  /** The word concerned, and the one the child probably meant. */
  word?: string;
  suggestion?: string;
}

export type Parsed = { ok: true; code: Stmt[] } | { ok: false; error: TextError };

export const MAX_CHARS = 500;
export const MAX_LINES = 30;
export const MAX_COUNT = 20;
export const INDENT = '    ';

// ------------------------------------------------------------------ words

const KEYWORDS = ['for', 'in', 'range', 'while', 'not', 'llegue', 'if', 'hay_piedra', 'else'] as const;
const KNOWN: readonly string[] = [...Object.keys(ACTION_CMD), ...KEYWORDS];

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // a swap of two letters is one slip
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const plain = (w: string) => w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The known word a slip probably meant (accents and case forgiven, at most two slips), or null. */
export function suggest(word: string, among: readonly string[] = KNOWN): string | null {
  const w = plain(word);
  let best: string | null = null, bestD = Infinity;
  for (const k of among) {
    const d = distance(w, k);
    if (d < bestD) { best = k; bestD = d; }
  }
  const max = w.length <= 3 ? 1 : 2;
  return bestD <= max ? best : null;
}

// ------------------------------------------------------------------ errors

const CTX_WORD: Record<'for' | 'while' | 'if' | 'else', string> = { for: 'for', while: 'while', if: 'if', else: 'else' };

function err(kind: TextErrorKind, line: number, o: { word?: string; suggestion?: string; ctx?: string; hint?: string } = {}): TextError {
  const n = line;
  const w = o.word ?? '';
  const show = ((): string => {
    switch (kind) {
      case 'empty': return 'El programa está vacío. Escribí algo.';
      case 'too_long': return 'El programa es muy largo. Probá con uno más corto.';
      case 'bad_char': return `En la línea ${n} hay un signo que no va: «${w}».`;
      case 'unknown_name': return o.suggestion
        ? `En la línea ${n} dice «${w}» y esa palabra no la conozco. ¿Será «${o.suggestion}»?`
        : `En la línea ${n} dice «${w}» y esa palabra no la conozco.`;
      case 'uppercase': return `En la línea ${n}, «${w}» va todo en minúscula: «${o.suggestion}».`;
      case 'missing_paren': return `Me parece que falta un paréntesis en la línea ${n}.`;
      case 'extra_args': return `En la línea ${n}, entre los paréntesis no va nada: «${w}()».`;
      case 'missing_colon': return `Me parece que faltan los dos puntos al final de la línea ${n}.`;
      case 'bad_number': return `En la línea ${n}, adentro de range() va un número.`;
      case 'big_number': return `En la línea ${n} el número es muy grande. Probá con uno hasta ${MAX_COUNT}.`;
      case 'same_line': return `En la línea ${n}, lo que va adentro del ${o.ctx} va en la línea de abajo, corrido.`;
      case 'extra': return `En la línea ${n} sobra algo al final: «${w}».`;
      case 'bad_line': return o.hint ? `No entiendo la línea ${n}. Tiene que ser así: «${o.hint}».` : `No entiendo la línea ${n}.`;
      case 'missing_indent': return `La línea ${n} tiene que ir corrida, con espacios adelante, para quedar adentro del ${o.ctx}.`;
      case 'unexpected_indent': return `La línea ${n} está corrida y no hace falta. Sacale los espacios de adelante.`;
      case 'bad_indent': return `La línea ${n} no está alineada con las de arriba.`;
      case 'empty_block': return `Después de la línea ${n} falta lo que va adentro del ${o.ctx}.`;
      case 'else_without_if': return `En la línea ${n} hay un else sin su if arriba.`;
      case 'nesting': return `En la línea ${n} hay un ${w} adentro de un ${o.ctx}. Eso todavía no se puede.`;
    }
  })();
  return { kind, line, show, say: spoken(show), ...(o.word != null ? { word: o.word } : {}), ...(o.suggestion ? { suggestion: o.suggestion } : {}) };
}

/** A sentence for the speech: code without its punctuation ("hay_piedra()" → "hay piedra"). */
export function spoken(s: string): string {
  return s.replace(/«([^»]*)»/g, (_, code: string) => code.replace(/\(\)/g, '').replace(/[_():]/g, ' ').replace(/\s+/g, ' ').trim());
}

// ------------------------------------------------------------------ one line

type Tok = { t: 'id'; v: string } | { t: 'num'; v: string } | { t: 'p'; v: '(' | ')' | ':' } | { t: 'bad'; v: string };
type LineNode = { k: 'call'; name: Action } | { k: 'for'; count: number } | { k: 'while' } | { k: 'if' } | { k: 'else' };

function tokens(s: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:([\p{L}_][\p{L}\p{N}_]*)|(\d+)|([():])|(\S))/uy;
  let m: RegExpExecArray | null;
  while (re.lastIndex < s.length && (m = re.exec(s))) {
    if (m[1]) out.push({ t: 'id', v: m[1] });
    else if (m[2]) out.push({ t: 'num', v: m[2] });
    else if (m[3]) out.push({ t: 'p', v: m[3] as '(' | ')' | ':' });
    else if (m[4]) out.push({ t: 'bad', v: m[4] });
  }
  return out;
}

type Pat = string | '(' | ')' | ':' | { id: true } | { num: true };
const HINT = { for: 'for i in range(3):', while: 'while not llegue():', if: 'if hay_piedra():', else: 'else:' };

/**
 * Matches `ts` against a pattern and names the first thing wrong. `head`
 * is the statement's first word (for the hint), `name` the call's name.
 */
function match(ts: Tok[], pat: Pat[], line: number, head: keyof typeof HINT | null, name?: string): TextError | null {
  const hint = head ? HINT[head] : name ? `${name}()` : undefined;
  for (let i = 0; i < pat.length; i++) {
    const p = pat[i];
    const g = ts[i];
    if (typeof p === 'object' && 'id' in p) {
      if (g?.t === 'id') continue;
      return err('bad_line', line, { hint });
    }
    if (typeof p === 'object' && 'num' in p) {
      if (g?.t === 'num') {
        if (Number(g.v) > MAX_COUNT) return err('big_number', line);
        continue;
      }
      return err('bad_number', line);
    }
    if (p === '(' || p === ')') {
      if (g?.t === 'p' && g.v === p) continue;
      // something inside a call's parentheses
      if (p === ')' && name && g && (g.t === 'id' || g.t === 'num')) return err('extra_args', line, { word: name });
      return err('missing_paren', line);
    }
    if (p === ':') {
      if (g?.t === 'p' && g.v === ':') continue;
      if (!g) return err('missing_colon', line);
      return err('extra', line, { word: g.v });
    }
    // a word
    if (g?.t === 'id' && g.v === p) continue;
    if (g?.t === 'id') {
      if (g.v.toLowerCase() === p) return err('uppercase', line, { word: g.v, suggestion: p });
      const s = suggest(g.v, [p]);
      return s ? err('unknown_name', line, { word: g.v, suggestion: s }) : err('bad_line', line, { hint });
    }
    return err('bad_line', line, { hint });
  }
  if (ts.length > pat.length) {
    const g = ts[pat.length];
    // `for i in range(3): derecha()`: Python allows it, the editor does not
    if (head && head !== 'else' && pat[pat.length - 1] === ':') return err('same_line', line, { ctx: CTX_WORD[head] });
    if (head === 'else') return err('same_line', line, { ctx: 'else' });
    return err('extra', line, { word: g.v });
  }
  return null;
}

function parseLine(content: string, line: number): LineNode | TextError {
  const ts = tokens(content);
  const bad = ts.find((t) => t.t === 'bad');
  if (bad) return err('bad_char', line, { word: bad.v });
  const first = ts[0];
  if (first.t !== 'id') return err('bad_line', line);
  const w = first.v;
  if (w !== w.toLowerCase() && KNOWN.includes(w.toLowerCase())) return err('uppercase', line, { word: w, suggestion: w.toLowerCase() });
  switch (w) {
    case 'for': {
      const e = match(ts, ['for', { id: true }, 'in', 'range', '(', { num: true }, ')', ':'], line, 'for');
      return e ?? { k: 'for', count: Number((ts[5] as { v: string }).v) };
    }
    case 'while': return match(ts, ['while', 'not', 'llegue', '(', ')', ':'], line, 'while') ?? { k: 'while' };
    case 'if': return match(ts, ['if', 'hay_piedra', '(', ')', ':'], line, 'if') ?? { k: 'if' };
    case 'else': return match(ts, ['else', ':'], line, 'else') ?? { k: 'else' };
  }
  if (isAction(w)) return match(ts, [w, '(', ')'], line, null, w) ?? { k: 'call', name: w };
  const s = suggest(w);
  // a known word where a statement cannot start ("range(3)", "hay_piedra()") is a line out of place
  if (s === w) return err('bad_line', line);
  return err('unknown_name', line, { word: w, ...(s ? { suggestion: s } : {}) });
}

// ------------------------------------------------------------------ the program

interface Entry { line: number; indent: number; node: LineNode }

/** Parses a program; the first error wins (lines top to bottom, then the structure). */
export function parseText(text: string): Parsed {
  const raw = text.replace(/\r/g, '').split('\n');
  if (text.length > MAX_CHARS || raw.length > MAX_LINES) return { ok: false, error: err('too_long', 1) };
  const entries: Entry[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i].replace(/\t/g, INDENT);
    if (!s.trim()) continue;
    const node = parseLine(s.trim(), i + 1);
    if ('kind' in node) return { ok: false, error: node };
    entries.push({ line: i + 1, indent: s.length - s.trimStart().length, node });
  }
  if (!entries.length) return { ok: false, error: err('empty', 1) };

  let i = 0;
  const isBlank = (line: number) => line - 1 < raw.length && !raw[line - 1].trim();
  type Ctx = 'top' | 'for' | 'while' | 'if' | 'else';

  const block = (indent: number, ctx: Ctx): Stmt[] => {
    const out: Stmt[] = [];
    while (i < entries.length) {
      const e = entries[i];
      if (e.indent < indent) break;
      if (e.indent > indent) {
        const last = out[out.length - 1];
        throw err(last && last.k !== 'call' ? 'bad_indent' : 'unexpected_indent', e.line);
      }
      const n = e.node;
      if (n.k === 'else') {
        const prev = out[out.length - 1];
        if (!prev || prev.k !== 'if' || prev.else) throw err('else_without_if', e.line);
        i++;
        prev.else = body(e, 'else');
        prev.elseLine = e.line;
        continue;
      }
      if (n.k === 'call') { out.push({ k: 'call', name: n.name, line: e.line }); i++; continue; }
      if (n.k === 'for' || n.k === 'while') {
        if (ctx !== 'top') throw err('nesting', e.line, { word: n.k, ctx: ctx === 'else' ? 'else' : ctx });
        i++;
        const b = body(e, n.k);
        out.push(n.k === 'for' ? { k: 'for', count: n.count, line: e.line, body: b } : { k: 'while', line: e.line, body: b });
        continue;
      }
      // if
      if (ctx === 'if' || ctx === 'else') throw err('nesting', e.line, { word: 'if', ctx });
      i++;
      out.push({ k: 'if', line: e.line, then: body(e, 'if'), else: null });
    }
    return out;
  };

  const body = (head: Entry, ctx: Exclude<Ctx, 'top'>): Stmt[] => {
    const next = entries[i];
    if (!next || next.indent <= head.indent) {
      // the line right under the header is empty (the child has not written it yet), or nothing follows
      if (!next || isBlank(head.line + 1)) throw err('empty_block', head.line, { ctx: CTX_WORD[ctx] });
      throw err('missing_indent', next.line, { ctx: CTX_WORD[ctx] });
    }
    return block(next.indent, ctx);
  };

  if (entries[0].indent > 0) return { ok: false, error: err('unexpected_indent', entries[0].line) };
  try {
    const code = block(0, 'top');
    if (i < entries.length) throw err('unexpected_indent', entries[i].line);
    return { ok: true, code };
  } catch (e) {
    if (e && typeof e === 'object' && 'kind' in e) return { ok: false, error: e as TextError };
    throw e;
  }
}

// ------------------------------------------------------------------ running

/** An if that is the "si hay piedra [saltar]" block. */
export const isRockJump = (s: IfStmt) => !s.else && s.then.length === 1 && s.then[0].k === 'call' && s.then[0].name === 'saltar';

export interface TextRun {
  trace: Trace;
  /** The line each step of the trace comes from (1-based). */
  lines: number[];
}

/**
 * Runs a parsed program on a board, step by step like the engine's
 * `simulate` (for a program that has blocks the trace is the same, refs
 * included: the tests check it), and says which line each step comes from.
 * An if looks right: a rock there runs its body, otherwise its else; with
 * nothing to do the character only looks (a `look` step, as the block does).
 */
export function runText(b: Board, code: Stmt[], opts: { from?: RobotState } = {}): TextRun {
  let s = opts.from ?? initialState(b);
  const steps: TraceStep[] = [];
  const lines: number[] = [];
  const exec = (cmd: string, ref: CardRef, line: number): 'go' | 'stop' => {
    const st = applyCommand(b, cmd, s);
    steps.push({ index: steps.length, cmd, ref, ...st });
    lines.push(line);
    s = st.to;
    return st.kind === 'crash' || st.won ? 'stop' : 'go';
  };
  const run = (st: Stmt, ref: CardRef): 'go' | 'stop' => {
    if (st.k === 'call') return exec(ACTION_CMD[st.name], ref, st.line);
    if (st.k !== 'if') throw new Error('a loop inside a loop');
    const rock = !!obstacleAt(b, s.c + 1, s.r);
    if (isRockJump(st)) return exec('ifrock:right', ref, rock ? st.then[0].line : st.line);
    const branch = rock ? st.then : st.else;
    if (!branch?.length) return exec('ifrock:right', ref, st.line); // nothing to do: a look (never a rock here)
    for (const c of branch) if (run(c, ref) === 'stop') return 'stop';
    return 'go';
  };
  const finish = (): TextRun => {
    const last = steps[steps.length - 1];
    const trace: Trace = last?.kind === 'crash'
      ? { steps, final: s, outcome: 'crash', crashAt: last.index }
      : last?.won || isWin(b, s) ? { steps, final: s, outcome: 'win' } : { steps, final: s, outcome: 'short' };
    return { trace, lines };
  };

  const stateKey = (r: RobotState) => `${r.c},${r.r},${r.mask}`;
  for (let item = 0; item < code.length; item++) {
    const st = code[item];
    if (st.k === 'call' || st.k === 'if') {
      if (run(st, { item }) === 'stop') return finish();
      continue;
    }
    const passes = st.k === 'while' ? MAX_PASSES : st.count;
    const starts = new Set<string>();
    for (let iter = 0; iter < passes; iter++) {
      if (st.k === 'while' && isWin(b, s)) break;
      if (!st.body.length) break;
      if (st.k === 'while') {
        if (starts.has(stateKey(s))) break;
        starts.add(stateKey(s));
      }
      for (let inner = 0; inner < st.body.length; inner++) {
        if (run(st.body[inner], { item, inner, iter }) === 'stop') return finish();
      }
    }
  }
  return finish();
}

// ------------------------------------------------------------------ text <-> blocks

/** The engine command of one statement inside a program (a call, or the rock-jump if), or null. */
function cmdOf(st: Stmt): string | null {
  if (st.k === 'call') return ACTION_CMD[st.name];
  if (st.k === 'if' && isRockJump(st)) return 'ifrock:right';
  return null;
}

/** The blocks of a parsed program, or null when it has no blocks (an else, another kind of if). */
export function toProgram(code: Stmt[]): Program | null {
  const out: Program = [];
  for (const st of code) {
    if (st.k === 'for' || st.k === 'while') {
      const body = st.body.map(cmdOf);
      if (body.some((c) => c == null)) return null;
      out.push({ t: 'loop', count: st.k === 'while' ? 'goal' : st.count, body: body as string[] });
      continue;
    }
    const c = cmdOf(st);
    if (c == null) return null;
    out.push({ t: 'cmd', cmd: c });
  }
  return out;
}

function linesOfCmd(cmd: string, pad: string): string[] | null {
  if (cmd === 'ifrock:right') return [`${pad}if hay_piedra():`, `${pad}${INDENT}saltar()`];
  const a = CMD_ACTION[cmd];
  return a ? [`${pad}${a}()`] : null;
}

/**
 * The text of a block program, as the editor writes it (4 spaces, `i` as
 * the loop's name), or null when a block has no text: an empty line, a jump
 * or a "si" to another side, an empty repeat.
 */
export function fromProgram(p: Program): string | null {
  const out: string[] = [];
  for (const it of p) {
    if (it.t === 'cmd') {
      if (isHole(it.cmd)) return null;
      const l = linesOfCmd(it.cmd, '');
      if (!l) return null;
      out.push(...l);
      continue;
    }
    if (!it.body.length) return null;
    out.push(it.count === 'goal' ? 'while not llegue():' : `for i in range(${it.count}):`);
    for (const c of it.body) {
      if (isHole(c)) return null;
      const l = linesOfCmd(c, INDENT);
      if (!l) return null;
      out.push(...l);
    }
  }
  return out.join('\n');
}

/**
 * Which block each line is (its ref key in the notebook, BlockEditor's
 * `data-ref`): a top statement is block `item`, a statement in a loop is
 * `item:inner`; an if's header, body and else all belong to its block.
 */
export function lineKeys(code: Stmt[]): Map<number, string> {
  const m = new Map<number, string>();
  const mark = (st: Stmt, key: string) => {
    m.set(st.line, key);
    if (st.k === 'if') {
      st.then.forEach((c) => mark(c, key));
      if (st.elseLine) m.set(st.elseLine, key);
      st.else?.forEach((c) => mark(c, key));
    }
  };
  code.forEach((st, item) => {
    if (st.k === 'for' || st.k === 'while') {
      m.set(st.line, `${item}`);
      st.body.forEach((c, inner) => mark(c, `${item}:${inner}`));
    } else mark(st, `${item}`);
  });
  return m;
}

/** The lines of one block (the reverse of lineKeys). */
export function keyLines(code: Stmt[], key: string): number[] {
  return [...lineKeys(code)].filter(([, k]) => k === key).map(([l]) => l).sort((a, b) => a - b);
}

// ------------------------------------------------------------------ what is stored

/**
 * The child's program as stored in the data: only the subset's characters
 * (a–z, digits, `_`, `(`, `)`, `:`, spaces, newlines; capitals lowered,
 * anything else dropped) and at most MAX_CHARS of them. It is code, not free
 * text: nothing else a keyboard can type reaches the database.
 */
export function storedText(t: string): string {
  return t.replace(/\r/g, '').replace(/\t/g, INDENT).toLowerCase().replace(/[^a-z0-9_():\n ]/g, '').slice(0, MAX_CHARS);
}

/** A word of the text and how it is coloured (the editor's syntax colours). */
export type TokenKind = 'kw' | 'act' | 'cond' | 'num' | 'punct' | 'name' | 'other' | 'space';
export interface ColorToken { text: string; kind: TokenKind; action?: Action }

/** One line split for colouring (never fails: anything unknown is `other`). */
export function colorLine(line: string): ColorToken[] {
  const out: ColorToken[] = [];
  const re = /(\s+)|([\p{L}_][\p{L}\p{N}_]*)|(\d+)|([():])|(.)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const [t, sp, id, num, p] = m;
    if (sp) out.push({ text: t, kind: 'space' });
    else if (id) {
      if (isAction(id)) out.push({ text: t, kind: 'act', action: id });
      else if (id === 'hay_piedra' || id === 'llegue') out.push({ text: t, kind: 'cond' });
      else if ((['for', 'in', 'while', 'not', 'if', 'else', 'range'] as string[]).includes(id)) out.push({ text: t, kind: 'kw' });
      else out.push({ text: t, kind: 'name' });
    } else if (num) out.push({ text: t, kind: 'num' });
    else if (p) out.push({ text: t, kind: 'punct' });
    else out.push({ text: t, kind: 'other' });
  }
  return out;
}
