// A level page played inside the playtest, instrumented through its
// LevelNav (screens/levelKit.tsx) so the level pages themselves stay as the
// demo has them: `level_start` when it opens; a `run` per ▶ (the program as
// run and its result); `speak`, `tap_add`, `drag`; ✋ in three steps
// (`help` 1–3: the instruction again and the goal glowing, the next-step
// hint with the ghost hand, the solution's footprints; a fourth press raises
// the character's hand, `call_adult`); holding ✋ 1 s raises it at once; and
// `level_end` (outcome, time, attempts, help, blocks, adult help) when the
// child turns the page, the step's `watch` ends it, or the flow moves on.
//
// A step component plugs a level in with:
//   <PlaytestLevel key={id} level={pilotLevel(id)!} activity="ladder"
//     extra={{ concept, rung, item }} onEnd={(r) => …} watch={(s) => …} />

import { useEffect, useMemo, useRef } from 'react';
import { progress, solve } from '../curriculum/progress';
import { formatOf } from '../game/formats';
import type { LevelDef } from '../game/levels';
import type { Program } from '../game/model';
import { LevelScreen } from '../screens/LevelScreen';
import { LevelNavContext, type LevelNav, type RunReport } from '../screens/levelKit';
import { glowTargets } from '../ui/ghost';
import { speak } from '../ui/speech';
import { HAND_HOLD_HELP_MS, useHold } from './AdultControls';
import { usePlaytest, type LevelTrack } from './context';
import { showFootprints } from './footprints';
import { blocksOf, programText } from './levels';

export type LevelOutcome = 'win' | 'fail' | 'skipped';

/** What a step's `watch` sees after every run and every help. */
export interface LevelStats {
  level_id: string;
  startedAt: number;
  /** Presses of ▶ (empty and incomplete notebooks included). */
  runs: number;
  wins: number;
  lastResult: string | null;
  helpStep: number;
  adultHelped: boolean;
  /** The page was solved (the child may not have turned it yet). */
  won: boolean;
}

/** The `level_end` payload (docs/prueba-piloto-datos.md). */
export interface LevelEnd {
  level_id: string;
  activity: string;
  outcome: LevelOutcome;
  time_ms: number;
  attempts: number;
  help_levels: number;
  blocks_used?: number;
  blocks_optimal: number;
  adult_helped: boolean;
  [extra: string]: unknown;
}

const LINES = {
  prints: 'Mirá las huellitas: por ahí se llega.',
};

export function PlaytestLevel({ level, activity, extra, onEnd, watch }: {
  level: LevelDef;
  activity: string;
  /** Merged into level_start and level_end (the ladder's concept, rung and item). */
  extra?: Record<string, unknown>;
  onEnd(result: LevelEnd): void;
  /** Return an outcome to end the level now (the ladder's floor rule); null keeps it open. */
  watch?(stats: LevelStats): LevelOutcome | null;
}) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const props = useRef({ activity, extra, onEnd, watch });
  props.current = { activity, extra, onEnd, watch };
  const stats = useRef<LevelStats>({ level_id: level.id, startedAt: Date.now(), runs: 0, wins: 0, lastResult: null, helpStep: 0, adultHelped: false, won: false });
  const lastProgram = useRef<Program | null>(null);
  const ghostSinceRun = useRef(false);
  const ended = useRef(false);
  const track = useRef<LevelTrack>({ id: level.id, helpStep: 0, adultHelped: false });

  const end = (outcome: LevelOutcome, notify = true) => {
    if (ended.current) return;
    ended.current = true;
    const s = stats.current;
    const t = track.current;
    const payload: LevelEnd = {
      level_id: level.id,
      activity: props.current.activity,
      outcome,
      time_ms: Date.now() - s.startedAt,
      attempts: s.runs,
      help_levels: s.helpStep,
      ...(lastProgram.current ? { blocks_used: blocksOf(lastProgram.current) } : {}),
      blocks_optimal: blocksOf(level.solution),
      adult_helped: t.adultHelped,
      ...props.current.extra,
    };
    apiRef.current.log('level_end', payload);
    if (apiRef.current.level.current === t) apiRef.current.level.current = null;
    if (notify) props.current.onEnd(payload);
  };

  const check = () => {
    const s = stats.current;
    s.adultHelped = track.current.adultHelped;
    const verdict = props.current.watch?.(s);
    if (verdict) end(verdict);
  };

  useEffect(() => {
    const a = apiRef.current;
    a.level.current = track.current;
    a.log('level_start', { level_id: level.id, activity: props.current.activity, format: formatOf(level) === 'solve' && level.save ? 'save_blocks' : formatOf(level), ...props.current.extra });
    a.did(props.current.activity);
    // the flow moved on (the adult ended the session, skipped the step): the level ends where it was
    return () => end(stats.current.won ? 'win' : 'skipped', false);
    // one level per mount (the step keys it by id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // holding ✋ for a second raises the hand at once (the click that ends the hold does not count as a help)
  useHold(HAND_HOLD_HELP_MS, (e) => !!(e.target as Element | null)?.closest?.('.level-bar .help'), () => apiRef.current.raiseHand('help_held'));

  const nav = useMemo<LevelNav>(() => ({
    pages: () => null,
    title: (l) => <><b>Prueba piloto · {props.current.activity}</b> {l.id} · {l.title}</>,
    won: (l) => {
      stats.current.won = true;
      stats.current.wins++;
      progress.update((p) => solve(p, l.id));
    },
    next: () => end(stats.current.won ? 'win' : 'skipped'),
    quit: '#/piloto',
    onRunReport: (r: RunReport) => {
      const s = stats.current;
      s.runs++;
      s.lastResult = r.result;
      lastProgram.current = r.program;
      apiRef.current.log('run', {
        level_id: level.id,
        result: r.result,
        blocks_used: blocksOf(r.program),
        attempt: s.runs,
        program: programText(r.program),
        after_ghost: ghostSinceRun.current,
        help_step: s.helpStep,
        ...(r.worlds ? { worlds: r.worlds } : {}),
        ...(r.culprit ? { culprit: r.culprit } : {}),
        ...(r.guess ? { guess: r.guess, final: r.final } : {}),
      });
      ghostSinceRun.current = false;
      check();
    },
    onSpeak: (l) => apiRef.current.log('speak', { level_id: l.id }),
    onTapAdd: (l) => apiRef.current.log('tap_add', { level_id: l.id }),
    onDrag: (phase, info) => apiRef.current.log('drag', { level_id: level.id, phase, ...(info ? { success: info.success, outcome: info.outcome, from: info.from } : {}) }),
    onIntro: (l) => { ghostSinceRun.current = true; apiRef.current.log('ghost_demo', { level_id: l.id, kind: 'intro' }); },
    help: (l, show) => {
      const a = apiRef.current;
      const s = stats.current;
      const root = document.querySelector<HTMLElement>('main.level');
      // while a run plays, or once the page is solved, ✋ does nothing on the page: nothing to count either
      if (root?.dataset.busy === 'true' || s.won) return;
      if (s.helpStep >= 3) { a.raiseHand('help_step_3'); return; }
      const step = s.helpStep + 1;
      s.helpStep = step;
      track.current.helpStep = step;
      a.log('help', { level_id: l.id, step });
      if (step === 1) {
        speak(l.say);
        if (root) glowTargets(root, 3200);
      } else if (step === 2) {
        show();
        ghostSinceRun.current = true;
        a.log('ghost_demo', { level_id: l.id, kind: 'hint' });
      } else {
        const drawn = root ? showFootprints(root, l) : false;
        if (drawn) speak(LINES.prints); else show();
        ghostSinceRun.current = true;
        a.log('ghost_demo', { level_id: l.id, kind: drawn ? 'footprints' : 'hint' });
      }
      check();
    },
    className: 'pp-level',
  // one nav per level
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [level]);

  return (
    <LevelNavContext.Provider value={nav}>
      <LevelScreen key={level.id} level={level} />
    </LevelNavContext.Provider>
  );
}
