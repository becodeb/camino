// "Del bloque al texto" (5to, about 8–10 minutes; T8 of the pilot
// playtest, rebuilt from zero in T16): how well does a child of 5to, who
// knows blocks (MakeCode, micro:bit) but has never written code, understand
// the text version of a block program? A probe of free play (probes.ts):
// its card is on 5to's menu; the adult's corner menu opens it for any grade.
//
// One idea at a time, always from the blocks they know to the text, never a
// surprise (the steps live in textProbe.ts): a move is a line; several
// lines; repetir is `for`; a slip and its friendly note; si is `if`; then,
// if they want, a line of their own. Each step first shows a block program
// beside its text (the child runs it: the line and its block light
// together; blue pen notes say what a line means), then one very small task
// with that idea. The step path (six stones) is in the bar; every line is
// said and captioned. ✋ in three steps per screen: the line again with the
// target wiggling; the ghost hand points at the line that matters; the
// ghost does it (logged as ghost). After a while on a task, "seguir" in the
// bar lets the child move on. Then "¿Te gustó escribir el programa?".
//
// The editor is a real text area (big monospace, syntax colours, no
// autocorrect); ▶ parses the text (game/textCode.ts) and runs it on the
// real board, or says the slip on its line in one short sentence.
//
// Logged (docs/prueba-piloto-datos.md): `probe_phase` per step, `text_item`
// per task, `text_run`, `text_edit` (the ghost's), `probe_end` with
// `probe: 'text'`, `survey_answer` {question: 'text_probe_liked'}, and
// `help`, `speak`, `ghost_demo` with level_id 'text_probe' and `phase`.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBlockEditor, notebookWidth, type Marks } from '../blocks/BlockEditor';
import { Arrow, DIR_FILL, refKey } from '../blocks/blocks';
import type { LevelDef } from '../game/levels';
import type { Board, Dir, Program, TraceStep } from '../game/model';
import {
  INDENT, colorLine, keyLines, lineKeys, parseText, runText, storedText, toProgram, type Stmt, type TextError,
} from '../game/textCode';
import { Bar } from '../screens/LevelBar';
import { DEBUG, RestartButton, Sheet, frameFor, useBoard } from '../screens/levelKit';
import { aspectOf } from '../ui/board/BoardView';
import { NextPageArt, PenRing } from '../ui/art';
import { playGhost, type DemoStep, type GhostRun } from '../ui/ghost';
import { PlayIcon, SpeakerIcon } from '../ui/icons';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { BarProgressContext, BarProgressView } from './barProgress';
import { useBar } from './Captions';
import { usePlaytest, type LevelTrack } from './context';
import { Cheer } from './interlude';
import type { ProbeProps } from './probes';
import { GoOnArt } from './round2Art';
import { Face } from './surveyArt';
import {
  BANK, CORE_STEPS, STEPS, STEP_DEFS, STEP_NAME, TX_SAY, blocksOfText, liveGlosses, markIntact, timesFrom,
  type EditTask, type Gloss, type Mark, type PickTask, type PredictTask, type Teach, type TxStep, type TxTimes,
} from './textProbe';
import { BlockToTextDoodle, EndBoard, NoteArrow, TxStepIcon } from './textProbeArt';
import '../blocks/blocks.css';
import './textProbe.css';

const LEVEL_ID = 'text_probe';
const PROBE = 'text';

type Stage = TxStep | 'liked' | 'cheer';
type Screen = 'teach' | 'task';
type Log = (type: string, payload: Record<string, unknown>) => void;

/** How a task ended (the `text_item` row, without its common fields). */
export interface TaskEnd {
  reason: 'solved' | 'answered' | 'skipped';
  correct: boolean;
  first_try: boolean;
  attempts: number;
  errors: string[];
  help_levels: number;
  ghost: boolean;
  time_ms: number;
  answer?: string;
  position?: number;
  text?: string;
}

/** A page's board as a level (the board hook and the sheet want one). */
function levelFor(id: string, board: Board): LevelDef {
  return { id: `pp-texto-${id}`, grade: '3ro', page: 1, title: '', say: '', mode: 'program', worlds: [board], blocks: [], blockLabel: 'word-picture', solution: [] };
}

/** The blocks column is as wide as a repeat holding a "si" block needs. */
const BLOCKS_W = notebookWidth(['right', 'ifrock:right', 'repeat'], 'word-picture');

interface StepTrack { startedAt: number; teachRuns: number; links: number; helps: number; ghost: boolean }

export function TextProbe({ activity, levelEnded, done }: ProbeProps) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const times = useMemo(() => timesFrom(window.location.search), []);
  const [stage, setStage] = useState<Stage>('move');
  const [screen, setScreen] = useState<Screen>(STEP_DEFS.move.teach ? 'teach' : 'task');
  const [passed, setPassed] = useState<Partial<Record<TxStep, boolean>>>({});
  /** The task on screen is done (its stone fills before the page turns). */
  const [doneNow, setDoneNow] = useState(false);
  const mountAt = useRef(Date.now());
  const step = useRef<StepTrack>({ startedAt: Date.now(), teachRuns: 0, links: 0, helps: 0, ghost: false });
  const totals = useRef({ runs: 0, helps: 0, completed: new Set<TxStep>(), alone: new Set<TxStep>(), closed: false, adultHelped: false });

  const log: Log = (type, payload) => apiRef.current.log(type, payload);

  useEffect(() => {
    apiRef.current.did(activity);
    return () => {
      stopSpeaking();
      const t = totals.current;
      if (!t.closed) log('probe_end', { probe: PROBE, reason: 'left', time_ms: Date.now() - mountAt.current, steps_completed: t.completed.size, steps_alone: t.alone.size, runs: t.runs });
      apiRef.current.level.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enter = (s: TxStep) => {
    step.current = { startedAt: Date.now(), teachRuns: 0, links: 0, helps: 0, ghost: false };
    setDoneNow(false);
    setStage(s);
    setScreen(STEP_DEFS[s].teach ? 'teach' : 'task');
  };

  const teachDone = (r: { runs: number; helps: number; ghost: boolean }) => {
    const s = step.current;
    s.teachRuns = r.runs;
    s.helps = Math.max(s.helps, r.helps);
    s.ghost ||= r.ghost;
    setScreen('task');
  };

  const taskEnded = (id: TxStep, r: TaskEnd) => {
    const def = STEP_DEFS[id];
    const s = step.current;
    const t = totals.current;
    const lv = apiRef.current.level.current;
    const adult = !!lv?.adultHelped;
    if (adult) t.adultHelped = true;
    log('text_item', { item: def.task.id, kind: def.task.kind, step: id, ...r, adult_helped: adult });
    const completed = r.reason !== 'skipped';
    const helps = Math.max(s.helps, r.help_levels);
    const ghost = s.ghost || r.ghost;
    t.helps = Math.max(t.helps, helps);
    if (completed) t.completed.add(id);
    if (completed && helps === 0 && !ghost) t.alone.add(id);
    log('probe_phase', {
      probe: PROBE, phase: id, completed, skipped: !completed, time_ms: Date.now() - s.startedAt, help_levels: helps, ghost,
      teach_runs: s.teachRuns, links: s.links, task: def.task.id,
    });
    setPassed((p) => ({ ...p, [id]: true }));
    const next = STEPS[STEPS.indexOf(id) + 1];
    if (next) enter(next); else setStage('liked');
  };

  const finish = () => {
    const t = totals.current;
    t.closed = true;
    log('probe_end', { probe: PROBE, reason: 'done', time_ms: Date.now() - mountAt.current, steps_completed: t.completed.size, steps_alone: t.alone.size, runs: t.runs });
    levelEnded({
      level_id: LEVEL_ID, activity, outcome: CORE_STEPS.every((s) => t.completed.has(s)) ? 'win' : 'fail', time_ms: Date.now() - mountAt.current,
      attempts: t.runs, help_levels: t.helps, blocks_optimal: 0, adult_helped: t.adultHelped,
    });
    done();
  };

  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __tx: unknown }).__tx = {
      stage: () => stage, screen: () => screen, passed: () => passed,
      /** A step (its teaching screen, or `task`), or the liking question. */
      go: (s: Stage, sc?: Screen) => { if (s === 'liked' || s === 'cheer') setStage(s); else { enter(s); if (sc) setScreen(sc); } },
    };
  });

  const counters = { run: () => { totals.current.runs++; }, link: () => { step.current.links++; } };

  if (stage === 'liked') return <Liked done={() => setStage('cheer')} />;
  if (stage === 'cheer') return <Cheer line="¡Muy bien!" say={TX_SAY.cheer} done={finish} />;

  const def = STEP_DEFS[stage];
  const at = STEPS.indexOf(stage);
  const progress = { kind: 'dots' as const, done: STEPS.map((s) => !!passed[s] || (s === stage && doneNow)), here: at };
  const common = { step: stage, times, counters, first: at === 0 && screen === (def.teach ? 'teach' : 'task'), onSolved: () => setDoneNow(true) };
  const key = `${stage}:${screen}`;
  let page: ReactNode;
  if (screen === 'teach' && def.teach) page = <TeachPage key={key} {...common} teach={def.teach} onDone={teachDone} />;
  else {
    const task = def.task;
    const end = (r: TaskEnd) => taskEnded(stage, r);
    if (task.kind === 'pick') page = <PickPage key={key} {...common} task={task} onEnd={end} />;
    else if (task.kind === 'predict') page = <PredictPage key={key} {...common} task={task} onEnd={end} />;
    else page = <EditPage key={key} {...common} task={task} optional={!!def.optional} onEnd={end} />;
  }
  return <BarProgressContext.Provider value={progress}>{page}</BarProgressContext.Provider>;
}

interface Counters { run(): void; link(): void }
interface PageBase { step: TxStep; times: TxTimes; counters: Counters; first: boolean; onSolved(): void }

// ================================================================== what every screen shares

/**
 * A screen's visit: its entry line, its level record for the adult's
 * gestures, ✋'s three steps and the ghost hand, "seguir" after a while, and
 * the page turning by itself once the screen is done.
 */
function useScreen(o: { step: TxStep; screen: Screen; say: string; first: boolean; times: TxTimes; rootRef: React.RefObject<HTMLElement | null>; skippable: boolean; onSolved?(): void }) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const phase = o.screen === 'teach' ? `${o.step}_teach` : o.step;
  const track = useRef<LevelTrack>({ id: LEVEL_ID, helpStep: 0, adultHelped: api.level.current?.adultHelped ?? false });
  const startedAt = useRef(Date.now());
  const help = useRef(0);
  const ghost = useRef(false);
  const ghostRun = useRef<GhostRun | null>(null);
  const demoRef = useRef(false);
  const [demoing, setDemoing] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const [done, setDoneState] = useState(false);
  const doneRef = useRef(false);
  const turnRef = useRef<() => void>(() => {});
  const turned = useRef(false);
  const log: Log = (type, payload) => apiRef.current.log(type, payload);

  useEffect(() => {
    apiRef.current.level.current = track.current;
    let off = () => {};
    const line = o.first ? `${TX_SAY.intro} ${o.say}` : o.say;
    const timers = [window.setTimeout(() => { off = speakWhenAllowed(line); }, 400)];
    if (o.skippable) timers.push(window.setTimeout(() => { if (!doneRef.current) setCanSkip(true); }, o.times.skipMs));
    return () => {
      timers.forEach(clearTimeout); off(); ghostRun.current?.cancel();
      // the next screen: a hand nobody answered goes down (the child moved on)
      apiRef.current.lowerHand('moved_on');
      if (apiRef.current.level.current === track.current) apiRef.current.level.current = null;
    };
    // once per screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The page turns (once). */
  const turn = () => {
    if (turned.current) return;
    turned.current = true;
    turnRef.current();
  };

  /** The screen is done: the next arrow shows and the page turns by itself after a while. */
  const setDone = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setDoneState(true);
    setCanSkip(false);
    o.onSolved?.();
    apiRef.current.lowerHand('self');
    window.setTimeout(turn, o.times.autoTurnMs);
  };

  const demo = (steps: DemoStep[], kind: string, pace?: number) => {
    const root = o.rootRef.current;
    if (!root) return null;
    ghostRun.current?.cancel();
    demoRef.current = true;
    setDemoing(true);
    const g = playGhost(root, steps, { pace });
    ghostRun.current = g;
    log('ghost_demo', { level_id: LEVEL_ID, kind, phase });
    return g.done.then(() => { if (ghostRun.current === g) { demoRef.current = false; setDemoing(false); } });
  };

  const wiggle = (sel: string) => {
    window.setTimeout(() => o.rootRef.current?.querySelectorAll(sel).forEach((el) => el.animate?.([{ scale: '1' }, { scale: '1.06' }, { scale: '1' }, { scale: '1.06' }, { scale: '1' }], { duration: 1100 })), 80);
  };

  /** ✋: step 1 the line again (and `target` wiggles), 2 `hint`, 3 `solve` (the ghost does it); then the raised hand. */
  const onHelp = (h: { busy: boolean; target: string; hint(): void; solve(): void }) => {
    const a = apiRef.current;
    if (demoRef.current || h.busy) return;
    if (help.current >= 3 || doneRef.current) { if (help.current >= 3) a.raiseHand('help_step_3'); return; }
    const n = ++help.current;
    track.current.helpStep = n;
    log('help', { level_id: LEVEL_ID, step: n, phase });
    if (n === 1) { speak(o.say); wiggle(h.target); return; }
    if (n === 2) { h.hint(); return; }
    ghost.current = true;
    h.solve();
  };

  const onSpeak = () => { log('speak', { level_id: LEVEL_ID, phase }); speak(o.say); };

  return { log, demo, demoRef, demoing, onHelp, onSpeak, help, ghost, track, startedAt, canSkip, done, doneRef, setDone, turn, turnRef, phase };
}

function NextButton({ onClick }: { onClick(): void }) {
  return <button type="button" className="next-page cut pop-in tx-next" aria-label="Seguir" onClick={onClick}><NextPageArt /></button>;
}

/** "Seguir" in the bar before ✋ (never over the work): the task is left for later. */
function GoOn({ onClick }: { onClick(): void }) {
  const bar = useBar();
  if (!bar) return null;
  return createPortal(<button type="button" className="pp-go-on cut pop-in tx-skip" aria-label="Seguir" onClick={onClick}><GoOnArt /></button>, bar);
}

/** The page: the bar (the step's drawing, the step path) and the page's zones. */
function Page({ rootRef, layout, step, screen, onSpeak, onHelp, busy, demoing, done, board, skip, children }: {
  rootRef: React.RefObject<HTMLElement | null>; layout: string; step: TxStep; screen: Screen; onSpeak(): void; onHelp(): void;
  busy: boolean; demoing: boolean; done: boolean; board?: LevelDef; skip?: (() => void) | null; children: ReactNode;
}) {
  const style = {
    '--blocks-w': `${BLOCKS_W}px`,
    ...(board ? { '--aspect': aspectOf(board.worlds[0], frameFor(board)).toFixed(3) } : {}),
  } as CSSProperties;
  const n = STEPS.indexOf(step) + 1;
  return (
    <main
      ref={rootRef} className={`level tx-root is-${layout}${demoing ? ' is-demo' : ''}${done ? ' is-done' : ''}`}
      data-phase={step} data-screen={screen} data-busy={busy ? 'true' : undefined} style={style}
    >
      <Bar
        instruction={<span className="drawn-task tx-task" aria-hidden="true"><TxStepIcon step={step} size={66} /></span>}
        title={<><b>Del bloque al texto</b>Del bloque al texto · {n} de {STEPS.length} · {STEP_NAME[step]}{screen === 'teach' ? ' (mirar)' : ''}</>}
        pages={<BarProgressView />}
        onSpeak={onSpeak}
        onHelp={onHelp}
      />
      {skip && <GoOn onClick={skip} />}
      {children}
    </main>
  );
}

// ================================================================== the code: colours, lines, the editor

type CodeSize = 'huge' | 'xl';
const LH: Record<CodeSize, number> = { huge: 66, xl: 50 };
const PAD: Record<CodeSize, number> = { huge: 18, xl: 16 };
const FONT: Record<CodeSize, number> = { huge: 44, xl: 32 };

/** The code grows on a big screen (1920 wide: about 1.3×), never below its 1366 size. */
function useCodeScale(): number {
  const get = () => Math.max(1, Math.min(1.3, window.innerWidth / 1366, window.innerHeight / 768));
  const [k, setK] = useState(get);
  useEffect(() => {
    const on = () => setK(get());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return k;
}

function offsetOf(text: string, c: { line: number; col: number }): number {
  const lines = text.split('\n');
  let off = 0;
  for (let i = 0; i < c.line - 1 && i < lines.length; i++) off += lines[i].length + 1;
  return Math.min(text.length, off + Math.min(c.col, lines[c.line - 1]?.length ?? 0));
}

interface CodeProps {
  text: string;
  editable?: boolean;
  onText?(t: string): void;
  /** The line running now. */
  lit?: number | null;
  /** Lines lit with their block (under the finger). */
  linked?: readonly number[];
  error?: TextError | null;
  /** A line the ghost just rewrote. */
  flashLine?: number | null;
  /** Where the caret starts (edit tasks). */
  caret?: { line: number; col: number } | null;
  /** The word to change: marked, selected at the start and when tapped. */
  mark?: Mark | null;
  /** What a line means, in blue pen to its right. */
  glosses?: readonly Gloss[];
  /** Under the program (when no error note): the hint, the word bank. */
  below?: ReactNode;
  /** The finger is over a line (`tap`: it pressed it); null: it left. */
  onLine?(line: number | null, tap: boolean): void;
  size?: CodeSize;
  minLines?: number;
  label: string;
}

/**
 * The program as text, on the notebook's lines, with its line numbers and
 * syntax colours. Editable: a real textarea over the coloured text (the
 * letters it types are transparent; the colours show through), big
 * monospace, no spellcheck or autocorrect, Tab and Enter indent.
 */
export function Code({ text, editable, onText, lit, linked = [], error, flashLine, caret, mark, glosses = [], below, onLine, size = 'xl', minLines = 0, label }: CodeProps) {
  const k = useCodeScale();
  const lh = Math.round(LH[size] * k), pad = Math.round(PAD[size] * k);
  const ta = useRef<HTMLTextAreaElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const pending = useRef<number | null>(null);
  const lines = text.split('\n');
  const rows = Math.max(lines.length, minLines);
  const markRef = useRef(mark);
  markRef.current = mark;

  useEffect(() => {
    if (!editable || !ta.current) return;
    ta.current.focus({ preventScroll: true });
    if (mark) {
      const a = offsetOf(text, { line: mark.line, col: mark.from });
      ta.current.setSelectionRange(a, a + mark.to - mark.from);
    } else if (caret) {
      const off = offsetOf(text, caret);
      ta.current.setSelectionRange(off, off);
    }
    // once, when the task opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLayoutEffect(() => {
    if (pending.current == null || !ta.current) return;
    ta.current.setSelectionRange(pending.current, pending.current);
    pending.current = null;
  });

  /** A tap inside the marked word selects all of it (typing then replaces it). */
  const selectMark = () => {
    const t = ta.current, m = markRef.current;
    if (!t || !m || t.selectionStart !== t.selectionEnd) return;
    const a = offsetOf(t.value, { line: m.line, col: m.from });
    const b = a + m.to - m.from;
    if (t.selectionStart >= a && t.selectionStart <= b) t.setSelectionRange(a, b);
  };

  const lineAt = (e: ReactPointerEvent<HTMLElement>): number | null => {
    const win = e.currentTarget.querySelector('.tx-window');
    if (!win) return null;
    const r = win.getBoundingClientRect();
    const n = Math.floor((e.clientY - r.top - pad + (ta.current?.scrollTop ?? 0)) / lh) + 1;
    return n >= 1 && n <= lines.length ? n : null;
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // the editor's keys are the editor's: no other screen, shortcut or game hears them
    e.stopPropagation();
    if (e.nativeEvent.isComposing) return;
    const t = e.currentTarget;
    const a = t.selectionStart, b = t.selectionEnd, v = t.value;
    const put = (s: string, from = a, to = b) => {
      e.preventDefault();
      pending.current = from + s.length;
      onText?.(v.slice(0, from) + s + v.slice(to));
    };
    if (e.key === 'Tab' && !e.shiftKey) { put(INDENT); return; }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // like a Python editor: the new line keeps the indentation, one more after a ":"
      const cur = v.slice(v.lastIndexOf('\n', a - 1) + 1, a);
      put(`\n${cur.match(/^ */)![0]}${/:\s*$/.test(cur) ? INDENT : ''}`);
      return;
    }
    if (e.key === 'Backspace' && a === b && a > 0) {
      const before = v.slice(v.lastIndexOf('\n', a - 1) + 1, a);
      if (before.length && /^ +$/.test(before)) put('', a - (before.length % INDENT.length || INDENT.length), a);
    }
  };

  const band = (line: number, cls: string) => <div key={`${cls}${line}`} className={`tx-band ${cls}`} style={{ top: pad + (line - 1) * lh, height: lh }} />;
  const errLine = error?.line ?? null;
  const under = pad + Math.max(error?.line ?? 0, lines.length) * lh + 6;
  return (
    <div
      className={`tx-code is-${size}${editable ? ' is-edit' : ''}`}
      style={{ '--lh': `${lh}px`, '--pad': `${pad}px`, '--rows': rows, fontSize: `${Math.round(FONT[size] * k)}px` } as CSSProperties}
      onPointerMove={onLine ? (e) => onLine(lineAt(e), false) : undefined}
      onPointerLeave={onLine ? () => onLine(null, false) : undefined}
      onPointerDown={onLine ? (e) => onLine(lineAt(e), true) : undefined}
    >
      <ol className="tx-gutter" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className={i + 1 === errLine ? 'is-error' : i + 1 === lit ? 'is-lit' : undefined}>
            {i < lines.length ? i + 1 : ''}
            {i + 1 === errLine && <PenRing seed={i + 3} />}
          </li>
        ))}
      </ol>
      <div className="tx-window">
        <div ref={inner} className="tx-inner">
          {linked.map((l) => band(l, 'is-link'))}
          {errLine != null && band(errLine, 'is-error')}
          {flashLine != null && band(flashLine, 'is-flash')}
          {lit != null && band(lit, 'is-lit')}
          {mark && <div className="tx-mark" style={{ top: pad + (mark.line - 1) * lh, height: lh, left: `calc(8px + ${mark.from}ch)`, width: `calc(${mark.to - mark.from}ch + 4px)` }} aria-hidden="true" />}
          <pre className="tx-hl" aria-hidden={editable ? true : undefined} aria-label={editable ? undefined : label}>
            {lines.map((l, i) => (
              <div key={i} className={`tx-line${i + 1 === errLine ? ' is-error' : ''}`} data-line={i + 1}>
                {l.length ? colorLine(l).map((tk, k) => <span key={k} className={`txk-${tk.kind}${tk.action ? ` txa-${tk.action}` : ''}`}>{tk.text}</span>) : '​'}
              </div>
            ))}
          </pre>
          {glosses.filter((g) => g.line <= lines.length).map((g) => (
            <div key={`${g.line}:${g.text}`} className="tx-gloss" data-line={g.line} style={{ top: pad + (g.line - 1) * lh, height: lh, left: `calc(8px + ${lines[g.line - 1].trimEnd().length}ch + 18px)` }} aria-hidden="true">
              <span>{g.text}</span>
            </div>
          ))}
          {error ? (
            <div className="tx-note" role="status" style={{ top: under }} data-error={error.kind}>
              <NoteArrow />
              <p>{error.show}</p>
            </div>
          ) : below ? <div className="tx-below" style={{ top: under }}>{below}</div> : null}
        </div>
        {editable && (
          <textarea
            ref={ta}
            className="tx-input"
            value={text}
            onChange={(e) => onText?.(e.target.value)}
            onKeyDown={onKey}
            onClick={selectMark}
            onScroll={(e) => { if (inner.current) inner.current.style.transform = `translate(${-e.currentTarget.scrollLeft}px, ${-e.currentTarget.scrollTop}px)`; }}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="none"
            autoComplete="off"
            data-gramm="false"
            data-enable-grammarly="false"
            translate="no"
            wrap="off"
            inputMode="text"
            enterKeyHint="enter"
            aria-label={label}
          />
        )}
      </div>
    </div>
  );
}

// ================================================================== the blocks

/**
 * The same program as blocks (the level screen's own notebook, read-only).
 * A finger over a block lights its lines in the text (`onKey`); `current`
 * rings the block of the line lit. Dimmed while the text does not parse
 * (the blocks stay as they last were).
 */
function BlocksZone({ program, current, iteration, dim, onKey }: {
  program: Program; current?: string | null; iteration?: Marks['iteration']; dim?: boolean; onKey?(key: string | null, tap: boolean): void;
}) {
  const ref = useRef<HTMLElement>(null);
  const noop = () => {};
  const editor = useBlockEditor({
    blocks: [], label: 'word-picture', program, marks: { ...(current ? { current } : {}), ...(iteration ? { iteration } : {}) }, disabled: false, lines: 'read',
    onTapPalette: noop, onTapBlock: noop, onTapeCount: noop, onTapeActivate: noop, onDrop: noop,
  });
  /** The smallest block under the point (a card inside a repeat, before the repeat). */
  const keyAt = (x: number, y: number): string | null => {
    let best: string | null = null, area = Infinity;
    ref.current?.querySelectorAll('[data-ref]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && r.width * r.height < area) { best = el.getAttribute('data-ref'); area = r.width * r.height; }
    });
    return best;
  };
  return (
    <section ref={ref} className={`zone zone-program tx-blocks${dim ? ' is-dim' : ''}`} aria-label="El programa, con bloques">
      {editor.program}
      {onKey && (
        <div
          className="tx-blocks-hit"
          onPointerMove={(e) => onKey(keyAt(e.clientX, e.clientY), false)}
          onPointerLeave={() => onKey(null, false)}
          onPointerDown={(e) => onKey(keyAt(e.clientX, e.clientY), true)}
        />
      )}
    </section>
  );
}

// ================================================================== running a text on the board

/** A text's lit line and block while it runs, and the line/block pair under the finger. */
function useLink(code: Stmt[] | null, counters?: Counters) {
  const [lit, setLit] = useState<number | null>(null);
  const [cur, setCurKey] = useState<string | null>(null);
  const [iteration, setIteration] = useState<Marks['iteration']>(null);
  /** The step running now: its block, and a repeat's pass (its dots fill in blue pen). */
  const step = (s: TraceStep | null) => {
    setCurKey(s ? refKey(s.ref) : null);
    if (!s) return;
    setIteration(s.ref.inner != null ? { item: s.ref.item, iter: s.ref.iter ?? 0 } : null);
  };
  const [hover, setHover] = useState<{ lines: number[]; key: string | null } | null>(null);
  const keys = useMemo(() => (code ? lineKeys(code) : new Map<number, string>()), [code]);
  const fromLine = (line: number | null, tap: boolean) => {
    if (line == null) { setHover(null); return; }
    const k = keys.get(line) ?? null;
    setHover({ lines: k && code ? keyLines(code, k) : [line], key: k });
    if (tap) counters?.link();
  };
  const fromKey = (key: string | null, tap: boolean) => {
    if (key == null || !code) { setHover(null); return; }
    setHover({ lines: keyLines(code, key), key });
    if (tap) counters?.link();
  };
  return { lit, setLit, cur, step, iteration, setIteration, hover, fromLine, fromKey };
}

const resultOf = (outcome: string) => (outcome === 'win' ? 'win' : outcome === 'crash' ? 'bump' : 'short');

// ================================================================== teach: the blocks and their text, run once

function TeachPage({ step, times, counters, first, teach, onDone }: PageBase & { teach: Teach; onDone(r: { runs: number; helps: number; ghost: boolean }): void }) {
  const rootRef = useRef<HTMLElement>(null);
  const v = useScreen({ step, screen: 'teach', say: teach.say, first, times, rootRef, skippable: false });
  const level = useMemo(() => levelFor(`${step}-teach`, teach.board), [step, teach]);
  const { svgRef, viewRef } = useBoard(level);
  const code = useMemo(() => { const p = parseText(teach.text); return p.ok ? p.code : []; }, [teach]);
  const program = useMemo(() => toProgram(code)!, [code]);
  const link = useLink(code, counters);
  const [running, setRunning] = useState(false);
  const runs = useRef(0);
  const [late, setLate] = useState(false);
  v.turnRef.current = () => onDone({ runs: runs.current, helps: v.help.current, ghost: v.ghost.current });

  useEffect(() => {
    const t = window.setTimeout(() => setLate(true), times.teachNextMs);
    return () => clearTimeout(t);
  }, [times]);

  const run = async () => {
    const view = viewRef.current;
    if (!view || running) return;
    setRunning(true);
    counters.run();
    const { trace, lines } = runText(teach.board, code);
    const res = await view.play(trace, { onStep: (s: TraceStep) => { link.setLit(lines[s.index]); link.step(s); } });
    link.setLit(null); link.step(null);
    setRunning(false);
    if (res === 'aborted') return;
    runs.current++;
    v.log('text_run', { item: `${step}_teach`, step, ok: true, result: resultOf(trace.outcome), error_kind: null, line: null, attempt: runs.current });
    if (runs.current === 1) speak(teach.after);
    v.setDone();
  };

  const onHelp = () => v.onHelp({
    busy: running, target: '.tx-root .btn-play',
    hint: () => { void v.demo([{ do: 'point', at: ['.tx-code .tx-line[data-line="1"]'] }, { do: 'point', at: ['.tx-blocks [data-ref="0"]'] }, { do: 'point', at: ['.tx-root .btn-play'] }], 'hint'); },
    solve: () => { void v.demo([{ do: 'tap', at: '.tx-root .btn-play', apply: () => void run() }], 'run'); },
  });

  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __txe: unknown }).__txe = { run, help: onHelp, done: () => v.doneRef.current, turn: v.turn };
  });

  const current = running ? link.cur : link.hover?.key ?? null;
  return (
    <Page rootRef={rootRef} layout="teach" step={step} screen="teach" onSpeak={v.onSpeak} onHelp={onHelp} busy={running} demoing={v.demoing} done={v.done} board={level}>
      <BlocksZone program={program} current={current} iteration={link.iteration} onKey={running ? undefined : link.fromKey} />
      <section className="zone zone-program tx-code-zone" aria-label="El programa, con letras">
        <Code text={teach.text} label="El programa, con letras" lit={link.lit} linked={running ? [] : link.hover?.lines ?? []} onLine={running ? undefined : link.fromLine} glosses={teach.glosses} />
      </section>
      <section className="level-stage tx-stage" aria-label="Tablero">
        <div className="controls">
          <button type="button" className={`btn btn-play cut${v.done ? '' : ' tx-nudge'}`} onClick={() => void run()} disabled={running} aria-label="Probar"><PlayIcon /><span>Probar</span></button>
          <RestartButton onClick={() => void viewRef.current?.reset()} disabled={running} />
          {(v.done || late) && !running && <NextButton onClick={v.turn} />}
        </div>
        <Sheet svgRef={svgRef} level={level} />
      </section>
    </Page>
  );
}

// ================================================================== pick: which of two lines is this block?

function PickPage({ step, times, first, task, onEnd, onSolved }: PageBase & { task: PickTask; onEnd(r: TaskEnd): void }) {
  const rootRef = useRef<HTMLElement>(null);
  const v = useScreen({ step, screen: 'task', say: task.say, first, times, rootRef, skippable: true, onSolved });
  const [tried, setTried] = useState<string[]>([]);
  const [right, setRight] = useState(false);
  const result = useRef<TaskEnd | null>(null);
  v.turnRef.current = () => onEnd(result.current ?? skipped());
  const program: Program = useMemo(() => [{ t: 'cmd', cmd: task.block }], [task]);
  const k = useCodeScale();

  const skipped = (): TaskEnd => ({
    reason: 'skipped', correct: false, first_try: false, attempts: tried.length, errors: [], help_levels: v.help.current, ghost: v.ghost.current,
    time_ms: Date.now() - v.startedAt.current, ...(tried.length ? { answer: tried[0], position: task.options.findIndex((o) => o.id === tried[0]) } : {}),
  });

  const pick = (id: string, byGhost = false) => {
    if (right || (v.demoRef.current && !byGhost) || tried.includes(id)) return;
    const all = [...tried, id];
    setTried(all);
    if (id !== task.answer) { speak(task.options.find((o) => o.id === id)!.say); return; }
    setRight(true);
    speak(task.right);
    result.current = {
      reason: 'answered', correct: !v.ghost.current, first_try: all.length === 1 && !v.ghost.current, attempts: all.length, errors: [],
      help_levels: v.help.current, ghost: v.ghost.current, time_ms: Date.now() - v.startedAt.current,
      answer: all[0], position: task.options.findIndex((o) => o.id === all[0]),
    };
    v.setDone();
  };

  const onHelp = () => v.onHelp({
    busy: false, target: '.tx-pick .tx-pick-card',
    hint: () => { speak('Mirá para dónde va la flecha.'); void v.demo([{ do: 'point', at: ['.tx-blocks [data-ref="0"]'] }, { do: 'wait', ms: 400 }, { do: 'point', at: ['.tx-pick-card'] }], 'hint'); },
    solve: () => { void v.demo([{ do: 'point', at: ['.tx-blocks [data-ref="0"]'] }, { do: 'tap', at: `.tx-pick-card[data-answer="${task.answer}"]`, apply: () => pick(task.answer, true) }], 'answer'); },
  });
  const skip = () => { speak(TX_SAY.skip); v.turn(); };

  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __txe: unknown }).__txe = { pick, help: onHelp, skip, done: () => v.doneRef.current, turn: v.turn };
  });

  return (
    <Page rootRef={rootRef} layout="pick" step={step} screen="task" onSpeak={v.onSpeak} onHelp={onHelp} busy={false} demoing={v.demoing} done={v.done} skip={v.canSkip ? skip : null}>
      <BlocksZone program={program} current={right ? '0' : null} />
      <section className="tx-pick-zone" aria-label="¿Cuál es esta flecha con letras?" style={{ '--k': k } as CSSProperties}>
        <div className="controls tx-pick-controls">
          <span className="tx-pick-ask" aria-hidden="true"><MiniCmd cmd={task.block} /><span className="tx-pick-eq">=</span><span className="tx-pick-q">?</span></span>
          {v.done && <NextButton onClick={v.turn} />}
        </div>
        <div className="tx-pick" role="group">
          {task.options.map((o, k) => {
            const other = tried.includes(o.id) && o.id !== task.answer;
            return (
              <button
                key={o.id} type="button" data-answer={o.id} aria-label={`Línea ${k + 1}`} onClick={() => pick(o.id)}
                className={`cut tx-pick-card${right && o.id === task.answer ? ' is-right' : ''}${other ? ' is-other' : ''}`}
              >
                <Code text={o.text} size="huge" label={`Línea ${k + 1}`} />
                {right && o.id === task.answer && <PenRing seed={k + 7} />}
                {other && <span className="tx-pick-means" aria-hidden="true"><MiniCmd cmd={o.id === 'abajo' ? 'down' : o.id === 'arriba' ? 'up' : o.id === 'izquierda' ? 'left' : 'right'} /></span>}
              </button>
            );
          })}
        </div>
      </section>
    </Page>
  );
}

/** A small arrow block (the word bank, the pick's "this arrow"). */
function MiniCmd({ cmd }: { cmd: string }) {
  const dir = cmd as Dir;
  return <span className="tx-mini-blk cut" style={{ '--fill': DIR_FILL[dir] } as CSSProperties}><Arrow dir={dir} size={30} /></span>;
}

// ================================================================== predict: read the text, pick where it ends

function PredictPage({ step, times, first, task, onEnd, onSolved }: PageBase & { task: PredictTask; onEnd(r: TaskEnd): void }) {
  const rootRef = useRef<HTMLElement>(null);
  const v = useScreen({ step, screen: 'task', say: task.say, first, times, rootRef, skippable: true, onSolved });
  const level = useMemo(() => levelFor(task.id, task.board), [task]);
  const { svgRef, viewRef } = useBoard(level);
  const code = useMemo(() => { const p = parseText(task.text); return p.ok ? p.code : []; }, [task]);
  const link = useLink(code);
  const [picked, setPicked] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const result = useRef<TaskEnd | null>(null);
  v.turnRef.current = () => onEnd(result.current ?? {
    reason: 'skipped', correct: false, first_try: false, attempts: 0, errors: [], help_levels: v.help.current, ghost: v.ghost.current, time_ms: Date.now() - v.startedAt.current,
  });

  const play = async () => {
    const view = viewRef.current;
    if (!view || running) return;
    setRunning(true);
    const { trace, lines } = runText(task.board, code);
    const res = await view.play(trace, { onStep: (s: TraceStep) => link.setLit(lines[s.index]), quiet: true, celebrate: false });
    link.setLit(null);
    setRunning(false);
    if (res === 'aborted') return;
    if (result.current && !v.doneRef.current) {
      speak(result.current.correct ? task.right : task.other);
      v.setDone();
    }
  };

  const pick = (id: string, position: number) => {
    if (picked || v.demoRef.current) return;
    setPicked(id);
    speak('Anotado. Mirá qué pasa.');
    result.current = {
      reason: 'answered', correct: id === task.answer && !v.ghost.current, first_try: id === task.answer && !v.ghost.current, attempts: 1, errors: [],
      help_levels: v.help.current, ghost: v.ghost.current, time_ms: Date.now() - v.startedAt.current, answer: id, position,
    };
    window.setTimeout(() => void play(), 1000);
  };

  const onHelp = () => v.onHelp({
    busy: running || !!picked, target: '.tx-options .tx-option',
    hint: () => { speak('Fijate en esta línea: ¿hay piedra adelante?'); void v.demo([{ do: 'point', at: [`.tx-code .tx-line[data-line="${task.focusLine}"]`] }, { do: 'wait', ms: 400 }, { do: 'point', at: ['.tx-stage .sheet'] }], 'hint'); },
    solve: () => {
      // the ghost follows the program: a line, where the character gets to; the next line…
      const { trace, lines } = runText(task.board, code);
      const steps: DemoStep[] = [];
      trace.steps.forEach((s, i) => {
        steps.push({ do: 'point', at: [`.tx-code .tx-line[data-line="${lines[i]}"]`] });
        steps.push({ do: 'point', at: [`.board [data-cell="${s.to.c},${s.to.r}"]`] });
      });
      void v.demo(steps, 'follow');
    },
  });
  const skip = () => { speak(TX_SAY.skip); v.turn(); };

  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __txe: unknown }).__txe = { pick, help: onHelp, skip, done: () => v.doneRef.current, turn: v.turn };
  });

  return (
    <Page rootRef={rootRef} layout="predict" step={step} screen="task" onSpeak={v.onSpeak} onHelp={onHelp} busy={running} demoing={v.demoing} done={v.done} board={level} skip={v.canSkip && !picked ? skip : null}>
      <section className="zone zone-program tx-code-zone" aria-label="El programa, con letras">
        <Code text={task.text} label="El programa" lit={link.lit} glosses={[{ line: 2, text: '¿hay piedra?' }]} />
        <p className="tx-ask" aria-hidden="true">¿Dónde termina?</p>
        <div className="tx-options" role="group" aria-label="¿Dónde termina?">
          {task.options.map((o, k) => (
            <button key={o.id} type="button" className={`cut tx-option${picked === o.id ? ' is-picked' : ''}${picked && picked !== o.id ? ' is-other' : ''}`} data-answer={o.id} aria-label={`Dibujo ${k + 1}`} onClick={() => pick(o.id, k)}>
              <EndBoard board={task.board} end={o.end} bump={o.bump} />
              {picked === o.id && <PenRing seed={k + 4} />}
            </button>
          ))}
        </div>
      </section>
      <section className="level-stage tx-stage tx-predict-stage is-wide" aria-label="Tablero">
        <div className="controls">
          {picked && <button type="button" className="btn btn-play cut" onClick={() => void play()} disabled={running} aria-label="Ver otra vez"><PlayIcon /><span>Ver</span></button>}
          {picked && <RestartButton onClick={() => void viewRef.current?.reset()} disabled={running} />}
          {v.done && !running && <NextButton onClick={v.turn} />}
        </div>
        <Sheet svgRef={svgRef} level={level} />
      </section>
    </Page>
  );
}

// ================================================================== edit: change a word or a number, fix a slip, write a line

function EditPage({ step, times, counters, first, task, optional, onEnd, onSolved }: PageBase & { task: EditTask; optional: boolean; onEnd(r: TaskEnd): void }) {
  const rootRef = useRef<HTMLElement>(null);
  const v = useScreen({ step, screen: 'task', say: task.say, first, times, rootRef, skippable: !optional, onSolved });
  const level = useMemo(() => levelFor(task.id, task.board), [task]);
  const { svgRef, viewRef } = useBoard(level);
  const [text, setTextState] = useState(task.text);
  const textRef = useRef(text);
  const setText = (t: string) => { textRef.current = t; setTextState(t); };
  const parsed = useMemo(() => parseText(text), [text]);
  const code = parsed.ok ? parsed.code : null;
  const live = code ? toProgram(code) : null;
  /** The blocks as they last parsed (dimmed while the text does not). */
  const lastBlocks = useRef<Program | null>(blocksOfText(task.text) ?? blocksOfText(task.fixed));
  if (live) lastBlocks.current = live;
  const link = useLink(code, counters);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<TextError | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [late, setLate] = useState(false);
  const s = useRef({ attempts: 0, errors: [] as string[], edits: 0, ghostFixed: false, result: null as TaskEnd | null });

  const end = (reason: TaskEnd['reason']): TaskEnd => ({
    reason, correct: reason === 'solved' && !s.current.ghostFixed, first_try: reason === 'solved' && s.current.attempts === 1 && !s.current.ghostFixed,
    attempts: s.current.attempts, errors: s.current.errors, help_levels: v.help.current, ghost: v.ghost.current, time_ms: Date.now() - v.startedAt.current,
    text: storedText(textRef.current),
  });
  v.turnRef.current = () => onEnd(s.current.result ?? end('skipped'));

  useEffect(() => {
    if (!optional) return;
    const t = window.setTimeout(() => setLate(true), times.writeNextMs);
    return () => clearTimeout(t);
  }, [optional, times]);

  const edit = (t: string) => {
    if (v.demoRef.current || running || v.doneRef.current) return;
    s.current.edits++;
    setFlash(null);
    setText(t);
  };

  const run = async () => {
    const view = viewRef.current;
    if (!view || running || v.demoRef.current) return;
    const t = textRef.current;
    const st = s.current;
    st.attempts++;
    counters.run();
    setFlash(null);
    const p = parseText(t);
    if (!p.ok) {
      st.errors.push(p.error.kind);
      setError(p.error);
      v.log('text_run', { item: task.id, step, ok: false, result: null, error_kind: p.error.kind, line: p.error.line, attempt: st.attempts });
      speak(p.error.say);
      void view.puzzled();
      return;
    }
    setError(null);
    setRunning(true);
    const { trace, lines } = runText(task.board, p.code);
    const res = await view.play(trace, { onStep: (x: TraceStep) => { link.setLit(lines[x.index]); link.step(x); } });
    link.setLit(null); link.step(null);
    setRunning(false);
    if (res === 'aborted') return;
    const result = resultOf(trace.outcome);
    v.log('text_run', { item: task.id, step, ok: true, result, error_kind: null, line: null, attempt: st.attempts });
    if (result === 'win') {
      if (!st.result) {
        st.result = end('solved');
        speak(st.ghostFixed ? TX_SAY.won : TX_SAY.wonTask[STEPS.indexOf(step) % TX_SAY.wonTask.length]);
        v.setDone();
      }
    } else speak(result === 'bump' ? TX_SAY.bump : TX_SAY.short);
  };

  const onHelp = () => v.onHelp({
    busy: running, target: task.mark ? '.tx-mark, .tx-below' : '.tx-code',
    hint: () => { speak(TX_SAY.hint); void v.demo([{ do: 'point', at: [`.tx-code .tx-line[data-line="${task.focusLine}"]`] }, { do: 'wait', ms: 300 }, ...(task.hint || task.bank ? [{ do: 'point', at: ['.tx-below'] } as DemoStep] : [])], 'hint'); },
    solve: () => {
      // the fix, written by the ghost hand: it taps the line and the line becomes right (a ghost edit)
      speak(TX_SAY.ghost);
      void v.demo([{
        do: 'tap', at: `.tx-code .tx-line[data-line="${task.focusLine}"]`,
        apply: () => {
          s.current.ghostFixed = true;
          setText(task.fixed);
          setError(null);
          setFlash(task.focusLine);
          v.log('text_edit', { item: task.id, step, ghost: true, line: task.focusLine });
        },
      }, { do: 'wait', ms: 500 }, { do: 'point', at: ['.tx-root .btn-play'] }], 'fix')?.then(() => speak(TX_SAY.tryRun));
    },
  });
  const skip = () => { speak(TX_SAY.skip); v.turn(); };

  // the error note stays only while the text still has that error
  const shownError = error && !parsed.ok && parsed.error.kind === error.kind && parsed.error.line === error.line ? error : null;
  const mark = task.mark && markIntact(task, text) && !v.done ? task.mark : null;
  const glosses = task.kind === 'number' ? liveGlosses(text) : [];
  const below = task.bank ? <WordBank /> : task.hint && !v.done ? <Hint hint={task.hint} /> : null;

  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __txe: unknown }).__txe = { text: () => textRef.current, setText: edit, run, help: onHelp, skip, done: () => v.doneRef.current, turn: v.turn };
  });

  const current = running ? link.cur : link.hover?.key ?? null;
  return (
    <Page rootRef={rootRef} layout="edit" step={step} screen="task" onSpeak={v.onSpeak} onHelp={onHelp} busy={running} demoing={v.demoing} done={v.done} board={level} skip={v.canSkip ? skip : null}>
      <BlocksZone program={lastBlocks.current ?? []} current={current} iteration={running ? link.iteration : null} dim={!live} onKey={running || !live ? undefined : link.fromKey} />
      <section className="zone zone-program tx-code-zone" aria-label="El programa, con letras">
        <Code
          text={text} editable onText={edit} label="El programa, con letras" caret={task.caret} mark={mark} glosses={glosses} below={below}
          lit={link.lit} linked={running ? [] : link.hover?.lines ?? []} error={shownError} flashLine={flash}
          onLine={running ? undefined : link.fromLine} minLines={4}
        />
      </section>
      <section className="level-stage tx-stage" aria-label="Tablero">
        <div className="controls">
          <button type="button" className={`btn btn-play cut${s.current.edits > 0 && !v.done && !running ? ' tx-nudge' : ''}`} onClick={() => void run()} disabled={running} aria-label="Probar"><PlayIcon /><span>Probar</span></button>
          <RestartButton onClick={() => void viewRef.current?.reset()} disabled={running} />
          {(v.done || late) && !running && <NextButton onClick={v.turn} />}
        </div>
        <Sheet svgRef={svgRef} level={level} />
        {optional && !v.done && <p className="tx-stretch" aria-hidden="true">Si querés</p>}
      </section>
    </Page>
  );
}

/** The hint under the program: a few words and the keys to type, drawn as keys. */
function Hint({ hint }: { hint: NonNullable<EditTask['hint']> }) {
  return (
    <div className="tx-hint">
      <span className="tx-hint-words">{hint.words}</span>
      {hint.keys && <span className="tx-keys">{[...hint.keys].map((k, i) => <kbd key={i} className="cut">{k}</kbd>)}</span>}
    </div>
  );
}

/** The stretch's word bank: the moves the child knows, as blocks and as text. */
function WordBank() {
  return (
    <div className="tx-bank" aria-label="Las palabras que ya conocés">
      {BANK.map((b) => (
        <span key={b.cmd} className="tx-bank-row"><MiniCmd cmd={b.cmd} /><code>{b.text}</code></span>
      ))}
    </div>
  );
}

// ================================================================== did you like it?

const LIKED: { value: 'yes' | 'mid' | 'no'; word: string; mood: 'happy' | 'mid' | 'sad' }[] = [
  { value: 'yes', word: '¡Mucho!', mood: 'happy' },
  { value: 'mid', word: 'Más o menos.', mood: 'mid' },
  { value: 'no', word: 'No.', mood: 'sad' },
];

function Liked({ done }: { done(): void }) {
  const api = usePlaytest();
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    let off = () => {};
    const t = setTimeout(() => { off = speakWhenAllowed(TX_SAY.liked); }, 350);
    return () => { clearTimeout(t); off(); };
  }, []);
  const answer = (o: typeof LIKED[number]) => {
    if (picked) return;
    setPicked(o.value);
    speak(o.word);
    api.log('survey_answer', { question: 'text_probe_liked', answer: o.value });
    setTimeout(done, 1100);
  };
  return (
    <main className="pp-page pp-survey tx-liked" data-question="text_probe_liked">
      <header className="pp-survey-bar level-bar cut">
        <button type="button" className="speak cut" aria-label="Escuchar otra vez" onClick={() => { api.log('speak', { level_id: LEVEL_ID, phase: 'liked' }); speak(TX_SAY.liked); }}><SpeakerIcon /></button>
        <span className="tx-liked-icon" aria-hidden="true"><BlockToTextDoodle /></span>
        <p className="pp-survey-adult">¿Te gustó escribir el programa? (Del bloque al texto)</p>
      </header>
      <section className="sheet pp-card pp-options n3" aria-label="¿Te gustó escribir el programa?">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        {LIKED.map((o, i) => (
          <button key={o.value} type="button" className={`pp-option cut${picked === o.value ? ' is-picked' : ''}${picked && picked !== o.value ? ' is-other' : ''}`} data-answer={o.value} aria-label={o.word} onClick={() => answer(o)}>
            <Face mood={o.mood} seed={i + 31} />
            {picked === o.value && <PenRing seed={i + 5} />}
          </button>
        ))}
      </section>
    </main>
  );
}
