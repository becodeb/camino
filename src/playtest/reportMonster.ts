// T49: the class report's 1ro arcade section, "Los juegos del monstruo"
// (T43–T47). Pure, like report.ts (unit-tested in reportMonster.test.ts) and
// runnable from plain Node without a build step (tools/analyze-playtest.mjs
// imports it by its .ts path; Node strips the types): erasable syntax only,
// and no value imports (only `import type`), so Node never has to resolve
// an extensionless path.
//
// Reads the events of docs/prueba-piloto-datos.md ("1ro's monster games"):
// `game_start`, `game_round`, `game_end`, `rapid_taps`, `tap_rule`,
// `tap_mode` and the survey's `liked_<game>` answers. Per game: the children
// who played it, its plays and rounds, the voluntary replays, finished vs
// quit, the rapid-tap (dizzy) episodes and the game's own skill measure.
// Per child: plays and voluntary replays per game, the favourite (the most
// voluntary replays), and the guided pass completion.
//
// A "voluntary replay" is the child's own choice to play a game again: an
// arcade pick of a game already played this session (`game_start` with
// `mode: 'arcade'` and `replay: true`, the guided pass counts as played), or
// a round started by "¡Otra vez!" (`game_round.again`).

import type { PtEvent, PtSession } from './report';

export const MONSTER_GAMES = ['recipe', 'dance', 'oops', 'tap'] as const;
export type MonsterGame = typeof MONSTER_GAMES[number];

export const MONSTER_GAME_NAME: Record<MonsterGame, string> = {
  recipe: 'La receta del monstruo', dance: 'Copiá el baile', oops: '¿Qué salió mal?', tap: 'Tocá y pasa',
};

const med = (nums: number[]): number | null => {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pctOf = (n: number, total: number): number | null => (total > 0 ? (n / total) * 100 : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isGame = (g: unknown): g is MonsterGame => typeof g === 'string' && (MONSTER_GAMES as readonly string[]).includes(g);

/** Each game's own skill measure, over every round or play of the class (null: no data). */
export interface GameSkill {
  /** recipe: % of solved rounds right on the first serve; median order errors per solved round. */
  firstTryPct?: number | null;
  medianOrderErrors?: number | null;
  /** recipe/oops: did they look before acting (median ms to the first input of a round). */
  medianFirstInputMs?: number | null;
  /** dance: the longest dance copied, median over the children who played it. */
  medianLongest?: number | null;
  /** oops: % of solved rounds where the mistake was found at the first tap; % where the first fix tried was right. */
  foundFirstPct?: number | null;
  fixFirstPct?: number | null;
  /** tap: rules made per child (median), time playing with what they made per child (median ms), taps while playing per child (median). */
  medianRulesMade?: number | null;
  medianPlayMs?: number | null;
  medianPlayTaps?: number | null;
  /** tap: which effects were put in rules (every rule added, the whole class). */
  effectsChosen?: Record<string, number>;
}

export interface MonsterGameRow {
  game: MonsterGame;
  children: number;
  plays: number;
  /** Rounds won (solved). */
  rounds: number;
  arcadePicks: number;
  voluntaryReplays: number;
  finished: number;
  quit: number;
  rapidTaps: number;
  skill: GameSkill;
  /** The survey's liking faces for this game (`liked_<game>`): yes / mid / no. */
  liked: Record<string, number>;
}

export interface MonsterChild {
  sessionId: string;
  code: string;
  plays: Partial<Record<MonsterGame, number>>;
  voluntary: Partial<Record<MonsterGame, number>>;
  /** The game(s) with the most voluntary replays (none when there is no replay at all). */
  favourite: MonsterGame[];
  /** The guided games finished (game_end finished, mode guided), in order. */
  guidedFinished: MonsterGame[];
  /** Left the guided pass (route_done: the green flag). */
  guidedDone: boolean;
}

export interface MonsterReport {
  /** 1ro sessions that played any monster game. */
  sessions: number;
  games: MonsterGameRow[];
  children: MonsterChild[];
  /** How many children finished every guided game, and left the guided pass (the green flag). */
  guidedAll: number;
  guidedDone: number;
  /** The favourite's tally over the class (a child with a tie counts for each). */
  favourites: Record<string, number>;
}

const label = (s: Pick<PtSession, 'child_name' | 'code' | 'id'>) => s.child_name?.trim() || s.code || s.id;

export function monsterReport(sessions: PtSession[], events: PtEvent[], guided: readonly MonsterGame[] = MONSTER_GAMES): MonsterReport {
  const mine = events.filter((e) => ['game_start', 'game_round', 'game_end', 'rapid_taps', 'tap_rule', 'route_done', 'survey_answer'].includes(e.type));
  const bySession = new Map<string, PtEvent[]>();
  for (const e of mine) {
    const list = bySession.get(e.session_id);
    if (list) list.push(e);
    else bySession.set(e.session_id, [e]);
  }
  const children: MonsterChild[] = [];
  const perChild: Array<{ rows: PtEvent[] }> = [];
  for (const s of sessions) {
    if (s.grade !== 1) continue;
    const rows = (bySession.get(s.id) ?? []).slice().sort((a, b) => a.seq - b.seq);
    if (!rows.some((e) => e.type === 'game_start' && isGame(e.payload.game))) continue;
    const plays: Partial<Record<MonsterGame, number>> = {};
    const voluntary: Partial<Record<MonsterGame, number>> = {};
    for (const e of rows) {
      const g = e.payload.game;
      if (!isGame(g)) continue;
      if (e.type === 'game_start') {
        plays[g] = (plays[g] ?? 0) + 1;
        if (e.payload.mode === 'arcade' && e.payload.replay === true) voluntary[g] = (voluntary[g] ?? 0) + 1;
      } else if (e.type === 'game_round' && e.payload.again === true) voluntary[g] = (voluntary[g] ?? 0) + 1;
    }
    const top = Math.max(0, ...Object.values(voluntary).map((v) => v ?? 0));
    const guidedFinished = guided.filter((g) => rows.some((e) => e.type === 'game_end' && e.payload.game === g && e.payload.mode === 'guided' && e.payload.reason === 'finished'));
    children.push({
      sessionId: s.id, code: label(s), plays, voluntary,
      favourite: top > 0 ? MONSTER_GAMES.filter((g) => (voluntary[g] ?? 0) === top) : [],
      guidedFinished,
      guidedDone: rows.some((e) => e.type === 'route_done'),
    });
    perChild.push({ rows });
  }

  const all = perChild.flatMap((c) => c.rows);
  const ofGame = (type: string, g: MonsterGame) => all.filter((e) => e.type === type && e.payload.game === g);
  const games: MonsterGameRow[] = MONSTER_GAMES.map((g) => {
    const starts = ofGame('game_start', g);
    const rounds = ofGame('game_round', g);
    const solved = rounds.filter((e) => e.payload.solved !== false);
    const ends = ofGame('game_end', g);
    const skill: GameSkill = {};
    if (g === 'recipe') {
      skill.firstTryPct = pctOf(solved.filter((e) => e.payload.correct === true).length, solved.length);
      skill.medianOrderErrors = med(solved.map((e) => num(e.payload.order_errors)).filter((x): x is number => x != null));
      skill.medianFirstInputMs = med(solved.map((e) => num(e.payload.first_input_ms)).filter((x): x is number => x != null));
    } else if (g === 'dance') {
      const longest = perChild.map((c) => {
        const ls = c.rows.filter((e) => e.payload.game === 'dance' && ((e.type === 'game_end' && num(e.payload.longest) != null) || (e.type === 'game_round' && e.payload.solved !== false)))
          .map((e) => (e.type === 'game_end' ? num(e.payload.longest) : num(e.payload.length)))
          .filter((x): x is number => x != null && x > 0);
        return ls.length ? Math.max(...ls) : null;
      }).filter((x): x is number => x != null);
      skill.medianLongest = med(longest);
    } else if (g === 'oops') {
      skill.foundFirstPct = pctOf(solved.filter((e) => e.payload.found_try === 1).length, solved.length);
      skill.fixFirstPct = pctOf(solved.filter((e) => e.payload.fix_correct === true).length, solved.length);
      skill.medianFirstInputMs = med(solved.map((e) => num(e.payload.first_input_ms)).filter((x): x is number => x != null));
    } else {
      const sum = (rows: PtEvent[], k: string) => rows.filter((e) => e.type === 'game_end' && e.payload.game === 'tap').reduce((n, e) => n + (num(e.payload[k]) ?? 0), 0);
      const played = perChild.filter((c) => c.rows.some((e) => e.type === 'game_start' && e.payload.game === 'tap'));
      skill.medianRulesMade = med(played.map((c) => sum(c.rows, 'rules_made')));
      skill.medianPlayMs = med(played.map((c) => sum(c.rows, 'play_ms')));
      skill.medianPlayTaps = med(played.map((c) => sum(c.rows, 'play_taps')));
      const chosen: Record<string, number> = {};
      for (const e of all) if (e.type === 'tap_rule' && e.payload.action === 'add') { const k = String(e.payload.effect); chosen[k] = (chosen[k] ?? 0) + 1; }
      skill.effectsChosen = chosen;
    }
    const liked: Record<string, number> = {};
    for (const e of all) if (e.type === 'survey_answer' && e.payload.question === `liked_${g}`) { const k = String(e.payload.answer); liked[k] = (liked[k] ?? 0) + 1; }
    return {
      game: g,
      children: new Set(starts.map((e) => e.session_id)).size,
      plays: starts.length,
      rounds: solved.length,
      arcadePicks: starts.filter((e) => e.payload.mode === 'arcade').length,
      voluntaryReplays: children.reduce((n, c) => n + (c.voluntary[g] ?? 0), 0),
      finished: ends.filter((e) => e.payload.reason === 'finished').length,
      quit: ends.filter((e) => e.payload.reason === 'quit').length,
      rapidTaps: ofGame('rapid_taps', g).length,
      skill,
      liked,
    };
  });

  const favourites: Record<string, number> = {};
  for (const c of children) for (const g of c.favourite) favourites[g] = (favourites[g] ?? 0) + 1;
  return {
    sessions: children.length,
    games,
    children,
    guidedAll: children.filter((c) => c.guidedFinished.length === guided.length).length,
    guidedDone: children.filter((c) => c.guidedDone).length,
    favourites,
  };
}
