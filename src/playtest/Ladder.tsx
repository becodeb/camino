// The placement ladder (8–12 min): the fixed item bank of ladder.ts, played
// one page at a time with the full instrumentation (PlaytestLevel). After
// each item a `ladder_step`, then the character walks on to the next page
// (no scores, never "wrong"); when the ladder stops, a `ladder_end` with the
// ceiling and a cheer ("¡Muy bien! Vamos a jugar"), then the next step.
// Its items so far survive a reload of the tab (resume.ts): the ladder
// carries on with the item that was on screen.
//
// T39, 4to's long ladder (ladder.ts `long`): its own caps, a rung's second
// item after a first one not passed (`variant` in `ladder_step`), rungs
// 13–18 on the Workshop's blocks (LadderVmItem.tsx), word-picture labels
// from the first item (no picture-first blocks at 4to), and the climbing
// path beside the page (ClimbPath.tsx) instead of the bar's dots.
// T39 review fixes: the page's goal large inside the screen under the bar
// (PlaytestLevel `goal`, as rungs 13–18 show theirs) and the arrow blocks
// carry their word too (ArrowWordsContext: "arriba", "derecha"…).

import { useEffect, useRef, useState } from 'react';
import { formatOf } from '../game/formats';
import { DEBUG } from '../screens/levelKit';
import { usePlaytest } from './context';
import { BarProgressContext } from './barProgress';
import { Cheer, WalkOn } from './interlude';
import {
  capsFrom, ceiling, decide, firstItem, itemOf, itemResult, itemVerdict, newItemMemo, record, rungOf, startLadder, TOP_LONG,
  type Check, type LadderState, type StopReason,
} from './ladder';
import { pilotLevel } from './levels';
import { ArrowWordsContext } from '../blocks/blocks';
import { vmItem } from './ladderVm';
import { LadderVmItem } from './LadderVmItem';
import { ClimbPath } from './ClimbPath';
import type { LevelDef } from '../game/levels';
import { PlaytestLevel, type LevelEnd } from './PlaytestLevel';
import { rememberPart, resumedPart } from './resume';
import { noteLadderCeiling } from './copa2/store';
import { wrapPending } from './flow';

/** Said while the character walks to the next page (in turn, never about how it went). */
const WALK_LINES = ['¡Vamos a la próxima!', '¡Seguimos!', '¡Otra hoja!', '¡A ver esta!'];
/** A solved page the child does not turn turns by itself. */
const AUTO_NEXT_MS = 8000;
/** A last look at the page before walking on. */
const LINGER_MS = 900;

type View =
  | { kind: 'item'; rung: number; check: Check; n: number; variant?: 1 }
  | { kind: 'walk'; rung: number; check: Check; n: number; variant?: 1 }
  | { kind: 'end' };

interface SavedLadder { state: LadderState; ended: boolean }

/** The caps (`?caps=fast` for the scripted checks; T39: 4to's long ladder has its own). */
const capsOf = (s: LadderState) => capsFrom(typeof location !== 'undefined' ? location.search : '', !!s.long);

/** T39: 4to reads: word first on every block (the round-2 pages up to rung 8 are picture-first, for 1ro). */
const forLong = (l: LevelDef): LevelDef => (l.blockLabel === 'word-picture' ? l : { ...l, blockLabel: 'word-picture' });

export function Ladder() {
  const api = usePlaytest();
  const { session, next, log } = api;
  const apiRef = useRef(api);
  apiRef.current = api;
  /** "Quedan 5 minutos" (T14): the item on screen is the last one. */
  const wrapping = () => wrapPending(apiRef.current.flow);
  const [start] = useState(() => {
    const saved = resumedPart<SavedLadder>('ladder');
    if (saved?.state && Array.isArray(saved.state.items)) {
      const d = saved.ended ? null : decide(saved.state, Date.now(), capsOf(saved.state));
      const view: View = !d || 'stop' in d ? { kind: 'end' } : { kind: 'item', rung: d.rung, check: d.check, n: saved.state.items.length, ...(d.variant ? { variant: d.variant } : {}) };
      return { s: saved.state, view, ended: saved.ended, stop: d && 'stop' in d ? d.stop : null };
    }
    const s = startLadder(session?.grade ?? 1, Date.now());
    const f = firstItem(s) as { rung: number; check: Check };
    return { s, view: { kind: 'item', ...f, n: 0 } as View, ended: false, stop: null };
  });
  const state = useRef<LadderState>(start.s);
  const caps = capsOf(start.s);
  const [view, setView] = useState<View>(start.view);
  const memo = useRef(newItemMemo());
  const stopped = useRef(start.ended);

  const endLadder = (reason: StopReason | 'left') => {
    if (stopped.current) return;
    stopped.current = true;
    const s = state.current;
    rememberPart('ladder', { state: s, ended: true } satisfies SavedLadder);
    // C10: 4to's Copa places the child by this (Copa v2 starts at copa 2 or 3 for a child who passed `repetir`/conditions)
    noteLadderCeiling(session?.id, ceiling(s));
    log('ladder_end', {
      entry_rung: s.entry,
      ceiling_rung: ceiling(s),
      items: s.items.length,
      time_ms: Date.now() - s.startedAt,
      reason,
    });
  };

  // screenshots (?debug): open any rung of the bank
  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __ladder: unknown }).__ladder = {
      state: () => state.current,
      go: (rung: number, variant?: 1) => { memo.current = newItemMemo(); setView((v) => ({ kind: 'item', rung, check: 'climb', n: ('n' in v ? v.n : 0) + 1, ...(variant ? { variant } : {}) })); },
      view: () => view,
    };
  }, []);

  // resumed after a reload with the ladder over by now (its time ran out)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (start.stop) endLadder(start.stop); }, []);

  // the flow moved on mid-ladder (the adult ended the session or skipped the step)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => endLadder('left'), []);

  if (view.kind === 'end') {
    return <Cheer line="¡Muy bien!" say="¡Muy bien! Vamos a jugar." done={next} />;
  }
  if (view.kind === 'walk') {
    return (
      <WalkOn
        key={`walk-${view.n}`}
        line={WALK_LINES[(view.n - 1) % WALK_LINES.length]}
        done={() => {
          if (wrapping()) { endLadder('wrap_up'); setView({ kind: 'end' }); return; }
          memo.current = newItemMemo();
          setView({ ...view, kind: 'item' });
        }}
      />
    );
  }

  const r = rungOf(view.rung);
  const variant = view.variant ?? 0;
  const itemId = itemOf(r, variant);
  const vm = r.engine === 'vm' ? vmItem(itemId) : null;
  const page = vm ? null : pilotLevel(itemId)!;
  const level = page && state.current.long ? forLong(page) : page;
  const long = !!state.current.long;

  const onEnd = (end: LevelEnd) => {
    const result = itemResult(end);
    const s = record(state.current, { rung: r.rung, check: view.check, result, ...(view.variant ? { variant: view.variant } : {}) });
    state.current = s;
    rememberPart('ladder', { state: s, ended: false } satisfies SavedLadder);
    const d: ReturnType<typeof decide> = wrapping() ? { stop: 'wrap_up' } : decide(s, Date.now(), caps);
    log('ladder_step', {
      concept: r.concept,
      rung: r.rung,
      item: itemId,
      format: vm ? vm.format : formatOf(level!),
      check: view.check,
      result,
      // T39: 0 the rung's first item, 1 its second (4to's long ladder)
      variant,
      ...(vm ? { engine: 'vm' } : {}),
      next: 'rung' in d ? itemOf(rungOf(d.rung), d.variant ?? 0) : null,
      time_ms: end.time_ms,
      help_levels: end.help_levels,
      adult_helped: end.adult_helped,
      attempts: end.attempts,
      outcome: end.outcome,
      end_reason: end.end_reason ?? (end.outcome === 'win' ? 'solved' : 'left'),
    });
    if ('stop' in d) endLadder(d.stop);
    const after: View = 'stop' in d ? { kind: 'end' } : { kind: 'walk', rung: d.rung, check: d.check, n: view.n + 1, ...(d.variant ? { variant: d.variant } : {}) };
    setTimeout(() => setView(after), end.outcome === 'win' ? 0 : LINGER_MS);
  };

  const watch = (stats: Parameters<typeof itemVerdict>[0]) => {
    const reason = itemVerdict(stats, memo.current, Date.now(), { caps, ladderStart: state.current.startedAt });
    return reason ? { outcome: 'fail' as const, reason } : null;
  };
  const extra = { concept: r.concept, rung: r.rung, item: itemId, check: view.check, ...(long ? { variant } : {}) };
  const body = vm ? (
    <LadderVmItem key={`${itemId}-${view.n}`} item={vm} extra={extra} watch={watch} autoNextMs={AUTO_NEXT_MS} onEnd={onEnd} />
  ) : (
    <PlaytestLevel
      key={`${level!.id}-${view.n}`}
      level={level!}
      activity="ladder"
      extra={extra}
      watch={watch}
      autoNextMs={AUTO_NEXT_MS}
      onEnd={onEnd}
      goal={long}
    />
  );

  // T39: the long ladder's climbing path beside the page
  if (long) {
    const passed = state.current.items.filter((a) => a.result === 'pass').map((a) => a.rung);
    const from = Math.min(state.current.entry, ...state.current.items.map((a) => a.rung), view.rung);
    return (
      <BarProgressContext.Provider value={null}>
        <div className="pp-climb-wrap" data-rung={r.rung} data-variant={variant}>
          <aside className="pp-climb-col" aria-label="Tu escalera"><ClimbPath from={from} top={TOP_LONG} passed={passed} here={r.rung} /></aside>
          <div className="pp-climb-page"><ArrowWordsContext.Provider value>{body}</ArrowWordsContext.Provider></div>
        </div>
      </BarProgressContext.Provider>
    );
  }

  // the bar: a stone (with its seed) per item met so far, and the one on screen circled; a path that grows (the ladder's length depends on the child)
  const items = state.current.items.length;
  return (
    <BarProgressContext.Provider value={{ kind: 'dots', done: [...Array.from({ length: items }, () => true), false], here: items }}>
      {body}
    </BarProgressContext.Provider>
  );
}
