import { describe, expect, it } from 'vitest';
import { sheetByN } from '../curriculum/primer';
import { isBuilt } from '../curriculum/model';
import { FREE_PLAY_BUDGET_MS, FREE_PLAY_GRACE_MS, FREE_PLAY_MIN_VISITS, activityFor, budgetFrom, budgetVerdict, menuFor, type ProbeId } from './freePlay';
import { FREE_RULES, RULE_GAME_PAGES, pilotLevel } from './levels';

const none = () => false;
const all = () => true;

describe('the free-play menu', () => {
  it('offers each grade its activities, in order, without the probes nobody built', () => {
    // T43: 1ro's free play is its arcade: the monster games, the character, the wardrobe, the typing letters
    expect(menuFor(1, none).map((a) => a.id)).toEqual(['recipe', 'dance', 'oops', 'tap', 'buddy', 'wardrobe', 'typing_race']);
    expect(menuFor(2, none).map((a) => a.id)).toEqual(['race', 'sheet', 'recess', 'guardas', 'editor']);
    expect(menuFor(3, none).map((a) => a.id)).toEqual(['rule_game', 'sheet', 'recess', 'editor']);
    // T39/T41: 4to's free play is the Arcade: the typing race, the child's own game, La carrera, back to the Workshop (a flow step, no probe needed), the wardrobe
    expect(menuFor(4, none).map((a) => a.id)).toEqual(['typing_race', 'own_game', 'race', 'workshop', 'wardrobe']);
    expect(menuFor(5, none).map((a) => a.id)).toEqual(['rule_game', 'editor', 'recess']);
  });

  it('T20: muted, 1ro loses its recess (music) card; not muted, or another grade: unchanged (T43: 1ro\'s arcade has none, muted or not)', () => {
    expect(menuFor(1, none, true).map((a) => a.id)).toEqual(['recipe', 'dance', 'oops', 'tap', 'buddy', 'wardrobe', 'typing_race']);
    expect(menuFor(1, none, false).map((a) => a.id)).toEqual(['recipe', 'dance', 'oops', 'tap', 'buddy', 'wardrobe', 'typing_race']);
    expect(menuFor(2, none, true).map((a) => a.id)).toContain('recess');
    expect(menuFor(3, none, true).map((a) => a.id)).toContain('recess');
  });

  it('shows a probe\'s card once its component is registered, on its grade only', () => {
    expect(menuFor(4, all).map((a) => a.id)).toEqual(['typing_race', 'own_game', 'race', 'workshop', 'wardrobe']);
    expect(menuFor(5, (id: ProbeId) => id === 'text_probe').map((a) => a.id)).toEqual(['rule_game', 'editor', 'recess', 'text_probe']);
    expect(menuFor(5, all).map((a) => a.id)).toEqual(['workshop', 'rule_game', 'editor', 'recess', 'text_probe']);
    expect(menuFor(3, all).map((a) => a.id)).not.toContain('workshop');
    expect(menuFor(5, (id: ProbeId) => id === 'game_maker').map((a) => a.id)).not.toContain('game_maker');
    expect(menuFor(1, all).map((a) => a.id)).not.toContain('game_maker');
  });

  it('plays built sheets: the staircase for 1ro, the zigzag for 2do, before and after for 3ro, the right workshop', () => {
    const sheetOf = (grade: number, id: string) => {
      const a = menuFor(grade, none).find((x) => x.id === id);
      return a && 'sheet' in a.kind ? a.kind.sheet : null;
    };
    expect(sheetOf(1, 'sheet')).toBeNull();
    expect(sheetOf(2, 'sheet')).toBe(8);
    expect(sheetOf(3, 'sheet')).toBe(13);
    expect(sheetOf(2, 'editor')).toBe(7);
    expect(sheetOf(5, 'editor')).toBe(15);
    expect(sheetOf(2, 'recess')).toBe(9);
    expect(sheetOf(2, 'guardas')).toBe(14);
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
    expect(activityFor('sheet', 1)?.say).toBe('La escalera: una hoja con caminos y un desafío.');
  });

  it('T33: the race is first on 2do\'s menu (muted too: it needs no sound), not on 3ro–5to\'s (T43: nor 1ro\'s, it opens from the adult menu)', () => {
    expect(menuFor(1, all).map((a) => a.id)).not.toContain('race');
    expect(activityFor('race', 1)).toMatchObject({ id: 'race', kind: { race: true } });
    for (const g of [2]) {
      expect(menuFor(g, none)[0]).toMatchObject({ id: 'race', kind: { race: true }, caption: 'La carrera' });
      expect(menuFor(g, none, true)[0].id).toBe('race');
    }
    for (const g of [3, 5]) expect(menuFor(g, all).map((a) => a.id)).not.toContain('race');
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

describe('T39: 4to\'s Arcade', () => {
  it('no xylophone, no 1ro sheet editor, no rule game, no old game maker; the Workshop and the wardrobe are steps; the race from tier 4', async () => {
    const { activityFor, menuFor, RACE_START_TIER } = await import('./freePlay');
    const ids = menuFor(4, () => true).map((a) => a.id);
    for (const gone of ['recess', 'editor', 'rule_game', 'game_maker', 'sheet']) expect(ids).not.toContain(gone);
    expect(activityFor('workshop', 4)!.kind).toEqual({ step: 'workshop' });
    expect(activityFor('wardrobe', 4)!.kind).toEqual({ step: 'wardrobe' });
    // 5to keeps the Workshop as its free-play card
    expect(activityFor('workshop', 5)!.kind).toEqual({ probe: 'workshop' });
    expect(RACE_START_TIER[4]).toBe(4);
    expect(RACE_START_TIER[1]).toBeUndefined();
  });
});
