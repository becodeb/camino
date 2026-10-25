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

  it('says nothing when no 1ro child played a monster game', () => {
    const r = monsterReport([session('x'), session('y', 4)], [ev('y', 'game_start', { game: 'recipe', mode: 'arcade' }), ev('x', 'level_start', {})]);
    expect(r.sessions).toBe(0);
    expect(r.children).toEqual([]);
    expect(r.games.every((g) => g.plays === 0 && g.skill != null)).toBe(true);
  });
});
