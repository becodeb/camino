// Levels the playtest can play, by id: 1ro's sheets' core pages
// (`1ro-h<n>-<k>`, curriculum/primer.ts) and the demo's pages (`2do-1`,
// `3ro-2`, game/levels.ts). The program as run, written compactly for the
// `run` event (a rule game's rules too), and which runs count as failed.

import { sheetByN } from '../curriculum/primer';
import { levelById, type LevelDef } from '../game/levels';
import { isHole, type Program } from '../game/model';
import type { Rule } from '../game/rules';

/**
 * Free play's last rule-game page: 3ro page 2's falling seeds with every
 * key, every move and the point, no rules to start with and eight seeds to
 * catch. The child makes the game their own way (any rules win it).
 */
const RULES_BASE = levelById('3ro-2')!;
export const FREE_RULES: LevelDef = {
  ...RULES_BASE,
  id: 'pp-reglas',
  page: 3,
  title: 'Tu juego: armá las reglas que quieras',
  say: 'Ahora el juego es tuyo. Armá las reglas que quieras con las flechas y juntá ocho semillas.',
  blocks: ['key:left', 'key:right', 'key:up', 'key:down', 'touch:seed', 'left', 'right', 'up', 'down', 'score'],
  worlds: [{ ...RULES_BASE.worlds[0], start: { c: 3, r: 3 }, seed: 163 }],
  realtime: { ...RULES_BASE.realtime!, initial: [], win: { kind: 'score', n: 8 }, intro: undefined },
};

/** The rule game in free play: 3ro's two pages, then the child's own game. */
export const RULE_GAME_PAGES = ['3ro-1', '3ro-2', FREE_RULES.id] as const;

export function pilotLevel(id: string): LevelDef | null {
  if (id === FREE_RULES.id) return FREE_RULES;
  const m = id.match(/^1ro-h(\d+)-(\d+)$/);
  if (m) return sheetByN(Number(m[1]))?.core[Number(m[2]) - 1]?.level ?? null;
  return levelById(id) ?? null;
}

/**
 * A program as one short line: commands by id, an empty line as `_`, a
 * repeat as `rep3(right up)` or `repgoal(right)`, a missing count as
 * `rep?(…)`. e.g. `right right rep3(up) _`.
 */
export function programText(p: Program): string {
  return p.map((it) => {
    if (it.t === 'cmd') return isHole(it.cmd) ? '_' : it.cmd;
    const n = it.count === 'goal' ? 'goal' : it.count === 0 ? '?' : String(it.count);
    return `rep${n}(${it.body.map((c) => (isHole(c) ? '_' : c)).join(' ')})`;
  }).join(' ');
}

/** The cards in the notebook (empty lines do not count; a repeat counts itself and its body). */
export function blocksOf(p: Program): number {
  return p.reduce((n, it) => (it.t === 'cmd' ? n + (isHole(it.cmd) ? 0 : 1) : n + 1 + it.body.filter((c) => !isHole(c)).length), 0);
}

/** A rule game's rules as one line: `key:right(right) touch:seed(score)`. */
export function rulesText(rules: readonly Rule[]): string {
  return rules.map((r) => `${r.hat}(${r.actions.join(' ')})`).join(' ');
}

/** A rule game's cards: each rule's hat and its actions. */
export const ruleBlocksOf = (rules: readonly Rule[]) => rules.reduce((n, r) => n + 1 + r.actions.length, 0);

/** The cards of the page's reference solution (a rule game's reference rules). */
export const optimalBlocks = (level: LevelDef) => (level.realtime ? ruleBlocksOf(level.realtime.solution) : blocksOf(level.solution));

/** ▶ pressed but nothing ran: an empty or incomplete notebook, no guess yet, a game stopped before any key was pressed. */
const NOT_RUN = new Set(['empty', 'incomplete', 'no_guess', 'no_play']);

/**
 * A run that counts as a failed try (the ladder's "two failed runs"): it ran
 * and did not win. Not a press of ▶ that ran nothing, and not the given
 * program run unchanged on a fix page (seeing the mistake is part of fixing it).
 */
export function isFailedRun(level: LevelDef, result: string, program: Program): boolean {
  if (result === 'win' || NOT_RUN.has(result)) return false;
  if (level.format === 'fix' && level.given && programText(program) === programText(level.given)) return false;
  return true;
}
