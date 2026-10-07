import { describe, expect, it } from 'vitest';
import { sheetByN } from '../curriculum/primer';
import { isBuilt } from '../curriculum/model';
import { FREE_PLAY_BUDGET_MS, FREE_PLAY_GRACE_MS, FREE_PLAY_MIN_VISITS, budgetFrom, budgetVerdict, menuFor, type ProbeId } from './freePlay';
import { FREE_RULES, RULE_GAME_PAGES, pilotLevel } from './levels';

const none = () => false;
const all = () => true;

describe('the free-play menu', () => {
  it('offers each grade its activities, in order, without the probes nobody built', () => {
    expect(menuFor(1, none).map((a) => a.id)).toEqual(['sheet', 'recess', 'guardas', 'editor']);
    expect(menuFor(2, none).map((a) => a.id)).toEqual(['sheet', 'recess', 'guardas', 'editor']);
    expect(menuFor(3, none).map((a) => a.id)).toEqual(['rule_game', 'sheet', 'recess', 'editor']);
    expect(menuFor(4, none).map((a) => a.id)).toEqual(['rule_game', 'editor', 'recess']);
    expect(menuFor(5, none).map((a) => a.id)).toEqual(['rule_game', 'editor', 'recess']);
  });

  it('T20: muted, 1ro loses its recess (music) card; not muted, or another grade: unchanged', () => {
    expect(menuFor(1, none, true).map((a) => a.id)).toEqual(['sheet', 'guardas', 'editor']);
    expect(menuFor(1, none, false).map((a) => a.id)).toEqual(['sheet', 'recess', 'guardas', 'editor']);
    expect(menuFor(1, none).map((a) => a.id)).toContain('recess'); // the default, unchanged
    expect(menuFor(2, none, true).map((a) => a.id)).toContain('recess');
    expect(menuFor(3, none, true).map((a) => a.id)).toContain('recess');
  });

  it('shows a probe\'s card once its component is registered, on its grade only', () => {
    expect(menuFor(4, all).map((a) => a.id)).toEqual(['rule_game', 'editor', 'recess', 'game_maker']);
    expect(menuFor(5, (id: ProbeId) => id === 'text_probe').map((a) => a.id)).toEqual(['rule_game', 'editor', 'recess', 'text_probe']);
    expect(menuFor(5, (id: ProbeId) => id === 'game_maker').map((a) => a.id)).not.toContain('game_maker');
    expect(menuFor(1, all).map((a) => a.id)).not.toContain('game_maker');
  });

  it('plays built sheets: the staircase for 1ro, the zigzag for 2do, before and after for 3ro, the right workshop', () => {
    const sheetOf = (grade: number, id: string) => {
      const a = menuFor(grade, none).find((x) => x.id === id)!;
      return 'sheet' in a.kind ? a.kind.sheet : null;
    };
    expect(sheetOf(1, 'sheet')).toBe(6);
    expect(sheetOf(2, 'sheet')).toBe(8);
    expect(sheetOf(3, 'sheet')).toBe(13);
    expect(sheetOf(1, 'editor')).toBe(7);
    expect(sheetOf(5, 'editor')).toBe(15);
    expect(sheetOf(1, 'recess')).toBe(9);
    expect(sheetOf(1, 'guardas')).toBe(14);
    for (const g of [1, 2, 3, 4, 5]) {
      for (const a of menuFor(g, all)) {
        if (!('sheet' in a.kind)) continue;
        const s = sheetByN(a.kind.sheet)!;
        expect(isBuilt(s)).toBe(true);
        // a sheet with pages has its doors and its boss
        if (a.id === 'sheet') expect(!!s.boss && !!s.extras).toBe(true);
      }
    }
  });

  it('names every card aloud (the child does not need to read)', () => {
    for (const g of [1, 2, 3, 4, 5]) for (const a of menuFor(g, all)) expect(a.say.length).toBeGreaterThan(8);
    expect(menuFor(1, none)[0].say).toBe('La escalera: una hoja con caminos y un desafío.');
  });

  it('plays the rule game\'s pages, the last one the child\'s own game', () => {
    expect(RULE_GAME_PAGES.map((id) => pilotLevel(id)?.id)).toEqual(['3ro-1', '3ro-2', 'pp-reglas']);
    expect(FREE_RULES.realtime?.initial).toEqual([]);
    expect(FREE_RULES.realtime?.win).toEqual({ kind: 'score', n: 8 });
    expect(FREE_RULES.blocks).toEqual(expect.arrayContaining(['key:up', 'key:down', 'touch:seed', 'score']));
  });
});

describe('the free-play time', () => {
  const base = { startedAt: 0, budget: FREE_PLAY_BUDGET_MS, onMenu: false, levelOpen: false, dueSince: null };

  it('is 8 minutes (T14) unless ?libre=<minutes> says otherwise (1 to 30)', () => {
    expect(FREE_PLAY_BUDGET_MS).toBe(8 * 60_000);
    expect(budgetFrom('')).toBe(FREE_PLAY_BUDGET_MS);
    expect(budgetFrom('?debug&libre=5')).toBe(5 * 60_000);
    expect(budgetFrom('?libre=0.5')).toBe(30_000);
    expect(budgetFrom('?libre=0')).toBe(FREE_PLAY_BUDGET_MS);
    expect(budgetFrom('?libre=45')).toBe(FREE_PLAY_BUDGET_MS);
    expect(budgetFrom('?libre=x')).toBe(FREE_PLAY_BUDGET_MS);
  });

  it('keeps playing before the time is over', () => {
    expect(budgetVerdict({ ...base, now: FREE_PLAY_BUDGET_MS - 1, onMenu: true })).toBe('wait');
  });

  it('or four activities: the child back on the drawn menu after the fourth moves on, whatever the time (T14)', () => {
    expect(FREE_PLAY_MIN_VISITS).toBe(4);
    expect(budgetVerdict({ ...base, now: 60_000, onMenu: true, onMainMenu: true, visits: 3 })).toBe('wait');
    expect(budgetVerdict({ ...base, now: 60_000, onMenu: true, onMainMenu: true, visits: 4 })).toBe('now');
    // still inside the fourth activity (its "¿Cómo seguís?" too): it plays on
    expect(budgetVerdict({ ...base, now: 60_000, levelOpen: true, visits: 4 })).toBe('wait');
    expect(budgetVerdict({ ...base, now: 60_000, onMenu: true, onMainMenu: false, visits: 4 })).toBe('wait');
  });

  it('moves on at once from the menu', () => {
    expect(budgetVerdict({ ...base, now: FREE_PLAY_BUDGET_MS, onMenu: true })).toBe('now');
  });

  it('never cuts a level: it waits for it to end, however long', () => {
    expect(budgetVerdict({ ...base, now: FREE_PLAY_BUDGET_MS, levelOpen: true })).toBe('after_level');
    expect(budgetVerdict({ ...base, now: FREE_PLAY_BUDGET_MS * 3, levelOpen: true, dueSince: FREE_PLAY_BUDGET_MS })).toBe('after_level');
  });

  it('gives a page that is not a level (doors, editor, corkboard) a grace, then moves on', () => {
    const due = FREE_PLAY_BUDGET_MS;
    expect(budgetVerdict({ ...base, now: due, dueSince: null })).toBe('after_level');
    expect(budgetVerdict({ ...base, now: due + FREE_PLAY_GRACE_MS - 1, dueSince: due })).toBe('after_level');
    expect(budgetVerdict({ ...base, now: due + FREE_PLAY_GRACE_MS, dueSince: due })).toBe('now');
  });
});
