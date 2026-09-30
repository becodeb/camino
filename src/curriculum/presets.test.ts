import { describe, expect, it } from 'vitest';
import { bossId, coreId, hasCore, type Sheet } from './model';
import { BOSS_REWARDS, itemById, rewardKey } from './motivation';
import { PRESETS, presetFullYear, presetMidYear, presetStart } from './presets';
import { PRIMER } from './primer';
import { EMPTY, LAST_SHEET, parse, sheetState, type Progress } from './progress';
import { entryPage } from './route';
import { isUnlocked } from './rewards';

/** Every id of `s` whose level offers a gold "save blocks" challenge, worked out again here (not imported from
 * curriculum/presets.ts) so this proves the preset's actual behaviour instead of just echoing its own helper. */
const goldEligibleIds = (s: Sheet): string[] => {
  const core = s.core.flatMap((c, i) => (c.level.save ? [coreId(s, i + 1)] : []));
  return s.boss?.save ? [...core, bossId(s)] : core;
};

/** A preset passes the store's own validation/normalization when a round trip through it changes nothing. */
const expectValid = (p: Progress) => expect(parse(JSON.stringify(p))).toEqual(p);

describe('the "Arranque" preset', () => {
  it('is exactly a fresh year: sheet 1 opens on the character choice', () => {
    const p = presetStart();
    expect(p).toBe(EMPTY);
    expect(entryPage(PRIMER[0], p)).toEqual({ kind: 'personaje' });
    expectValid(p);
  });

  it('gives the same result every time', () => {
    expect(presetStart()).toEqual(presetStart());
  });
});

describe('the "Mitad de año" preset', () => {
  const p = presetMidYear();

  it("passes the store's own validation", () => expectValid(p));

  it('finishes sheets 1 to 8 (the first workshop included), and none of the rest', () => {
    for (const s of PRIMER) {
      const label = `sheet ${s.n}`;
      if (s.n <= 8) expect(sheetState(s, p).complete, label).toBe(true);
      else expect(sheetState(s, p).complete, label).toBe(false);
    }
  });

  it('the teacher opened up to sheet 10', () => {
    expect(p.opened).toBe(10);
  });

  it('seeds match the solved pages exactly (only solve/earnGold ever ran, never a grant)', () => {
    expect(p.seeds).toBe(Object.keys(p.solved).length);
  });

  it('stamped exactly one page gold', () => {
    expect(Object.keys(p.gold)).toHaveLength(1);
  });

  it('picked a character with two unlocked pieces worn, on different slots', () => {
    expect(p.picked).toBe(true);
    const worn = Object.entries(p.outfit);
    expect(worn).toHaveLength(2);
    for (const [slot, id] of worn) {
      const item = itemById(id);
      expect(item?.slot).toBe(slot);
      expect(isUnlocked(item!, p)).toBe(true);
    }
  });

  it("marked seen every reward that arrived by sheet 8, and no other", () => {
    const expected = BOSS_REWARDS.filter((r) => r.sheet <= 8).map(rewardKey);
    expect(Object.keys(p.seen).sort()).toEqual(expected.sort());
  });

  it("shows every sheet's preview already shown", () => {
    const withPreview = PRIMER.filter((s) => s.preview);
    expect(Object.keys(p.previewed)).toHaveLength(withPreview.length);
  });

  it('gives the same result every time', () => {
    expect(presetMidYear()).toEqual(presetMidYear());
  });
});

describe('the "Año completo" preset', () => {
  const p = presetFullYear();

  it("passes the store's own validation", () => expectValid(p));

  it('every sheet is complete except the showcase', () => {
    for (const s of PRIMER) {
      const label = `sheet ${s.n}`;
      if (s.n === 17) expect(sheetState(s, p).complete, label).toBe(false);
      else expect(sheetState(s, p).complete, label).toBe(true);
    }
  });

  it('stamped gold on exactly the pages that offer it (sheet 11 and sheet 14 today)', () => {
    const expected = PRIMER.filter(hasCore).flatMap(goldEligibleIds);
    expect(expected.length).toBeGreaterThan(0); // otherwise this test would prove nothing
    expect(Object.keys(p.gold).sort()).toEqual([...expected].sort());
  });

  it('made one level per workshop, on this device', () => {
    expect(p.made.map((m) => m.sheet).sort((a, b) => a - b)).toEqual([7, 15]);
  });

  it("marked every arrived reward seen", () => {
    expect(Object.keys(p.seen).sort()).toEqual(BOSS_REWARDS.map(rewardKey).sort());
  });

  it("shows every sheet's preview already shown", () => {
    const withPreview = PRIMER.filter((s) => s.preview);
    expect(Object.keys(p.previewed)).toHaveLength(withPreview.length);
  });

  it('the teacher opened up to the last sheet, with exactly 150 seeds', () => {
    expect(p.opened).toBe(LAST_SHEET);
    expect(p.seeds).toBe(150);
  });

  it('Mina, dressed with three pieces on different slots, and the wardrobe open', () => {
    expect(p.character).toBe('mina');
    expect(p.picked).toBe(true);
    const worn = Object.entries(p.outfit);
    expect(worn).toHaveLength(3);
    for (const [slot, id] of worn) expect(itemById(id)?.slot).toBe(slot);
    expect(p.wardrobe).toBe(true);
  });

  it('leaves the showcase favourites for the presenter to pick live', () => {
    expect(p.favorites).toEqual([]);
  });

  it('gives the same result every time', () => {
    expect(presetFullYear()).toEqual(presetFullYear());
  });
});

describe('the dev drawer\'s preset registry', () => {
  it('has one labelled preset per demo state, matching the module\'s own builders', () => {
    expect(PRESETS.start.build()).toEqual(presetStart());
    expect(PRESETS.mid.build()).toEqual(presetMidYear());
    expect(PRESETS.full.build()).toEqual(presetFullYear());
    for (const preset of Object.values(PRESETS)) expect(preset.label.length).toBeGreaterThan(0);
  });
});
