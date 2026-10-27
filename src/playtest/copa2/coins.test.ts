import { describe, expect, it } from 'vitest';
import { EMPTY, grant, solve } from '../../curriculum/progress';
import { ITEMS } from '../../curriculum/motivation';
import { isUnlocked, setUnlocks, unlockedItems } from '../../curriculum/rewards';
import { PLAYTEST_UNLOCKS, UNLOCKS_4TO, unlocksFor } from '../WardrobeStep';
import { COIN, emptyLedger, deerAward, parseLedger, spyAward, trackAward, typingAward, type Ledger } from './coins';
import type { Tier } from './tracks';

const run = (ledger: Ledger, over: Partial<{ finished: boolean; won: boolean; rival: Tier; timeMs: number; firstRun: boolean }> = {}) =>
  trackAward(ledger, 'c1-a', { finished: true, won: false, rival: 'bronze', timeMs: 30_000, firstRun: false, ...over });

describe('a Copa track pays coins', () => {
  it('finishing pays a few, beating the rival more (gold the most), a first-try win a little extra', () => {
    expect(run(emptyLedger()).award.amount).toBe(COIN.finish);
    expect(run(emptyLedger(), { won: true, rival: 'bronze' }).award.amount).toBe(COIN.finish + COIN.beat.bronze);
    expect(run(emptyLedger(), { won: true, rival: 'gold' }).award.amount).toBe(COIN.finish + COIN.beat.gold);
    expect(run(emptyLedger(), { won: true, rival: 'silver', firstRun: true }).award.amount).toBe(COIN.finish + COIN.beat.silver + COIN.firstTry);
    expect(COIN.beat.bronze).toBeLessThan(COIN.beat.silver);
    expect(COIN.beat.silver).toBeLessThan(COIN.beat.gold);
  });

  it('pays nothing for a run that did not finish, and leaves the ledger as it was', () => {
    const l = emptyLedger();
    const r = run(l, { finished: false });
    expect(r.award.amount).toBe(0);
    expect(r.ledger).toBe(l);
  });

  it('never pays the same thing twice: a revancha at the same time pays nothing', () => {
    const first = run(emptyLedger(), { won: true, rival: 'silver', firstRun: true });
    const again = run(first.ledger, { won: true, rival: 'silver' });
    expect(again.award.amount).toBe(0);
  });

  it('a revancha that improves the time pays a little; a worse one does not; tiny gains do not count', () => {
    const first = run(emptyLedger(), { timeMs: 30_000 });
    const better = run(first.ledger, { timeMs: 29_000 });
    expect(better.award.parts).toEqual([{ source: 'copa_revancha', amount: COIN.improved }]);
    expect(run(better.ledger, { timeMs: 29_500 }).award.amount).toBe(0);
    expect(run(better.ledger, { timeMs: 28_950 }).award.amount).toBe(0);
    // the best time moves with the improvement, so the same gain cannot be farmed
    expect(run(better.ledger, { timeMs: 28_000 }).award.amount).toBe(COIN.improved);
  });

  it('beating a higher rival later pays that rival\'s bonus once', () => {
    const a = run(emptyLedger(), { won: true, rival: 'bronze' });
    const b = run(a.ledger, { won: true, rival: 'gold' });
    expect(b.award.parts).toEqual([{ source: 'copa_beat', amount: COIN.beat.gold }]);
    expect(run(b.ledger, { won: true, rival: 'gold' }).award.amount).toBe(0);
  });

  it('the first-try bonus needs the very first run', () => {
    expect(run(emptyLedger(), { won: true, rival: 'bronze', firstRun: false }).award.parts.map((p) => p.source)).not.toContain('copa_first_try');
  });
});

describe('the deer, the spy and the typing race', () => {
  it('the deer pays once per copa, the spy once per track', () => {
    const d = deerAward(emptyLedger(), 2);
    expect(d.award.amount).toBe(COIN.deer);
    expect(deerAward(d.ledger, 2).award.amount).toBe(0);
    expect(deerAward(d.ledger, 3).award.amount).toBe(COIN.deer);
    const s = spyAward(emptyLedger(), 'c1-a');
    expect(s.award.amount).toBe(COIN.spy);
    expect(spyAward(s.ledger, 'c1-a').award.amount).toBe(0);
  });

  it('a finished typing race pays, 1st place more', () => {
    expect(typingAward(3).amount).toBe(COIN.typing);
    expect(typingAward(2).amount).toBe(COIN.typing);
    expect(typingAward(1).amount).toBe(COIN.typingFirst);
    expect(typingAward(1).parts).toEqual([{ source: 'typing_race', amount: COIN.typingFirst }]);
  });

  it('every part carries an event-safe source name', () => {
    const all = [run(emptyLedger(), { won: true, rival: 'gold', firstRun: true }), deerAward(emptyLedger(), 2), spyAward(emptyLedger(), 'x')].flatMap((r) => r.award.parts);
    for (const p of [...all, ...typingAward(1).parts]) expect(/^[a-z_]{1,40}$/.test(p.source)).toBe(true);
    expect(/^[a-z_]{1,40}$/.test('coins_earned')).toBe(true);
  });
});

describe('the ledger survives a reload', () => {
  it('round-trips through JSON and drops garbage', () => {
    const l = run(emptyLedger(), { won: true, rival: 'silver', firstRun: true }).ledger;
    expect(parseLedger(JSON.parse(JSON.stringify(l)))).toEqual(l);
    expect(parseLedger({ v: 9 })).toEqual(emptyLedger());
    expect(parseLedger(null)).toEqual(emptyLedger());
  });
});

describe('4to\'s wardrobe', () => {
  it('has seven pieces, two free, the rest rising with the seeds, and other grades keep their table', () => {
    const seeds = ITEMS.map((i) => UNLOCKS_4TO[i.id].seeds);
    expect(seeds).toEqual([...seeds].sort((a, b) => a - b));
    expect(seeds.filter((n) => n === 0).length).toBe(2);
    expect(unlocksFor(false)).toBe(PLAYTEST_UNLOCKS);
    expect(unlocksFor(true)).toBe(UNLOCKS_4TO);
    expect(PLAYTEST_UNLOCKS.corona.seeds).toBe(16);
  });

  it('one good Copa track or two races open the first piece; the last one is a long way off', () => {
    setUnlocks(UNLOCKS_4TO);
    try {
      const track = run(emptyLedger(), { won: true, rival: 'silver', firstRun: true }).award.amount; // 6
      const races = typingAward(1).amount + typingAward(2).amount; // 7
      expect(unlockedItems(grant(EMPTY, track))).toContain('mochila');
      expect(unlockedItems(grant(solve(solve(EMPTY, 'a'), 'b'), races))).toContain('mochila');
      const corona = ITEMS.find((i) => i.id === 'corona')!;
      expect(isUnlocked(corona, grant(EMPTY, track + races))).toBe(false);
      expect(isUnlocked(corona, grant(EMPTY, UNLOCKS_4TO.corona.seeds))).toBe(true);
    } finally { setUnlocks(null); }
  });
});

const RAW_RACE = import.meta.glob('../TypingRace.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
describe('other grades are untouched', () => {
  it('the typing race pays only inside honest (4to) mode, before the band\'s cup logic', () => {
    const src = Object.values(RAW_RACE)[0];
    const at = src.indexOf('typingAward(');
    expect(at).toBeGreaterThan(src.indexOf('if (honest) {'));
    expect(at).toBeLessThan(src.indexOf('const isWin', src.indexOf('function crossLine')));
  });
});
