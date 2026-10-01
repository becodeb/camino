// The tool check (30–60 s for a child who knows the tool): the two tiny
// pages of toolCheck.ts played with the full instrumentation
// (PlaytestLevel), one gesture at a time. The gesture's target gets a blue
// pen ring and the gesture is said; the page's 🔊 and ✋ step 1 say it
// again (the page's `say` follows it). An asked gesture (the arrow into the
// notebook, ▶, an arrow in again) counts however it is done (tap or drag);
// not done in 8 s, the ghost hand shows it; 15 s, the check moves on. ↺ and
// ✋ are only shown: the ghost points at each while it is said what it does,
// a press is welcome, nothing waits for it. From the first gesture done, a
// drawn "seguir" arrow (bottom right, away from the board) lets the child
// go on at once. Every gesture logs `tool_check` {gesture, done, asked,
// time_ms, attempts, shown_by_ghost, level_id, via?, skipped?}; the page
// itself logs its `tap_add` and `drag` events as everywhere.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { penLoop } from '../ink/ink.js';
import { playGhost, type DemoStep, type GhostRun } from '../ui/ghost';
import { speak } from '../ui/speech';
import { usePlaytest } from './context';
import { WalkOn } from './interlude';
import { PlaytestLevel } from './PlaytestLevel';
import { BarProgressContext } from './barProgress';
import { useBar } from './Captions';
import { GoOnArt } from './round2Art';
import { GESTURES, GHOST_AFTER_MS, LINES, MOVE_ON_MS, SHOW_MS, gestureHit, toolLevels, type Gesture } from './toolCheck';

const PEN = '#3d6ea5';
const IGNORE_END = () => {};

/** A pen ring that keeps pulsing around the gesture's target until removed. */
function cueRing(root: HTMLElement, selector: string): () => void {
  const el = root.querySelector(selector);
  const layer = document.querySelector('.ghost-layer') ?? document.body.appendChild(Object.assign(document.createElement('div'), { className: 'ghost-layer' }));
  if (!el) return () => {};
  const r = el.getBoundingClientRect();
  const pad = Math.max(10, Math.min(r.width, r.height) * 0.2);
  const w = r.width + pad * 2, h = r.height + pad * 2;
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('class', 'pp-cue');
  ring.setAttribute('viewBox', `0 0 ${w} ${h}`);
  Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${w}px`, height: `${h}px` });
  ring.innerHTML = `<path d="${penLoop(w / 2, h / 2, w / 2 - 4, h / 2 - 4, { seed: 11 })}" fill="none" stroke="${PEN}" stroke-width="3.6" stroke-linecap="round" filter="url(#boil)"/>`;
  layer.append(ring);
  return () => ring.remove();
}

/** "Seguir", in the page's bar before ✋ (never over the board or its goal). */
function GoOn({ onClick }: { onClick: () => void }) {
  const bar = useBar();
  if (!bar) return null;
  return createPortal(<button type="button" className="pp-go-on cut pop-in" aria-label="Seguir" onClick={onClick}><GoOnArt /></button>, bar);
}

const ghostStep = (g: Gesture): DemoStep => (g.ghost.do === 'point' ? { do: 'point', at: [g.ghost.at] } : g.ghost.do === 'tap' ? { do: 'tap', at: g.ghost.at } : { do: 'drag', from: g.ghost.from, to: g.ghost.to });

interface Doing {
  i: number;
  at: number;
  attempts: number;
  ghost: boolean;
  via?: string;
}

export function ToolCheck() {
  const { next, log } = usePlaytest();
  const levels = useMemo(() => toolLevels(), []);
  const [gi, setGi] = useState(0);
  const [walk, setWalk] = useState(false);
  /** The "seguir" arrow: from the first gesture done. */
  const [canGo, setCanGo] = useState(false);
  const doing = useRef<Doing>({ i: 0, at: Date.now(), attempts: 0, ghost: false });
  const ghostRun = useRef<GhostRun | null>(null);
  const finished = useRef(false);
  const g = GESTURES[gi];
  const page = g?.page ?? 1;
  const level = levels[page];

  const logGesture = (cur: Gesture, d: Doing, done: boolean, skipped = false) => {
    log('tool_check', {
      gesture: cur.id,
      done,
      asked: cur.asked,
      time_ms: Date.now() - d.at,
      attempts: d.attempts,
      shown_by_ghost: d.ghost,
      level_id: levels[cur.page].id,
      ...(d.via ? { via: d.via } : {}),
      ...(skipped ? { skipped: true } : {}),
    });
  };

  const end = (line: boolean) => {
    finished.current = true;
    ghostRun.current?.cancel();
    if (line) {
      setTimeout(() => speak(LINES.done), 500);
      setTimeout(() => setWalk(true), 2600);
    } else {
      setWalk(true);
    }
  };

  const finish = (done: boolean) => {
    const d = doing.current;
    const cur = GESTURES[d.i];
    if (!cur || finished.current) return;
    ghostRun.current?.cancel();
    logGesture(cur, d, done);
    if (done) setCanGo(true);
    const n = d.i + 1;
    doing.current = { i: n, at: Date.now(), attempts: 0, ghost: false };
    if (n >= GESTURES.length) { end(true); return; }
    // the first page's win plays out before the second page comes
    const turn = GESTURES[n].page !== cur.page;
    setTimeout(() => { doing.current.at = Date.now(); setGi(n); }, turn ? 2200 : 500);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  /** "Seguir": the rest is left (each logged, skipped), on to the ladder. */
  const goOn = () => {
    if (finished.current) return;
    const d = doing.current;
    for (let i = d.i; i < GESTURES.length; i++) logGesture(GESTURES[i], i === d.i ? d : { i, at: Date.now(), attempts: 0, ghost: false }, false, true);
    doing.current = { i: GESTURES.length, at: Date.now(), attempts: 0, ghost: false };
    end(false);
  };

  // one gesture on screen: its ring and line (the page says its first one itself); asked: the ghost at 8 s, on at 15 s; shown: the ghost points at once, on after SHOW_MS
  useEffect(() => {
    if (!g || walk || finished.current) return;
    level.say = g.say;
    const root = () => document.querySelector<HTMLElement>('main.level');
    const firstOnPage = gi === 0 || GESTURES[gi - 1].page !== g.page;
    let off = () => {};
    const ring = setTimeout(() => { const r = root(); if (r) off = cueRing(r, g.cue); }, firstOnPage ? 900 : 150);
    if (!firstOnPage) speak(g.say);
    const showGhost = (again: boolean) => {
      const r = root();
      if (!r) return;
      doing.current.ghost = true;
      if (again) speak(g.say);
      ghostRun.current?.cancel();
      ghostRun.current = playGhost(r, [ghostStep(g)]);
      log('ghost_demo', { level_id: level.id, kind: 'tool', gesture: g.id });
    };
    const timers = g.asked
      ? [setTimeout(() => showGhost(true), GHOST_AFTER_MS), setTimeout(() => finishRef.current(false), MOVE_ON_MS)]
      : [setTimeout(() => showGhost(false), firstOnPage ? 1100 : 400), setTimeout(() => finishRef.current(false), SHOW_MS)];
    return () => { clearTimeout(ring); timers.forEach(clearTimeout); off(); };
    // one gesture at a time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gi, walk]);

  // ↺ logs no event: the tool check watches its button
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.('main.level .btn-restart')) hearRef.current('reset', {});
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => ghostRun.current?.cancel(), []);

  function hear(type: string, payload: Record<string, unknown>) {
    const d = doing.current;
    const cur = GESTURES[d.i];
    if (!cur || finished.current || d.i !== gi) return;
    const r = gestureHit(cur.id, type, payload);
    if (!r) return;
    d.attempts++;
    if (r.via) d.via = r.via;
    if (r.hit === 'done') finishRef.current(true);
  }

  const hearRef = useRef(hear);
  hearRef.current = hear;

  if (walk) return <WalkOn seed={31} line="¡Vamos!" done={next} />;
  return (
    <BarProgressContext.Provider value={{ kind: 'dots', done: GESTURES.map((_, i) => i < gi), here: gi }}>
      <PlaytestLevel
        key={level.id}
        level={level}
        activity="tool_check"
        listen={hear}
        onEnd={IGNORE_END}
      />
      {canGo && <GoOn onClick={goOn} />}
    </BarProgressContext.Provider>
  );
}
