// A level page played inside the playtest, instrumented through its
// LevelNav (screens/levelKit.tsx) so the level pages themselves stay as the
// demo has them: `level_start` when it opens; a `run` per ▶ (the program as
// run and its result); `speak`, `tap_add`, `drag`; ✋ in three steps
// (`help` 1–3: the instruction again and the goal glowing, the next-step
// hint with the ghost hand, the solution's footprints; a fourth press raises
// the character's hand, `call_adult`); holding ✋ 1 s raises it at once; and
// `level_end` (outcome, time, attempts, help, blocks, adult help) when the
// child turns the page, the step's `watch` ends it, or the flow moves on.
// The bar shows the page's own title only (never an id): a child may read it.
//
// A step component plugs a level in with:
//   <PlaytestLevel key={id} level={pilotLevel(id)!} activity="ladder"
//     extra={{ concept, rung, item }} onEnd={(r) => …} watch={(s) => …} />
// `watch` also runs every few seconds (a time limit); `listen` sees every
// event the page logs (the tool check's gestures); `autoNextMs` turns a
// solved page by itself if the child does not.
//
// `Instrumented` is the same instrumentation around a page someone else
// hosts (free play's sheets, workshop and corkboard pages): it reads the
// page's own LevelNav (`base`) and keeps what it does (its pages, seed,
// doors, next page), adding the events on top. Every page solved in the
// playtest plants a seed (the progress's `solve`, once per page).

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { progress, solve } from '../curriculum/progress';
import { formatOf } from '../game/formats';
import type { LevelDef } from '../game/levels';
import { LevelScreen } from '../screens/LevelScreen';
import { LevelNavContext, LevelWrapContext, useLevelNav, type LevelNav, type RunReport } from '../screens/levelKit';
import { glowTargets } from '../ui/ghost';
import { speak } from '../ui/speech';
import { HAND_HOLD_HELP_MS, useHold } from './AdultControls';
import { withName } from './characterName';
import { usePlaytest, type LevelTrack } from './context';
import { showFootprints } from './footprints';
import { blocksOf, isFailedRun, optimalBlocks, programText, ruleBlocksOf, rulesText } from './levels';
import { BarProgressView } from './barProgress';
import { SeedPouch } from '../screens/yearKit';

export type LevelOutcome = 'win' | 'fail' | 'skipped';

/** What a step's `watch` sees after every run and every help. */
export interface LevelStats {
  level_id: string;
  startedAt: number;
  /** Presses of ▶ (empty and incomplete notebooks included). */
  runs: number;
  /** Runs that ran and did not win (levels.ts `isFailedRun`). */
  fails: number;
  wins: number;
  lastResult: string | null;
  helpStep: number;
  adultHelped: boolean;
  /** The page was solved (the child may not have turned it yet). */
  won: boolean;
  /** The child's last input on the page (a tap, a drag, a key), or the page's start. */
  lastInputAt: number;
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
  /** Why `watch` ended it (the ladder's caps, ladder.ts EndReason); absent otherwise. */
  end_reason?: string;
  [extra: string]: unknown;
}

const LINES = {
  prints: 'Mirá las huellitas: por ahí se llega.',
};

/** How often `watch` also runs with no run or help (for a time limit). */
const WATCH_TICK_MS = 5000;

export interface InstrumentProps {
  level: LevelDef;
  activity: string;
  /** Merged into level_start and level_end (the ladder's concept, rung and item). */
  extra?: Record<string, unknown>;
  onEnd(result: LevelEnd): void;
  /**
   * Return an outcome (or an outcome and its reason, logged as `end_reason`)
   * to end the level now (the ladder's floor rule and caps); null keeps it
   * open. Runs after every run, help and input, when the tab shows again,
   * and every few seconds.
   */
  watch?(stats: LevelStats): LevelOutcome | { outcome: LevelOutcome; reason: string } | null;
  /** Every event the page logs, as it is logged. */
  listen?(type: string, payload: Record<string, unknown>): void;
  /** Once solved, the page turns by itself after this long. */
  autoNextMs?: number;
}

/** A level page of the playtest's own (the tool check, the ladder, the rule game), instrumented. */
export function PlaytestLevel(props: InstrumentProps) {
  return (
    <LevelWrapContext.Provider value={null}>
      <Instrumented {...props} base={null}>
        <LevelScreen key={props.level.id} level={props.level} />
      </Instrumented>
    </LevelWrapContext.Provider>
  );
}

/** A level page hosted by another screen (its LevelNav is `base`), instrumented. */
export function InstrumentedPage(props: InstrumentProps & { children: ReactNode }) {
  const base = useLevelNav();
  return <Instrumented {...props} base={base} />;
}

function Instrumented({ level, activity, extra, onEnd, watch, listen, autoNextMs, base, children }: InstrumentProps & { base: LevelNav | null; children: ReactNode }) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const props = useRef({ activity, extra, onEnd, watch, listen });
  props.current = { activity, extra, onEnd, watch, listen };
  const stats = useRef<LevelStats>((() => {
    const now = Date.now();
    return { level_id: level.id, startedAt: now, runs: 0, fails: 0, wins: 0, lastResult: null, helpStep: 0, adultHelped: false, won: false, lastInputAt: now };
  })());
  /** What the page reports before it ends from outside (a rule game still running). */
  const flushers = useRef(new Set<() => void>());
  /** The last run's cards. */
  const lastBlocks = useRef<number | null>(null);
  const ghostSinceRun = useRef(false);
  const ended = useRef(false);
  const track = useRef<LevelTrack>({ id: level.id, helpStep: 0, adultHelped: false });

  const end = (outcome: LevelOutcome, notify = true, reason?: string) => {
    if (ended.current) return;
    ended.current = true;
    // a game still running counts as a run before the page's numbers are taken
    for (const f of [...flushers.current]) f();
    const s = stats.current;
    const t = track.current;
    const payload: LevelEnd = {
      level_id: level.id,
      activity: props.current.activity,
      outcome,
      time_ms: Date.now() - s.startedAt,
      attempts: s.runs,
      help_levels: s.helpStep,
      ...(lastBlocks.current != null ? { blocks_used: lastBlocks.current } : {}),
      blocks_optimal: optimalBlocks(level),
      adult_helped: t.adultHelped,
      ...(reason ? { end_reason: reason } : {}),
      ...props.current.extra,
    };
    log('level_end', payload);
    // a hand raised on this page and never answered: the child moved on
    apiRef.current.lowerHand('moved_on', level.id);
    if (apiRef.current.level.current === t) apiRef.current.level.current = null;
    if (notify) props.current.onEnd(payload);
  };

  const log = (type: string, payload: Record<string, unknown>) => {
    apiRef.current.log(type, payload);
    props.current.listen?.(type, payload);
  };

  const check = () => {
    if (ended.current) return;
    const s = stats.current;
    s.adultHelped = track.current.adultHelped;
    const verdict = props.current.watch?.(s);
    if (!verdict) return;
    if (typeof verdict === 'string') end(verdict);
    else end(verdict.outcome, true, verdict.reason);
  };

  useEffect(() => {
    const a = apiRef.current;
    a.level.current = track.current;
    log('level_start', { level_id: level.id, activity: props.current.activity, format: formatOf(level) === 'solve' && level.save ? 'save_blocks' : formatOf(level), ...props.current.extra });
    a.did(props.current.activity);
    // the flow moved on (the adult ended the session, skipped the step): the level ends where it was
    return () => end(stats.current.won ? 'win' : 'skipped', false);
    // one level per mount (the step keys it by id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a time limit: the step's watch also runs every few seconds, and at once
  // when the tab shows again (a hidden tab's timers are throttled: round 1's
  // rule-game item ran 234 s in a background tab before its 3-minute check fired)
  useEffect(() => {
    if (!props.current.watch) return;
    const id = setInterval(check, WATCH_TICK_MS);
    const onShow = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onShow); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the child's input (any tap, drag or key on the page; the ghost hand's moves are not events): the idle cap's clock
  useEffect(() => {
    const on = (e: Event) => {
      if (!e.isTrusted) return;
      stats.current.lastInputAt = Date.now();
    };
    window.addEventListener('pointerdown', on, true);
    window.addEventListener('keydown', on, true);
    return () => { window.removeEventListener('pointerdown', on, true); window.removeEventListener('keydown', on, true); };
  }, []);

  // holding ✋ for a second raises the hand at once (the click that ends the hold does not count as a help)
  useHold(HAND_HOLD_HELP_MS, (e) => !!(e.target as Element | null)?.closest?.('.level-bar .help'), () => apiRef.current.raiseHand('help_held'));

  const nav = useMemo<LevelNav>(() => ({
    ...base,
    // round 2: no page icons, doors or boss in the bar, only the activity's simple progress (barProgress.tsx)
    pages: () => <BarProgressView />,
    // every playtest page shows the seed pouch
    aside: base?.aside ?? <SeedPouch />,
    // a child may read it: the page's own title, never an id, with the chosen character's name
    title: (l) => withName(l.title, progress.get().character),
    won: (l, program) => {
      stats.current.won = true;
      stats.current.wins++;
      // solved with the hand up and nobody came: it goes down
      apiRef.current.lowerHand('self', level.id);
      const line = base?.won(l, program);
      // every page solved plants a seed (a gold challenge's page was stamped by its own nav: no seed, as in the year)
      if (!base?.className?.includes('is-gold')) progress.update((p) => solve(p, l.id));
      if (autoNextMs != null) setTimeout(() => end('win'), autoNextMs);
      return line;
    },
    next: (l) => {
      end(stats.current.won ? 'win' : 'skipped');
      base?.next(l);
    },
    quit: base?.quit ?? '#/piloto',
    onRunReport: (r: RunReport) => {
      const s = stats.current;
      s.runs++;
      s.lastResult = r.result;
      if (isFailedRun(level, r.result, r.program)) s.fails++;
      const blocks = r.rules ? ruleBlocksOf(r.rules) : blocksOf(r.program);
      lastBlocks.current = blocks;
      log('run', {
        level_id: level.id,
        result: r.result,
        blocks_used: blocks,
        attempt: s.runs,
        program: r.rules ? rulesText(r.rules) : programText(r.program),
        after_ghost: ghostSinceRun.current,
        help_step: s.helpStep,
        ...(r.keys != null ? { keys: r.keys, score: r.score ?? 0 } : {}),
        ...(r.worlds ? { worlds: r.worlds } : {}),
        ...(r.culprit ? { culprit: r.culprit } : {}),
        ...(r.guess ? { guess: r.guess, final: r.final } : {}),
      });
      ghostSinceRun.current = false;
      check();
    },
    onSpeak: (l) => log('speak', { level_id: l.id }),
    onTapAdd: (l) => log('tap_add', { level_id: l.id }),
    onDrag: (phase, info) => log('drag', { level_id: level.id, phase, ...(info ? { success: info.success, outcome: info.outcome, from: info.from } : {}) }),
    onIntro: (l) => { ghostSinceRun.current = true; log('ghost_demo', { level_id: l.id, kind: 'intro' }); },
    onEnding: (flush) => {
      flushers.current.add(flush);
      return () => { flushers.current.delete(flush); };
    },
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
      log('help', { level_id: l.id, step });
      if (step === 1) {
        speak(l.say);
        if (root) glowTargets(root, 3200);
      } else if (step === 2) {
        show();
        ghostSinceRun.current = true;
        log('ghost_demo', { level_id: l.id, kind: 'hint' });
      } else {
        const drawn = root ? showFootprints(root, l) : false;
        if (drawn) speak(LINES.prints); else show();
        ghostSinceRun.current = true;
        log('ghost_demo', { level_id: l.id, kind: drawn ? 'footprints' : 'hint' });
      }
      check();
    },
    className: [base?.className, 'pp-level'].filter(Boolean).join(' '),
  // one nav per level
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [level, base]);

  return <LevelNavContext.Provider value={nav}>{children}</LevelNavContext.Provider>;
}
