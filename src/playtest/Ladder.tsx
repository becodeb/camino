// The placement ladder (8–12 min): the fixed item bank of ladder.ts, played
// one page at a time with the full instrumentation (PlaytestLevel). After
// each item a `ladder_step`, then the character walks on to the next page
// (no scores, never "wrong"); when the ladder stops, a `ladder_end` with the
// ceiling and a cheer ("¡Muy bien! Vamos a jugar"), then the next step.

import { useEffect, useRef, useState } from 'react';
import { formatOf } from '../game/formats';
import { DEBUG } from '../screens/levelKit';
import { usePlaytest } from './context';
import { Cheer, WalkOn } from './interlude';
import {
  ceiling, decide, firstItem, itemResult, itemVerdict, newItemMemo, record, rungOf, startLadder,
  type Check, type LadderState, type StopReason,
} from './ladder';
import { pilotLevel } from './levels';
import { PlaytestLevel, type LevelEnd } from './PlaytestLevel';

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

export function Ladder() {
  const { session, next, log } = usePlaytest();
  const [start] = useState(() => {
    const s = startLadder(session?.grade ?? 1, Date.now());
    const f = firstItem(s) as { rung: number; check: Check };
    return { s, f };
  });
  const state = useRef<LadderState>(start.s);
  const [view, setView] = useState<View>({ kind: 'item', ...start.f, n: 0 });
  const memo = useRef(newItemMemo());
  const stopped = useRef(false);

  const endLadder = (reason: StopReason | 'left') => {
    if (stopped.current) return;
    stopped.current = true;
    const s = state.current;
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
    const d = decide(s, Date.now());
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
    });
    if ('stop' in d) endLadder(d.stop);
    const after: View = 'stop' in d ? { kind: 'end' } : { kind: 'walk', rung: d.rung, check: d.check, n: view.n + 1 };
    setTimeout(() => setView(after), end.outcome === 'win' ? 0 : LINGER_MS);
  };

  return (
    <PlaytestLevel
      key={`${level.id}-${view.n}`}
      level={level}
      activity="ladder"
      extra={{ concept: r.concept, rung: r.rung, item: r.item, check: view.check }}
      watch={(stats) => itemVerdict(stats, memo.current, Date.now())}
      autoNextMs={AUTO_NEXT_MS}
      onEnd={onEnd}
    />
  );
}
