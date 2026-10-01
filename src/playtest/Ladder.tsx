// The placement ladder (8–12 min): the fixed item bank of ladder.ts, played
// one page at a time with the full instrumentation (PlaytestLevel). After
// each item a `ladder_step`, then the character walks on to the next page
// (no scores, never "wrong"); when the ladder stops, a `ladder_end` with the
// ceiling and a cheer ("¡Muy bien! Vamos a jugar"), then the next step.
// Its items so far survive a reload of the tab (resume.ts): the ladder
// carries on with the item that was on screen.

import { useEffect, useRef, useState } from 'react';
import { formatOf } from '../game/formats';
import { DEBUG } from '../screens/levelKit';
import { usePlaytest } from './context';
import { BarProgressContext } from './barProgress';
import { Cheer, WalkOn } from './interlude';
import {
  capsFrom, ceiling, decide, firstItem, itemResult, itemVerdict, newItemMemo, record, rungOf, startLadder,
  type Check, type LadderState, type StopReason,
} from './ladder';
import { pilotLevel } from './levels';
import { PlaytestLevel, type LevelEnd } from './PlaytestLevel';
import { rememberPart, resumedPart } from './resume';

/** Said while the character walks to the next page (in turn, never about how it went). */
const WALK_LINES = ['¡Vamos a la próxima!', '¡Seguimos!', '¡Otra hoja!', '¡A ver esta!'];
/** A solved page the child does not turn turns by itself. */
const AUTO_NEXT_MS = 8000;
/** A last look at the page before walking on. */
const LINGER_MS = 900;

type View =
  | { kind: 'item'; rung: number; check: Check; n: number }
  | { kind: 'walk'; rung: number; check: Check; n: number }
  | { kind: 'end' };

interface SavedLadder { state: LadderState; ended: boolean }

/** The caps (`?caps=fast` for the scripted checks). */
const CAPS_NOW = capsFrom(typeof location !== 'undefined' ? location.search : '');

export function Ladder() {
  const { session, next, log } = usePlaytest();
  const [start] = useState(() => {
    const saved = resumedPart<SavedLadder>('ladder');
    if (saved?.state && Array.isArray(saved.state.items)) {
      const d = saved.ended ? null : decide(saved.state, Date.now(), CAPS_NOW);
      const view: View = !d || 'stop' in d ? { kind: 'end' } : { kind: 'item', rung: d.rung, check: d.check, n: saved.state.items.length };
      return { s: saved.state, view, ended: saved.ended, stop: d && 'stop' in d ? d.stop : null };
    }
    const s = startLadder(session?.grade ?? 1, Date.now());
    const f = firstItem(s) as { rung: number; check: Check };
    return { s, view: { kind: 'item', ...f, n: 0 } as View, ended: false, stop: null };
  });
  const state = useRef<LadderState>(start.s);
  const [view, setView] = useState<View>(start.view);
  const memo = useRef(newItemMemo());
  const stopped = useRef(start.ended);

  const endLadder = (reason: StopReason | 'left') => {
    if (stopped.current) return;
    stopped.current = true;
    const s = state.current;
    rememberPart('ladder', { state: s, ended: true } satisfies SavedLadder);
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
      go: (rung: number) => { memo.current = newItemMemo(); setView((v) => ({ kind: 'item', rung, check: 'climb', n: ('n' in v ? v.n : 0) + 1 })); },
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
        seed={40 + view.n}
        line={WALK_LINES[(view.n - 1) % WALK_LINES.length]}
        done={() => { memo.current = newItemMemo(); setView({ ...view, kind: 'item' }); }}
      />
    );
  }

  const r = rungOf(view.rung);
  const level = pilotLevel(r.item)!;

  const onEnd = (end: LevelEnd) => {
    const result = itemResult(end);
    const s = record(state.current, { rung: r.rung, check: view.check, result });
    state.current = s;
    rememberPart('ladder', { state: s, ended: false } satisfies SavedLadder);
    const d = decide(s, Date.now(), CAPS_NOW);
    log('ladder_step', {
      concept: r.concept,
      rung: r.rung,
      item: r.item,
      format: formatOf(level),
      check: view.check,
      result,
      next: 'rung' in d ? rungOf(d.rung).item : null,
      time_ms: end.time_ms,
      help_levels: end.help_levels,
      adult_helped: end.adult_helped,
      attempts: end.attempts,
      outcome: end.outcome,
      end_reason: end.end_reason ?? (end.outcome === 'win' ? 'solved' : 'left'),
    });
    if ('stop' in d) endLadder(d.stop);
    const after: View = 'stop' in d ? { kind: 'end' } : { kind: 'walk', rung: d.rung, check: d.check, n: view.n + 1 };
    setTimeout(() => setView(after), end.outcome === 'win' ? 0 : LINGER_MS);
  };

  // the bar: a stone (with its seed) per item met so far, and the one on screen circled; a path that grows (the ladder's length depends on the child)
  const items = state.current.items.length;
  return (
    <BarProgressContext.Provider value={{ kind: 'dots', done: [...Array.from({ length: items }, () => true), false], here: items }}>
      <PlaytestLevel
        key={`${level.id}-${view.n}`}
        level={level}
        activity="ladder"
        extra={{ concept: r.concept, rung: r.rung, item: r.item, check: view.check }}
        watch={(stats) => {
          const reason = itemVerdict(stats, memo.current, Date.now(), { caps: CAPS_NOW, ladderStart: state.current.startedAt });
          return reason ? { outcome: 'fail', reason } : null;
        }}
        autoNextMs={AUTO_NEXT_MS}
        onEnd={onEnd}
      />
    </BarProgressContext.Provider>
  );
}
