// The tool check (1–2 min): the two tiny pages of toolCheck.ts played with
// the full instrumentation (PlaytestLevel), one gesture asked at a time. The
// gesture's target gets a blue pen ring; the page's 🔊 and ✋ step 1 say the
// gesture being asked (the page's `say` follows it). Not done in 20 s: the
// ghost hand shows it once and it is said again; 20 s later the check moves
// on anyway. Every gesture logs `tool_check` {gesture, done, time_ms,
// attempts, shown_by_ghost, level_id, via?}; the page itself logs its
// `tap_add` and `drag` events as everywhere.

import { useEffect, useMemo, useRef, useState } from 'react';
import { penLoop } from '../ink/ink.js';
import { playGhost, type GhostRun } from '../ui/ghost';
import { speak } from '../ui/speech';
import { usePlaytest } from './context';
import { WalkOn } from './interlude';
import { PlaytestLevel } from './PlaytestLevel';
import { GESTURES, GHOST_AFTER_MS, LINES, MOVE_ON_MS, ends, gestureHit, toolLevels } from './toolCheck';

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
  const doing = useRef<Doing>({ i: 0, at: Date.now(), attempts: 0, ghost: false });
  const ghostRun = useRef<GhostRun | null>(null);
  const finished = useRef(false);
  const g = GESTURES[gi];
  const page = g?.page ?? 1;
  const level = levels[page];

  const finish = (done: boolean) => {
    const d = doing.current;
    const cur = GESTURES[d.i];
    if (!cur || finished.current) return;
    ghostRun.current?.cancel();
    log('tool_check', {
      gesture: cur.id,
      done,
      time_ms: Date.now() - d.at,
      attempts: d.attempts,
      shown_by_ghost: d.ghost,
      level_id: levels[cur.page].id,
      ...(d.via ? { via: d.via } : {}),
    });
    const n = d.i + 1;
    doing.current = { i: n, at: Date.now(), attempts: 0, ghost: false };
    if (n >= GESTURES.length) {
      finished.current = true;
      setTimeout(() => speak(LINES.done), 700);
      setTimeout(() => setWalk(true), 3600);
      return;
    }
    // the first page's win plays out before the second page comes
    const turn = GESTURES[n].page !== cur.page;
    setTimeout(() => { doing.current.at = Date.now(); setGi(n); }, turn ? 2600 : 700);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  // one gesture on screen: its ring, its line (the page says its first one itself), the ghost at 20 s, moving on at 40 s
  useEffect(() => {
    if (!g || walk) return;
    level.say = g.say;
    const root = () => document.querySelector<HTMLElement>('main.level');
    const firstOnPage = gi === 0 || GESTURES[gi - 1].page !== g.page;
    let off = () => {};
    const ring = setTimeout(() => { const r = root(); if (r) off = cueRing(r, g.cue); }, firstOnPage ? 900 : 150);
    if (!firstOnPage) speak(g.say);
    const show = setTimeout(() => {
      const r = root();
      if (!r) return;
      doing.current.ghost = true;
      speak(g.say);
      const step = g.ghost.do === 'tap' ? { do: 'tap' as const, at: g.ghost.at } : { do: 'drag' as const, from: g.ghost.from, to: g.ghost.to };
      ghostRun.current = playGhost(r, [step]);
      log('ghost_demo', { level_id: level.id, kind: 'tool' });
    }, GHOST_AFTER_MS);
    const move = setTimeout(() => finishRef.current(false), GHOST_AFTER_MS + MOVE_ON_MS);
    return () => { clearTimeout(ring); clearTimeout(show); clearTimeout(move); off(); };
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
    const hit = gestureHit(cur.id, type, payload);
    if (!hit) return;
    d.attempts++;
    if (hit === 'other') d.via = type === 'tap_add' ? 'tap' : 'drag';
    if (ends(cur.id, hit)) finishRef.current(hit === 'done');
  }

  const hearRef = useRef(hear);
  hearRef.current = hear;

  // the check turns its pages itself (a solved first page waits at most 2.6 s)
  if (walk) return <WalkOn seed={31} line="¡Vamos!" done={next} />;
  return (
    <PlaytestLevel
      key={level.id}
      level={level}
      activity="tool_check"
      listen={hear}
      onEnd={IGNORE_END}
    />
  );
}
