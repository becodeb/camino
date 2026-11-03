import { describe, expect, it } from 'vitest';
import type { PtEvent, PtSession } from './report';
import { monsterReport } from './reportMonster';

const session = (id: string, grade = 1): PtSession => ({ id, code: `Kid ${id}`, grade, started_at: '2026-10-27T13:00:00.000Z' });
let seq = 0;
const ev = (session_id: string, type: string, payload: Record<string, unknown> = {}): PtEvent => ({ session_id, seq: seq++, type, payload });
const start = (sid: string, game: string, mode: 'guided' | 'arcade', play_no = 1) => ev(sid, 'game_start', { game, mode, play_no, tier: 1, voluntary: mode === 'arcade', replay: play_no > 1 });
const round = (sid: string, game: string, mode: string, o: Record<string, unknown> = {}) => ev(sid, 'game_round', { game, mode, solved: true, correct: true, attempts: 1, ...o });
const end = (sid: string, game: string, mode: string, reason: string, o: Record<string, unknown> = {}) => ev(sid, 'game_end', { game, mode, reason, ...o });

function guidedPass(sid: string) {
  return [
    start(sid, 'recipe', 'guided'), round(sid, 'recipe', 'guided', { correct: false, attempts: 2, order_errors: 1, first_input_ms: 4000 }), round(sid, 'recipe', 'guided', { order_errors: 0, first_input_ms: 2000 }), end(sid, 'recipe', 'guided', 'finished'),
    start(sid, 'dance', 'guided'), round(sid, 'dance', 'guided', { length: 2 }), round(sid, 'dance', 'guided', { length: 3 }), end(sid, 'dance', 'guided', 'finished', { longest: 3 }),
    start(sid, 'oops', 'guided'), round(sid, 'oops', 'guided', { found_try: 1, fix_correct: true, first_input_ms: 3000 }), round(sid, 'oops', 'guided', { found_try: 2, fix_correct: false, first_input_ms: 5000 }), end(sid, 'oops', 'guided', 'finished'),
    start(sid, 'tap', 'guided'), round(sid, 'tap', 'guided'), ev(sid, 'tap_rule', { game: 'tap', action: 'add', effect: 'jump' }), ev(sid, 'tap_rule', { game: 'tap', action: 'add', effect: 'hide' }),
    end(sid, 'tap', 'guided', 'finished', { rules_made: 2, play_ms: 30_000, play_taps: 9 }),
    ev(sid, 'route_done', {}),
  ];
}

describe('the 1ro arcade section ("Los juegos del monstruo")', () => {
  it('counts per game: children, plays, rounds, voluntary replays, finished vs quit, rapid taps, and the skill measures', () => {
    seq = 0;
    const events = [
      ...guidedPass('a'),
      // a: the dance picked again twice and one "¡Otra vez!", the recipe once and quit; very fast taps in the dance
      start('a', 'dance', 'arcade', 2), round('a', 'dance', 'arcade', { length: 4 }), round('a', 'dance', 'arcade', { length: 5, again: true }), end('a', 'dance', 'arcade', 'finished', { longest: 5 }),
      start('a', 'dance', 'arcade', 3), ev('a', 'rapid_taps', { game: 'dance', taps: 4 }), end('a', 'dance', 'arcade', 'quit', { longest: 0 }),
      start('a', 'recipe', 'arcade', 2), round('a', 'recipe', 'arcade', { solved: false, correct: false }), end('a', 'recipe', 'arcade', 'quit'),
      ev('a', 'survey_answer', { question: 'liked_dance', game: 'dance', answer: 'yes' }),
      ev('a', 'survey_answer', { question: 'liked_tap', game: 'tap', answer: 'mid' }),
      // b: only part of the guided pass (quit in the dance), then the tap game twice from the arcade
      start('b', 'recipe', 'guided'), round('b', 'recipe', 'guided'), end('b', 'recipe', 'guided', 'finished'),
      start('b', 'dance', 'guided'), end('b', 'dance', 'guided', 'quit', { longest: 0 }),
      start('b', 'tap', 'arcade', 1), ev('b', 'tap_rule', { game: 'tap', action: 'add', effect: 'jump' }), end('b', 'tap', 'arcade', 'finished', { rules_made: 1, play_ms: 10_000, play_taps: 3 }),
      start('b', 'tap', 'arcade', 2), ev('b', 'tap_rule', { game: 'tap', action: 'remove', effect: 'jump' }), end('b', 'tap', 'arcade', 'quit', { rules_made: 3, play_ms: 50_000, play_taps: 20 }),
      // a 2do session with a game event is not 1ro's
      start('c', 'recipe', 'arcade'),
    ];
    const r = monsterReport([session('a'), session('b'), session('c', 2), session('d')], events);
    expect(r.sessions).toBe(2);
    const g = Object.fromEntries(r.games.map((x) => [x.game, x]));
    expect(g.recipe).toMatchObject({ children: 2, plays: 3, rounds: 3, arcadePicks: 1, voluntaryReplays: 1, finished: 2, quit: 1, rapidTaps: 0 });
    expect(g.recipe.skill.firstTryPct).toBeCloseTo((2 / 3) * 100);
    expect(g.recipe.skill.medianOrderErrors).toBe(0.5);
    expect(g.dance).toMatchObject({ children: 2, plays: 4, rounds: 4, voluntaryReplays: 3, finished: 2, quit: 2, rapidTaps: 1, liked: { yes: 1 } });
    // a's longest is 5; b never copied a dance (no longest): the median over the children with one
    expect(g.dance.skill.medianLongest).toBe(5);
    expect(g.oops.skill.foundFirstPct).toBe(50);
    expect(g.oops.skill.fixFirstPct).toBe(50);
    expect(g.oops.skill.medianFirstInputMs).toBe(4000);
    expect(g.tap).toMatchObject({ children: 2, plays: 3, finished: 2, quit: 1, voluntaryReplays: 1, liked: { mid: 1 } });
    // a: 2 rules, 30 s playing, 9 taps; b: 1 + 3 rules, 60 s, 23 taps
    expect(g.tap.skill.medianRulesMade).toBe(3);
    expect(g.tap.skill.medianPlayMs).toBe(45_000);
    expect(g.tap.skill.medianPlayTaps).toBe(16);
    expect(g.tap.skill.effectsChosen).toEqual({ jump: 2, hide: 1 });
  });

  it('per child: the favourite is the game with the most voluntary replays; the guided pass completion', () => {
    seq = 0;
    const events = [
      ...guidedPass('a'),
      start('a', 'dance', 'arcade', 2), start('a', 'dance', 'arcade', 3), start('a', 'recipe', 'arcade', 2),
      start('b', 'recipe', 'guided'), end('b', 'recipe', 'guided', 'finished'),
      // b's first arcade pick of a game never played is a choice, not a replay
      start('b', 'tap', 'arcade', 1), start('b', 'tap', 'arcade', 2), start('b', 'oops', 'arcade', 1), start('b', 'oops', 'arcade', 2),
    ];
    const r = monsterReport([session('a'), session('b')], events);
    const a = r.children.find((c) => c.sessionId === 'a')!;
    const b = r.children.find((c) => c.sessionId === 'b')!;
    expect(a.favourite).toEqual(['dance']);
    expect(a.guidedFinished).toEqual(['recipe', 'dance', 'oops', 'tap']);
    expect(a.guidedDone).toBe(true);
    expect(b.favourite).toEqual(['oops', 'tap']);
    expect(b.guidedFinished).toEqual(['recipe']);
    expect(b.guidedDone).toBe(false);
    expect(r.guidedAll).toBe(1);
    expect(r.guidedDone).toBe(1);
    expect(r.favourites).toEqual({ dance: 1, oops: 1, tap: 1 });
  });

  it('T51: counts how the children left a game, by `via` and per card (other grades\' exits are not 1ro\'s)', () => {
    seq = 0;
    const exit = (sid: string, game: string, via: string) => ev(sid, 'game_exit', { game, via, visit: 1 });
    const events = [
      ...guidedPass('a'),
      start('a', 'recipe', 'arcade', 2), exit('a', 'recipe', 'end_button'),
      start('a', 'dance', 'arcade', 2), exit('a', 'dance', 'play_button'),
      exit('a', 'typing_race', 'end_button'), exit('a', 'wardrobe', 'play_button'), exit('a', 'buddy', 'bar_menu'),
      start('b', 'recipe', 'guided'), start('b', 'tap', 'arcade'), exit('b', 'tap', 'play_button'),
      start('c', 'recipe', 'arcade'), exit('c', 'recipe', 'bar_menu'),
    ];
    const r = monsterReport([session('a'), session('b'), session('c', 2)], events);
    expect(r.exits).toEqual({ end_button: 2, play_button: 3, bar_menu: 1 });
    expect(r.exitsByGame).toEqual({
      recipe: { end_button: 1 }, dance: { play_button: 1 }, typing_race: { end_button: 1 }, wardrobe: { play_button: 1 }, buddy: { bar_menu: 1 }, tap: { play_button: 1 },
    });
  });

  it('T58: "¡Pum! Letras" is read apart (waves, popped, accuracy, keys, tier) and never counts toward the guided pass', () => {
    seq = 0;
    const popWave = (sid: string, o: Record<string, unknown> = {}) => round(sid, 'pop', 'arcade', {
      popped: 40, words_popped: 3, right: 45, wrong: 5, sources: { key: 10, touch: 40 }, tier: 1, tier_end: 4, tier_ups: 3, adapt_ups: 1, adapt_downs: 0, ...o,
    });
    const popEnd = (sid: string, reason: string, o: Record<string, unknown> = {}) => end(sid, 'pop', 'arcade', reason, { right: 45, wrong: 5, popped: 40, physical: 10, touch: 40, ...o });
    const events = [
      ...guidedPass('a'),
      // a: two waves in one play (the second by "¡Otra vez!"), finished
      start('a', 'pop', 'arcade', 1), popWave('a'), popWave('a', { again: true, tier_end: 5, tier_ups: 4, popped: 30, words_popped: 5 }), popEnd('a', 'finished', { right: 90, wrong: 10, popped: 70, physical: 20, touch: 80 }),
      // b: a play left mid-wave (no won wave), then a second pick of the card
      start('b', 'recipe', 'guided'), end('b', 'recipe', 'guided', 'finished'),
      start('b', 'pop', 'arcade', 1), ev('b', 'game_round', { game: 'pop', mode: 'arcade', solved: false, tier: 2 }), popEnd('b', 'quit', { right: 8, wrong: 2, popped: 7, physical: 10, touch: 0 }),
      start('b', 'pop', 'arcade', 2),
      // c: a tab closed before the play's game_end: falls back to the won wave's own numbers
      start('c', 'pop', 'arcade', 1), popWave('c', { tier_end: 3, popped: 20, right: 20, wrong: 0, sources: { key: 0, touch: 20 } }),
      // a 2do session and another game's event are not pop's
      start('d', 'pop', 'arcade', 1), popWave('d'),
    ];
    const r = monsterReport([session('a'), session('b'), session('c'), session('d', 2)], events);
    // pop is not a monster game: the games rows and the guided totals are the four
    expect(r.games.map((g) => g.game)).toEqual(['recipe', 'dance', 'oops', 'tap']);
    expect(r.guidedAll).toBe(1);
    expect(r.children.find((c) => c.sessionId === 'a')!.plays).not.toHaveProperty('pop');
    expect(r.pop).toMatchObject({ children: 3, plays: 4, waves: 3, arcadePicks: 4, voluntaryReplays: 2, finished: 1, quit: 1, popped: 70 + 7 + 20, wordsPopped: 3 + 5 + 3, right: 90 + 8 + 20, wrong: 10 + 2, physical: 20 + 10, touch: 80 + 0 + 20, highestTier: 5, tierUps: 3 + 4 + 3, adaptUps: 3 });
    expect(r.pop.accuracyPct).toBeCloseTo((118 / 130) * 100, 5);
    expect(r.pop.touchSharePct).toBeCloseTo((100 / 130) * 100, 5);
    expect(r.pop.tierEndDist).toEqual({ '4': 1, '5': 1, '3': 1 });
    const a = r.pop.perChild.find((c) => c.sessionId === 'a')!;
    expect(a).toMatchObject({ plays: 1, waves: 2, popped: 70, wordsPopped: 8, highestTier: 5, physical: 20, touch: 80 });
    const b = r.pop.perChild.find((c) => c.sessionId === 'b')!;
    expect(b).toMatchObject({ plays: 2, waves: 0, popped: 7, highestTier: 2 });
    // c has no game_end: its won wave stands in
    expect(r.pop.perChild.find((c) => c.sessionId === 'c')).toMatchObject({ waves: 1, popped: 20, right: 20, physical: 0, touch: 20, highestTier: 3 });
  });

  it('T58: a custom guided list (1ro\'s route of 2026-11-03: recipe and oops) sets what a complete guided pass is', () => {
    seq = 0;
    const events = [
      start('a', 'recipe', 'guided'), end('a', 'recipe', 'guided', 'finished'), start('a', 'oops', 'guided'), end('a', 'oops', 'guided', 'finished'), ev('a', 'route_done', {}),
      start('b', 'recipe', 'guided'), end('b', 'recipe', 'guided', 'finished'),
    ];
    const r = monsterReport([session('a'), session('b')], events, ['recipe', 'oops']);
    expect(r.guidedGames).toEqual(['recipe', 'oops']);
    expect(r.guidedAll).toBe(1);
    expect(r.children.map((c) => c.guidedFinished)).toEqual([['recipe', 'oops'], ['recipe']]);
  });

  it('T58: the gentle ladder of 1ro: items, step-downs (check floor), why it ended (wrap_up included), minutes', () => {
    seq = 0;
    const step = (sid: string, rung: number, check: 'climb' | 'floor', result: 'pass' | 'fail', end_reason: string) => ev(sid, 'ladder_step', { rung, check, result, end_reason });
    const lend = (sid: string, o: Record<string, unknown>) => ev(sid, 'ladder_end', { entry_rung: 1, ...o });
    const events = [
      // a: two passes, a failed item, a step down that passed, ended by the time cap
      step('a', 1, 'climb', 'pass', 'solved'), step('a', 2, 'climb', 'pass', 'solved'), step('a', 3, 'climb', 'fail', 'runs'), step('a', 2, 'floor', 'pass', 'solved'),
      lend('a', { items: 4, ceiling_rung: 2, time_ms: 420_000, reason: 'max_time' }),
      // b: "Juegos para todos" deferred to the end: wrap_up; no step down
      step('b', 1, 'climb', 'pass', 'solved'), lend('b', { items: 1, ceiling_rung: 1, time_ms: 60_000, reason: 'wrap_up' }),
      // c: never passed anything, stepped down at rung 1 (it repeats)
      step('c', 1, 'climb', 'fail', 'time_cap'), step('c', 1, 'floor', 'fail', 'idle_cap'), lend('c', { items: 2, ceiling_rung: null, time_ms: 300_000, reason: 'max_items' }),
      // 4to's ladder and a 1ro session that never reached the end of the ladder are not in this section
      step('d', 7, 'climb', 'pass', 'solved'), lend('d', { items: 1, ceiling_rung: 7, time_ms: 1000, reason: 'top' }),
      step('e', 1, 'climb', 'pass', 'solved'),
    ];
    const r = monsterReport([session('a'), session('b'), session('c'), session('d', 4), session('e')], events).ladder;
    expect(r).toMatchObject({ sessions: 3, items: 7, passes: 4, stepDowns: 2, childrenWithStepDown: 2, medianItems: 2, medianStepDowns: 1, medianMs: 300_000, maxMs: 420_000 });
    expect(r.endReasons).toEqual({ max_time: 1, wrap_up: 1, max_items: 1 });
    expect(r.itemEndReasons).toEqual({ solved: 4, runs: 1, time_cap: 1, idle_cap: 1 });
    expect(r.ceilingDist).toEqual({ '2': 1, '1': 1, null: 1 });
    expect(r.perChild.find((c) => c.sessionId === 'c')).toMatchObject({ items: 2, stepDowns: 1, passes: 0, ceiling: null, reason: 'max_items' });
  });

  it('says nothing when no 1ro child played a monster game', () => {
    const r = monsterReport([session('x'), session('y', 4)], [ev('y', 'game_start', { game: 'recipe', mode: 'arcade' }), ev('x', 'level_start', {})]);
    expect(r.sessions).toBe(0);
    expect(r.children).toEqual([]);
    expect(r.games.every((g) => g.plays === 0 && g.skill != null)).toBe(true);
    expect(r.exits).toEqual({});
    expect(r.pop).toMatchObject({ children: 0, waves: 0, highestTier: null, accuracyPct: null });
    expect(r.ladder).toMatchObject({ sessions: 0, items: 0, medianMs: null });
  });
});
