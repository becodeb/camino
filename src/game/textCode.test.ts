import { describe, expect, it } from 'vitest';
import { openBoard } from '../curriculum/boards';
import { simulate } from './engine';
import type { Program } from './model';
import {
  MAX_CHARS, colorLine, fromProgram, keyLines, lineKeys, parseText, runText, spoken, storedText, suggest, toProgram,
  type Stmt, type TextErrorKind,
} from './textCode';

const code = (t: string): Stmt[] => {
  const p = parseText(t);
  if (!p.ok) throw new Error(p.error.show);
  return p.code;
};
const error = (t: string) => {
  const p = parseText(t);
  if (p.ok) throw new Error(`parsed: ${t}`);
  return p.error;
};

describe('parseText: every valid form', () => {
  it('reads the four arrows and the jump', () => {
    expect(code('derecha()\nizquierda()\narriba()\nabajo()\nsaltar()')).toEqual([
      { k: 'call', name: 'derecha', line: 1 }, { k: 'call', name: 'izquierda', line: 2 }, { k: 'call', name: 'arriba', line: 3 },
      { k: 'call', name: 'abajo', line: 4 }, { k: 'call', name: 'saltar', line: 5 },
    ]);
  });

  it('reads a for with any loop name and spaces around the signs', () => {
    expect(code('for vez in range ( 3 ) :\n    derecha()')).toEqual([{ k: 'for', count: 3, line: 1, body: [{ k: 'call', name: 'derecha', line: 2 }] }]);
    expect(code('for i in range(0):\n  arriba()')[0]).toMatchObject({ k: 'for', count: 0 });
  });

  it('reads an if, alone and inside a loop', () => {
    expect(code('for i in range(4):\n    if hay_piedra():\n        saltar()\n    derecha()')).toEqual([{
      k: 'for', count: 4, line: 1, body: [
        { k: 'if', line: 2, then: [{ k: 'call', name: 'saltar', line: 3 }] },
        { k: 'call', name: 'derecha', line: 4 },
      ],
    }]);
    expect(code('derecha()\nif hay_piedra():\n    saltar()\nderecha()')).toEqual([
      { k: 'call', name: 'derecha', line: 1 }, { k: 'if', line: 2, then: [{ k: 'call', name: 'saltar', line: 3 }] }, { k: 'call', name: 'derecha', line: 4 },
    ]);
  });

  it('has no while and no else (T16: one idea at a time)', () => {
    expect(error('while not llegue():\n    derecha()').kind).toBe('unknown_name');
    expect(error('if hay_piedra():\n    saltar()\nelse:\n    derecha()')).toMatchObject({ kind: 'unknown_name', line: 3 });
  });

  it('skips empty lines, takes a tab as four spaces and ignores trailing spaces and \\r', () => {
    expect(code('\nderecha()   \r\n\n\tarriba()'.replace('\tarriba()', 'for i in range(2):\n\tarriba()'))).toHaveLength(2);
    expect(code('for i in range(2):\n\tarriba()\n    abajo()')[0]).toMatchObject({ body: [{ name: 'arriba' }, { name: 'abajo' }] });
  });

  it('ends a body where the indentation goes back', () => {
    expect(code('for i in range(2):\n    arriba()\nderecha()')).toHaveLength(2);
    expect(code('for i in range(2):\n        arriba()\n        derecha()\nabajo()')).toHaveLength(2);
  });
});

describe('parseText: each error kind, with its line', () => {
  const cases: [string, TextErrorKind, number][] = [
    ['', 'empty', 1],
    ['   \n\n', 'empty', 1],
    ['derecha()\nderecha();', 'bad_char', 2],
    ['derecha()\n"hola"', 'bad_char', 2],
    ['arriba()\nderecha()\ndrecha()', 'unknown_name', 3],
    ['avansar()', 'unknown_name', 1],
    ['Derecha()', 'uppercase', 1],
    ['For i in range(2):\n    derecha()', 'uppercase', 1],
    ['derecha', 'missing_paren', 1],
    ['arriba()\nderecha(', 'missing_paren', 2],
    ['derecha)', 'missing_paren', 1],
    ['for i in range 3:\n    derecha()', 'missing_paren', 1],
    ['for i in range(3:\n    derecha()', 'missing_paren', 1],
    ['if hay_piedra:\n    saltar()', 'missing_paren', 1],
    ['derecha(2)', 'extra_args', 1],
    ['for i in range(2)\n    derecha()', 'missing_colon', 1],
    ['arriba()\nfor i in range(2)\n    derecha()', 'missing_colon', 2],
    ['if hay_piedra()\n    saltar()', 'missing_colon', 1],
    ['for i in range(x):\n    derecha()', 'bad_number', 1],
    ['for i in range(21):\n    derecha()', 'big_number', 1],
    ['for i in range(3): derecha()', 'same_line', 1],
    ['derecha():', 'extra', 1],
    ['for i range(3):\n    derecha()', 'bad_line', 1],
    ['range(3)', 'bad_line', 1],
    ['3', 'bad_line', 1],
    ['for i in range(2):\nderecha()', 'missing_indent', 2],
    ['derecha()\n    arriba()', 'unexpected_indent', 2],
    ['  derecha()', 'unexpected_indent', 1],
    ['for i in range(2):\n    arriba()\n  derecha()', 'bad_indent', 3],
    ['for i in range(2):', 'empty_block', 1],
    ['for i in range(3):\n    if hay_piedra():\n        \n    derecha()', 'empty_block', 2],
    ['for i in range(2):\n    for j in range(2):\n        derecha()', 'nesting', 2],
    ['if hay_piedra():\n    if hay_piedra():\n        saltar()', 'nesting', 2],
    ['if hay_piedra():\n    for i in range(2):\n        saltar()', 'nesting', 2],
    [Array(31).fill('derecha()').join('\n'), 'too_long', 1],
    ['derecha()\n'.repeat(60), 'too_long', 1],
  ];
  it.each(cases)('%j → %s at line %d', (text, kind, line) => {
    const e = error(text);
    expect(e.kind).toBe(kind);
    expect(e.line).toBe(line);
    expect(e.show.length).toBeGreaterThan(10);
    expect(e.show).not.toMatch(/undefined|Error|at \w+ \(/);
  });

  it('says the error in words a child hears: the line, the slip and the likely word', () => {
    expect(error('for i in range(2):\n    derecha(').show).toBe('Me parece que falta un paréntesis en la línea 2.');
    expect(error('for i in range(2)\n    derecha()').show).toBe('Me parece que faltan los dos puntos al final de la línea 1.');
    const e = error('arriba()\ndrecha()');
    expect(e).toMatchObject({ word: 'drecha', suggestion: 'derecha' });
    expect(e.show).toBe('En la línea 2 dice «drecha» y esa palabra no la conozco. ¿Será «derecha»?');
    expect(error('if hay_piedr():\n    saltar()')).toMatchObject({ kind: 'unknown_name', suggestion: 'hay_piedra' });
    expect(error('fro i in range(2):\n    derecha()')).toMatchObject({ kind: 'unknown_name', suggestion: 'for' });
    expect(error('for i in rnage(2):\n    derecha()')).toMatchObject({ kind: 'unknown_name', suggestion: 'range' });
    expect(error('avansar()').suggestion).toBeUndefined();
    expect(error('for i in range(2):').show).toBe('Después de la línea 1 falta lo que va adentro del for.');
  });

  it('speaks code without its punctuation', () => {
    expect(spoken('¿Será «hay_piedra()»?')).toBe('¿Será hay piedra?');
    expect(error('saltar(2)').say).toBe('En la línea 1, entre los paréntesis no va nada: saltar.');
  });

  it('suggests only close words', () => {
    expect(suggest('saltr')).toBe('saltar');
    expect(suggest('abjo')).toBe('abajo');
    expect(suggest('pepe')).toBeNull();
    expect(suggest('fr')).toBe('for');
  });
});

describe('runText', () => {
  const row = openBoard({ cols: 9, rows: 1, start: [0, 0], goal: [8, 0], seed: 1, rocks: [[2, 0], [5, 0]] });
  const grid = openBoard({ cols: 5, rows: 4, start: [0, 3], goal: [2, 0], seed: 2, rocks: [[4, 0]] });

  it('names the line of every step', () => {
    const r = runText(grid, code('derecha()\nfor i in range(3):\n    arriba()\nderecha()'));
    expect(r.trace.outcome).toBe('win');
    expect(r.lines).toEqual([1, 3, 3, 3, 4]);
    expect(r.trace.steps.map((s) => s.ref)).toEqual([{ item: 0 }, { item: 1, inner: 0, iter: 0 }, { item: 1, inner: 0, iter: 1 }, { item: 1, inner: 0, iter: 2 }, { item: 2 }]);
  });

  it('lights the if while it looks and the saltar() while it jumps', () => {
    const r = runText(row, code('for i in range(6):\n    if hay_piedra():\n        saltar()\n    derecha()'));
    expect(r.trace.outcome).toBe('win');
    expect(r.trace.steps.map((s) => s.kind)).toEqual(['look', 'move', 'jump', 'move', 'jump', 'move', 'look', 'move']);
    expect(r.lines).toEqual([2, 4, 3, 4, 3, 4, 2, 4]);
  });

  it('runs an if with another body', () => {
    const bump = runText(row, code('derecha()\nif hay_piedra():\n    derecha()'));
    expect(bump.trace.outcome).toBe('crash');
    expect(bump.lines).toEqual([1, 3]);
    const look = runText(row, code('if hay_piedra():\n    derecha()'));
    expect(look.trace.steps.map((s) => s.kind)).toEqual(['look']);
    expect(look.lines).toEqual([1]);
  });

  it('stops at a bump and at the seed, and says short otherwise', () => {
    expect(runText(row, code('derecha()\nderecha()\nderecha()')).trace).toMatchObject({ outcome: 'crash', crashAt: 1 });
    expect(runText(grid, code('for i in range(3):\n    izquierda()')).trace.outcome).toBe('crash');
    expect(runText(grid, code('for i in range(20):\n    arriba()\n    derecha()')).trace.outcome).toBe('win');
    expect(runText(row, code('derecha()')).trace.outcome).toBe('short');
  });

  const programs: string[] = [
    'derecha()\nfor i in range(3):\n    arriba()\nderecha()',
    'for i in range(4):\n    if hay_piedra():\n        saltar()\n    derecha()',
    'derecha()\nif hay_piedra():\n    saltar()\nderecha()',
    'for i in range(3):\n    derecha()',
    'saltar()\nsaltar()\nfor i in range(2):\n    derecha()',
    'arriba()\nfor i in range(0):\n    derecha()\nabajo()',
    'if hay_piedra():\n    saltar()\nderecha()\nif hay_piedra():\n    saltar()',
  ];
  it.each(programs)('runs like the engine: %j', (t) => {
    for (const b of [row, grid]) {
      const c = code(t);
      const a = runText(b, c).trace;
      const e = simulate(b, toProgram(c)!);
      expect(a).toEqual(e);
    }
  });
});

describe('text ↔ blocks', () => {
  const programs: Program[] = [
    [{ t: 'cmd', cmd: 'right' }, { t: 'loop', count: 3, body: ['up', 'right'] }],
    [{ t: 'loop', count: 4, body: ['ifrock:right', 'right'] }],
    [{ t: 'cmd', cmd: 'jump:right' }, { t: 'cmd', cmd: 'ifrock:right' }, { t: 'cmd', cmd: 'left' }, { t: 'cmd', cmd: 'down' }],
    [{ t: 'loop', count: 7, body: ['up'] }, { t: 'loop', count: 2, body: ['ifrock:right', 'jump:right'] }],
  ];
  it.each(programs.map((p) => [JSON.stringify(p), p] as const))('round trip %s', (_, p) => {
    const t = fromProgram(p)!;
    expect(t).not.toBeNull();
    expect(toProgram(code(t))).toEqual(p);
    expect(fromProgram(toProgram(code(t))!)).toBe(t);
  });

  it('writes the editor\'s own layout', () => {
    expect(fromProgram(programs[1])).toBe('for i in range(4):\n    if hay_piedra():\n        saltar()\n    derecha()');
  });

  it('has no text for blocks the subset does not have, and no blocks for text-only forms', () => {
    expect(fromProgram([{ t: 'cmd', cmd: 'jump:left' }])).toBeNull();
    expect(fromProgram([{ t: 'cmd', cmd: 'ifrock:up' }])).toBeNull();
    expect(fromProgram([{ t: 'cmd', cmd: '' }])).toBeNull();
    expect(fromProgram([{ t: 'loop', count: 2, body: [] }])).toBeNull();
    expect(fromProgram([{ t: 'loop', count: 'goal', body: ['right'] }])).toBeNull();
    expect(toProgram(code('if hay_piedra():\n    derecha()'))).toBeNull();
    expect(toProgram(code('for i in range(2):\n    if hay_piedra():\n        saltar()\n        derecha()'))).toBeNull();
  });

  it('maps each line to its block and back', () => {
    const c = code('derecha()\nfor i in range(5):\n    if hay_piedra():\n        saltar()\n    derecha()\n\narriba()');
    expect([...lineKeys(c)].sort((a, b) => a[0] - b[0])).toEqual([[1, '0'], [2, '1'], [3, '1:0'], [4, '1:0'], [5, '1:1'], [7, '2']]);
    expect(keyLines(c, '1:0')).toEqual([3, 4]);
    expect(keyLines(c, '9')).toEqual([]);
  });
});

describe('what is stored and how it is coloured', () => {
  it('keeps only the subset\'s characters, capped', () => {
    expect(storedText('Derecha();\r\n\tarriba() # ¡hola! ñandú')).toBe('derecha()\n    arriba()  hola and');
    expect(storedText('a'.repeat(900))).toHaveLength(MAX_CHARS);
  });

  it('colours keywords, calls, conditions, numbers and signs', () => {
    expect(colorLine('    for i in range(3):').map((t) => t.kind)).toEqual(['space', 'kw', 'space', 'name', 'space', 'kw', 'space', 'kw', 'punct', 'num', 'punct', 'punct']);
    expect(colorLine('if hay_piedra(): saltar() ;')).toContainEqual({ text: 'saltar', kind: 'act', action: 'saltar' });
    expect(colorLine('x;').map((t) => t.kind)).toEqual(['name', 'other']);
  });
});
