// "Del bloque al texto" (5to, about 8–10 minutes; T8 of the pilot
// playtest): can a child of 5to read and edit the text version of a block
// program (readiness for text and Python)? A probe of free play
// (probes.ts): its card is on 5to's menu; the adult's corner menu opens it
// for any grade.
//
// A short tour first: the same program as blocks and as Python-like text
// side by side (a line and its block light together under the finger, and
// while the program runs on the board, step by step). Then eight fixed
// items (textProbe.ts) the child moves through freely with the stamps of the
// bar: predict (read the text, pick one of three drawn boards, watch it
// run), change a number, fix a slip, blocks → text (pick the same program
// among three texts), and the stretch: write one line. The editor is a real
// text area (big monospace, syntax colours, no autocorrect); ▶ parses the
// text (game/textCode.ts) and runs it on the real board, or says the
// error on its line in one short sentence. Then "¿Te gustó escribir el
// programa?" with three faces.
//
// ✋ in three steps per item: the instruction again (and the target
// wiggles); the ghost hand points at the line that matters; the fix written
// as a ghost edit (a predict item: the ghost follows the program onto the
// board; a blocks item: it points at the answer). A fourth press or a held
// ✋ raises the hand.
//
// Logged (docs/prueba-piloto-datos.md): `probe_phase` and `probe_end` with
// `probe: 'text'`, `text_item`, `text_run`, `survey_answer` {question:
// 'text_probe_liked'}, and `help`, `speak`, `ghost_demo` with level_id
// 'text_probe' and `item`.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useBlockEditor, notebookWidth, type Marks } from '../blocks/BlockEditor';
import { refKey } from '../blocks/blocks';
import type { LevelDef } from '../game/levels';
import type { Board, Program, TraceStep } from '../game/model';
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
import { HAND_HOLD_HELP_MS, useHold } from './AdultControls';
import { usePlaytest, type LevelTrack } from './context';
import { Cheer } from './interlude';
import type { ProbeProps } from './probes';
import { Face } from './surveyArt';
import {
  ITEMS, NEXT_AFTER_MS, TOUR, TOUR_NEXT_MS, TX_SAY, blocksOfText, nextOpen,
  type ChoiceItem, type EditItem, type PredictItem, type TextItem,
} from './textProbe';
import { BlockToTextDoodle, EndBoard, ItemStamps, NoteArrow } from './textProbeArt';
import '../blocks/blocks.css';
import './textProbe.css';

const LEVEL_ID = 'text_probe';
const PROBE = 'text';
/** After this long in the items, "next" goes to the liking question (the probe is ~10 minutes). */
const PROBE_CAP_MS = 12 * 60_000;
/** The items that count as "the probe done" (the stretch one is optional). */
const CORE = ITEMS.filter((i) => i.kind !== 'write').map((i) => i.id);

type Stage = 'tour' | 'items' | 'liked' | 'cheer';
type Log = (type: string, payload: Record<string, unknown>) => void;

/** What an item page tells the probe when the child answered, solved or left it. */
export interface ItemReport {
  item: string;
  kind: TextItem['kind'];
  reason: 'answered' | 'solved' | 'left';
  correct: boolean;
  attempts: number;
  help_levels: number;
  [k: string]: unknown;
}

/** A page's board as a level (the board hook and the sheet want one). */
function levelFor(id: string, board: Board): LevelDef {
  return { id: `pp-texto-${id}`, grade: '3ro', page: 1, title: '', say: '', mode: 'program', worlds: [board], blocks: [], blockLabel: 'word-picture', solution: [] };
}

/** The blocks column is as wide as a repeat holding a "si" block needs. */
const BLOCKS_W = notebookWidth(['right', 'ifrock:right', 'repeat'], 'word-picture');

export function TextProbe({ activity, levelEnded, done }: ProbeProps) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const [stage, setStage] = useState<Stage>('tour');
  const [at, setAt] = useState(0);
  const [visit, setVisit] = useState(0);
  const [finished, setFinished] = useState<Set<string>>(() => new Set());
  const finishedRef = useRef(finished);
  /** The editor's text of each edit item (kept between visits), and each pick. */
  const texts = useRef<Record<string, string>>({});
  const answers = useRef<Record<string, string>>({});
  const mountAt = useRef(Date.now());
  const itemsAt = useRef(0);
  const totals = useRef({ runs: 0, picks: 0, helps: 0, tried: new Set<string>(), correct: new Set<string>(), closed: false, adultHelped: false, tourRuns: 0, links: 0 });

  const log: Log = (type, payload) => apiRef.current.log(type, payload);

  useEffect(() => {
    apiRef.current.did(activity);
    return () => {
      stopSpeaking();
      const t = totals.current;
      if (!t.closed) log('probe_end', { probe: PROBE, reason: 'left', time_ms: Date.now() - mountAt.current, items_tried: t.tried.size, items_correct: t.correct.size });
      apiRef.current.level.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tourDone = (runs: number, helps: number) => {
    const t = totals.current;
    t.helps = Math.max(t.helps, helps);
    log('probe_phase', { probe: PROBE, phase: 'intro', completed: runs > 0, time_ms: Date.now() - mountAt.current, runs, links: t.links, help_levels: helps });
    itemsAt.current = Date.now();
    setStage('items');
  };

  const report = (r: ItemReport) => {
    const t = totals.current;
    t.helps = Math.max(t.helps, r.help_levels);
    if (r.adult_helped) t.adultHelped = true;
    if (r.reason !== 'left') t.tried.add(r.item);
    if (r.correct) t.correct.add(r.item);
    log('text_item', { ...r });
    if (r.reason !== 'left') {
      const f = new Set(finishedRef.current);
      f.add(r.item);
      finishedRef.current = f;
      setFinished(f);
    }
  };

  const itemsDone = () => {
    const t = totals.current;
    log('probe_phase', {
      probe: PROBE, phase: 'items', completed: CORE.every((id) => finishedRef.current.has(id)), time_ms: Date.now() - itemsAt.current,
      runs: t.runs, picks: t.picks, items_tried: t.tried.size, items_correct: t.correct.size, help_levels: t.helps,
    });
    setStage('liked');
  };

  const go = (i: number) => { setAt(i); setVisit((v) => v + 1); };
  const next = () => {
    const f = new Set(finishedRef.current);
    f.add(ITEMS[at].id);
    const j = Date.now() - itemsAt.current > PROBE_CAP_MS ? null : nextOpen(at, f);
    if (j == null) itemsDone(); else go(j);
  };

  const finish = () => {
    const t = totals.current;
    t.closed = true;
    log('probe_end', { probe: PROBE, reason: 'done', time_ms: Date.now() - mountAt.current, items_tried: t.tried.size, items_correct: t.correct.size, runs: t.runs });
    levelEnded({
      level_id: LEVEL_ID, activity, outcome: CORE.every((id) => t.tried.has(id)) ? 'win' : 'fail', time_ms: Date.now() - mountAt.current,
      attempts: t.runs + t.picks, help_levels: t.helps, blocks_optimal: 0, adult_helped: t.adultHelped,
    });
    done();
  };

  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __tx: unknown }).__tx = {
      stage: () => stage, go: (s: Stage) => { if (s === 'items') itemsAt.current = Date.now(); setStage(s); }, at: () => at, item: (i: number) => { setStage('items'); go(i); },
      finished: () => [...finishedRef.current],
    };
  });

  const counters = { run: () => { totals.current.runs++; }, pick: () => { totals.current.picks++; }, link: () => { totals.current.links++; } };

  if (stage === 'liked') return <Liked done={() => setStage('cheer')} />;
  if (stage === 'cheer') return <Cheer line="¡Muy bien!" say={TX_SAY.cheer} done={finish} />;
  if (stage === 'tour') return <TourPage onDone={tourDone} counters={counters} />;

  const item = ITEMS[at];
  const key = `${item.id}:${visit}`;
  const common = {
    stamps: <ItemStamps items={ITEMS} at={at} finished={finished} onGo={(i) => { if (i !== at) go(i); }} />,
    first: visit === 0,
    done: finished.has(item.id),
    report,
    onNext: next,
    counters,
  };
  if (item.kind === 'predict') return <PredictPage key={key} {...common} item={item} picked={answers.current[item.id] ?? null} onPick={(a) => { answers.current[item.id] = a; }} />;
  if (item.kind === 'blocks_to_text') return <ChoicePage key={key} {...common} item={item} picked={answers.current[item.id] ?? null} onPick={(a) => { answers.current[item.id] = a; }} />;
  return <EditPage key={key} {...common} item={item} text={texts.current[item.id] ?? item.text} onText={(t) => { texts.current[item.id] = t; }} />;
}

interface Counters { run(): void; pick(): void; link(): void }
interface PageProps {
  stamps: ReactNode;
  first: boolean;
  done: boolean;
  report(r: ItemReport): void;
  onNext(): void;
  counters: Counters;
}

// ================================================================== what every item page shares

/**
 * The item's visit: its entry line, its level record for the adult's
 * gestures, ✋'s three steps and the ghost hand, and its `text_item` when the
 * child leaves it having done something but not finished it.
 */
function useItemVisit(item: TextItem | null, first: boolean, rootRef: React.RefObject<HTMLElement | null>) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const id = item?.id ?? 'tour';
  const track = useRef<LevelTrack>({ id: LEVEL_ID, helpStep: 0, adultHelped: false });
  const startedAt = useRef(Date.now());
  const help = useRef(0);
  const ghostRun = useRef<GhostRun | null>(null);
  const demoRef = useRef(false);
  const [demoing, setDemoing] = useState(false);
  const log: Log = (type, payload) => apiRef.current.log(type, payload);
  const say = item?.say ?? TOUR.say;

  useEffect(() => {
    apiRef.current.level.current = track.current;
    let off = () => {};
    const line = !item ? `${TX_SAY.intro} ${say}` : first ? `${TX_SAY.items} ${say}` : say;
    const t = window.setTimeout(() => { off = speakWhenAllowed(line); }, 400);
    return () => {
      clearTimeout(t); off(); ghostRun.current?.cancel();
      if (apiRef.current.level.current === track.current) apiRef.current.level.current = null;
    };
    // once per visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const demo = (steps: DemoStep[], kind: string, pace?: number) => {
    const root = rootRef.current;
    if (!root) return null;
    ghostRun.current?.cancel();
    demoRef.current = true;
    setDemoing(true);
    const g = playGhost(root, steps, { pace });
    ghostRun.current = g;
    log('ghost_demo', { level_id: LEVEL_ID, kind, item: id });
    return g.done.then(() => { if (ghostRun.current === g) { demoRef.current = false; setDemoing(false); } });
  };

  const wiggle = (sel: string) => {
    rootRef.current?.querySelectorAll(sel).forEach((el) => el.animate?.([{ scale: '1' }, { scale: '1.04' }, { scale: '1' }, { scale: '1.04' }, { scale: '1' }], { duration: 1100 }));
  };

  /** ✋: step 1 the line again (and `target` wiggles), 2 `hint`, 3 `solve`; then the raised hand. */
  const onHelp = (o: { busy: boolean; target: string; hint(): void; solve(): void }) => {
    const a = apiRef.current;
    if (demoRef.current || o.busy) return;
    if (help.current >= 3) { a.raiseHand('help_step_3'); return; }
    const step = ++help.current;
    track.current.helpStep = step;
    log('help', { level_id: LEVEL_ID, step, item: id });
    if (step === 1) { speak(say); wiggle(o.target); return; }
    if (step === 2) { o.hint(); return; }
    o.solve();
  };
  useHold(HAND_HOLD_HELP_MS, (e) => !!(e.target as Element | null)?.closest?.('.tx-root .level-bar .help'), () => apiRef.current.raiseHand('help_held'));

  const onSpeak = () => { log('speak', { level_id: LEVEL_ID, item: id }); speak(say); };

  return { log, demo, demoRef, demoing, onHelp, onSpeak, help, track, startedAt };
}

/** The next-page button of an item: once it is finished, or after a while anyway (NEXT_AFTER_MS). */
function useLate(kind: TextItem['kind'] | 'tour') {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const ms = kind === 'tour' ? TOUR_NEXT_MS : NEXT_AFTER_MS[kind];
    if (!Number.isFinite(ms)) return;
    const t = window.setTimeout(() => setLate(true), ms);
    return () => clearTimeout(t);
  }, [kind]);
  return late;
}

function NextButton({ onClick }: { onClick(): void }) {
  return <button type="button" className="next-page cut pop-in tx-next" aria-label="Seguir" onClick={onClick}><NextPageArt /></button>;
}

function Title({ item }: { item: TextItem | null }) {
  const n = item ? ITEMS.indexOf(item) + 1 : 0;
  return <><b>Del bloque al texto</b>Del bloque al texto · {item ? `${n} de ${ITEMS.length} · ${item.title}` : 'el mismo programa, con bloques y con letras'}</>;
}

/** The page: the bar with the item stamps (or the tour's doodle) and the page's zones. */
function Page({ rootRef, layout, item, stamps, onSpeak, onHelp, busy, demoing, board, children }: {
  rootRef: React.RefObject<HTMLElement | null>; layout: string; item: TextItem | null; stamps: ReactNode; onSpeak(): void; onHelp(): void;
  busy: boolean; demoing: boolean; board?: LevelDef; children: ReactNode;
}) {
  const style = {
    '--blocks-w': `${BLOCKS_W}px`,
    ...(board ? { '--aspect': aspectOf(board.worlds[0], frameFor(board)).toFixed(3) } : {}),
  } as CSSProperties;
  return (
    <main ref={rootRef} className={`level tx-root is-${layout}${demoing ? ' is-demo' : ''}`} data-item={item?.id ?? 'tour'} data-busy={busy ? 'true' : undefined} style={style}>
      <Bar
        instruction={<span className="drawn-task tx-task">{stamps}</span>}
        title={<Title item={item} />}
        pages={null}
        onSpeak={onSpeak}
        onHelp={onHelp}
      />
      {children}
    </main>
  );
}

// ================================================================== the code: colours, lines, the editor

const LH = { big: 40, small: 30 };
const PAD = { big: 14, small: 10 };

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
  /** Where the caret starts (edit items). */
  caret?: { line: number; col: number } | null;
  /** The finger is over a line (`tap`: it pressed it); null: it left. */
  onLine?(line: number | null, tap: boolean): void;
  small?: boolean;
  minLines?: number;
  label: string;
}

/**
 * The program as text, on the notebook's lines, with its line numbers and
 * syntax colours. Editable: a real textarea over the coloured text (the
 * letters it types are transparent; the colours show through), big
 * monospace, no spellcheck or autocorrect, Tab and Enter indent.
 */
export function Code({ text, editable, onText, lit, linked = [], error, flashLine, caret, onLine, small, minLines = 0, label }: CodeProps) {
  const size = small ? 'small' : 'big';
  const lh = LH[size], pad = PAD[size];
  const ta = useRef<HTMLTextAreaElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const pending = useRef<number | null>(null);
  const lines = text.split('\n');
  const rows = Math.max(lines.length, minLines);

  useEffect(() => {
    if (!editable || !caret || !ta.current) return;
    const off = offsetOf(text, caret);
    ta.current.focus({ preventScroll: true });
    ta.current.setSelectionRange(off, off);
    // once, when the item opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLayoutEffect(() => {
    if (pending.current == null || !ta.current) return;
    ta.current.setSelectionRange(pending.current, pending.current);
    pending.current = null;
  });

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
  return (
    <div
      className={`tx-code is-${size}${editable ? ' is-edit' : ''}`}
      style={{ '--lh': `${lh}px`, '--pad': `${pad}px`, '--rows': rows } as CSSProperties}
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
          <pre className="tx-hl" aria-hidden={editable ? true : undefined} aria-label={editable ? undefined : label}>
            {lines.map((l, i) => (
              <div key={i} className={`tx-line${i + 1 === errLine ? ' is-error' : ''}`} data-line={i + 1}>
                {l.length ? colorLine(l).map((tk, k) => <span key={k} className={`txk-${tk.kind}${tk.action ? ` txa-${tk.action}` : ''}`}>{tk.text}</span>) : '​'}
              </div>
            ))}
          </pre>
          {error && (
            <div className="tx-note" role="status" style={{ top: pad + Math.max(error.line, lines.length) * lh + 6 }} data-error={error.kind}>
              <NoteArrow />
              <p>{error.show}</p>
            </div>
          )}
        </div>
        {editable && (
          <textarea
            ref={ta}
            className="tx-input"
            value={text}
            onChange={(e) => onText?.(e.target.value)}
            onKeyDown={onKey}
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

// ================================================================== the tour

function TourPage({ onDone, counters }: { onDone(runs: number, helps: number): void; counters: Counters }) {
  const rootRef = useRef<HTMLElement>(null);
  const v = useItemVisit(null, true, rootRef);
  const level = useMemo(() => levelFor('tour', TOUR.board), []);
  const { svgRef, viewRef } = useBoard(level);
  const code = useMemo(() => { const p = parseText(TOUR.text); return p.ok ? p.code : []; }, []);
  const program = useMemo(() => toProgram(code)!, [code]);
  const link = useLink(code, counters);
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState(0);
  const late = useLate('tour');

  const run = async () => {
    const view = viewRef.current;
    if (!view || running) return;
    setRunning(true);
    counters.run();
    const { trace, lines } = runText(TOUR.board, code);
    const res = await view.play(trace, { onStep: (s: TraceStep) => { link.setLit(lines[s.index]); link.step(s); } });
    link.setLit(null); link.step(null);
    setRunning(false);
    if (res === 'aborted') return;
    v.log('text_run', { item: 'tour', ok: true, result: trace.outcome === 'win' ? 'win' : trace.outcome === 'crash' ? 'bump' : 'short', error_kind: null, line: null });
    setRuns((n) => n + 1);
  };

  const onHelp = () => v.onHelp({
    busy: running, target: '.tx-code',
    hint: () => { void v.demo([{ do: 'point', at: ['.tx-code .tx-line[data-line="2"]'] }, { do: 'point', at: ['.tx-blocks [data-ref="1"]'] }], 'hint'); },
    solve: () => { void v.demo([{ do: 'tap', at: '.tx-root .btn-play', apply: () => void run() }], 'run'); },
  });

  const current = running ? link.cur : link.hover?.key ?? null;
  return (
    <Page rootRef={rootRef} layout="tour" item={null} stamps={<BlockToTextDoodle />} onSpeak={v.onSpeak} onHelp={onHelp} busy={running} demoing={v.demoing} board={level}>
      <BlocksZone program={program} current={current} iteration={link.iteration} onKey={running ? undefined : link.fromKey} />
      <section className="zone zone-program tx-code-zone" aria-label="El programa, con letras">
        <Code text={TOUR.text} label="El programa, con letras" lit={link.lit} linked={running ? [] : link.hover?.lines ?? []} onLine={running ? undefined : link.fromLine} />
      </section>
      <section className="level-stage tx-stage" aria-label="Tablero">
        <div className="controls">
          <button type="button" className="btn btn-play cut" onClick={() => void run()} disabled={running} aria-label="Probar"><PlayIcon /><span>Probar</span></button>
          <RestartButton onClick={() => void viewRef.current?.reset()} disabled={running} />
          {(runs > 0 || late) && !running && <NextButton onClick={() => onDone(runs, v.help.current)} />}
        </div>
        <Sheet svgRef={svgRef} level={level} />
      </section>
    </Page>
  );
}

// ================================================================== predict: read the text, pick where it ends

function PredictPage({ item, stamps, first, done, report, onNext, counters, picked: pickedBefore, onPick }: PageProps & { item: PredictItem; picked: string | null; onPick(a: string): void }) {
  const rootRef = useRef<HTMLElement>(null);
  const v = useItemVisit(item, first, rootRef);
  const level = useMemo(() => levelFor(item.id, item.board), [item]);
  const { svgRef, viewRef } = useBoard(level);
  const code = useMemo(() => { const p = parseText(item.text); return p.ok ? p.code : []; }, [item]);
  const link = useLink(code);
  const [picked, setPicked] = useState<string | null>(pickedBefore);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);

  const play = async () => {
    const view = viewRef.current;
    if (!view || running) return;
    setRunning(true);
    const { trace, lines } = runText(item.board, code);
    const res = await view.play(trace, { onStep: (s: TraceStep) => link.setLit(lines[s.index]), quiet: true, celebrate: false });
    link.setLit(null);
    setRunning(false);
    if (res !== 'aborted') setRan(true);
  };

  const pick = (id: string, position: number) => {
    if (picked || v.demoRef.current) return;
    setPicked(id);
    onPick(id);
    counters.pick();
    speak(TX_SAY.picked);
    report({
      item: item.id, kind: 'predict', reason: 'answered', answer: id, correct: id === item.answer, position,
      attempts: 1, errors: [], time_ms: Date.now() - v.startedAt.current, help_levels: v.help.current, adult_helped: v.track.current.adultHelped,
    });
    window.setTimeout(() => void play(), 900);
  };

  const onHelp = () => v.onHelp({
    busy: running, target: '.tx-options .tx-option',
    hint: () => { speak(TX_SAY.hint); void v.demo([{ do: 'point', at: [`.tx-code .tx-line[data-line="${item.focusLine}"]`] }, { do: 'wait', ms: 500 }, { do: 'point', at: [`.tx-code .tx-line[data-line="${item.focusLine + 1}"]`] }], 'hint'); },
    solve: () => {
      // the ghost follows the program: a line, where the character gets to; the next line…
      const { trace, lines } = runText(item.board, code);
      const steps: DemoStep[] = [];
      trace.steps.slice(0, 3).forEach((s, i) => {
        steps.push({ do: 'point', at: [`.tx-code .tx-line[data-line="${lines[i]}"]`] });
        steps.push({ do: 'point', at: [`.board [data-cell="${s.to.c},${s.to.r}"]`] });
      });
      void v.demo(steps, 'follow');
    },
  });

  const wide = item.board.cols / item.board.rows >= 3;
  return (
    <Page rootRef={rootRef} layout="predict" item={item} stamps={stamps} onSpeak={v.onSpeak} onHelp={onHelp} busy={running} demoing={v.demoing} board={level}>
      <section className="zone zone-program tx-code-zone" aria-label="El programa, con letras">
        <Code text={item.text} label="El programa" lit={link.lit} />
      </section>
      <section className={`level-stage tx-stage tx-predict-stage${wide ? ' is-wide' : ''}`} aria-label="Tablero">
        <div className="controls">
          {picked && <button type="button" className="btn btn-play cut" onClick={() => void play()} disabled={running} aria-label="Ver otra vez"><PlayIcon /><span>Ver</span></button>}
          {picked && <RestartButton onClick={() => void viewRef.current?.reset()} disabled={running} />}
          {(done || picked) && (ran || done) && !running && <NextButton onClick={onNext} />}
        </div>
        <Sheet svgRef={svgRef} level={level} />
        {!picked && <p className="tx-ask">{item.id === 'predict_if' ? '¿Qué va a pasar?' : '¿Dónde va a terminar?'}</p>}
        <div className={`tx-options${wide ? ' is-wide' : ''}`} role="group" aria-label="¿Dónde termina?">
          {item.options.map((o, k) => (
            <button key={o.id} type="button" className={`pp-option cut tx-option${picked === o.id ? ' is-picked' : ''}${picked && picked !== o.id ? ' is-other' : ''}`} data-answer={o.id} aria-label={`Dibujo ${k + 1}`} onClick={() => pick(o.id, k)}>
              <EndBoard board={item.board} end={o.end} bump={o.bump} />
              {picked === o.id && <PenRing seed={k + 4} />}
            </button>
          ))}
        </div>
      </section>
    </Page>
  );
}

// ================================================================== blocks → text: which text is the same program?

function ChoicePage({ item, stamps, first, done, report, onNext, counters, picked: pickedBefore, onPick }: PageProps & { item: ChoiceItem; picked: string | null; onPick(a: string): void }) {
  const rootRef = useRef<HTMLElement>(null);
  const v = useItemVisit(item, first, rootRef);
  const [picked, setPicked] = useState<string | null>(pickedBefore);

  const pick = (id: string, position: number) => {
    if (picked || v.demoRef.current) return;
    setPicked(id);
    onPick(id);
    counters.pick();
    speak(TX_SAY.pickedBlocks);
    report({
      item: item.id, kind: 'blocks_to_text', reason: 'answered', answer: id, correct: id === item.answer, position,
      attempts: 1, errors: [], time_ms: Date.now() - v.startedAt.current, help_levels: v.help.current, adult_helped: v.track.current.adultHelped,
    });
  };

  const onHelp = () => v.onHelp({
    busy: false, target: '.tx-choices .tx-choice',
    hint: () => { speak(TX_SAY.hint); void v.demo(item.options.map((_, k) => ({ do: 'point', at: [`.tx-choice[data-k="${k}"] .tx-line[data-line="${item.focusLine}"]`] } as DemoStep)), 'hint'); },
    solve: () => { void v.demo([{ do: 'point', at: ['.tx-blocks .block-program'] }, { do: 'point', at: [`.tx-choice[data-answer="${item.answer}"]`] }], 'answer'); },
  });

  return (
    <Page rootRef={rootRef} layout="choice" item={item} stamps={stamps} onSpeak={v.onSpeak} onHelp={onHelp} busy={false} demoing={v.demoing}>
      <BlocksZone program={item.program} />
      <section className="tx-choices-zone" aria-label="¿Cuál es el mismo programa?">
        <div className="controls tx-choice-controls"><p className="tx-ask">¿Cuál es el mismo programa que los bloques?</p>{(picked || done) && <NextButton onClick={onNext} />}</div>
        <div className="tx-choices" role="group">
          {item.options.map((o, k) => (
            <button key={o.id} type="button" className={`cut tx-choice${picked === o.id ? ' is-picked' : ''}${picked && picked !== o.id ? ' is-other' : ''}`} data-answer={o.id} data-k={k} aria-label={`Programa ${k + 1}`} onClick={() => pick(o.id, k)}>
              <Code text={o.text} small label={`Programa ${k + 1}`} />
              {picked === o.id && <PenRing seed={k + 7} />}
            </button>
          ))}
        </div>
      </section>
    </Page>
  );
}

// ================================================================== change a number, fix a slip, write a line

function EditPage({ item, stamps, first, done, report, onNext, counters, text: textBefore, onText }: PageProps & { item: EditItem; text: string; onText(t: string): void }) {
  const rootRef = useRef<HTMLElement>(null);
  const v = useItemVisit(item, first, rootRef);
  const level = useMemo(() => levelFor(item.id, item.board), [item]);
  const { svgRef, viewRef } = useBoard(level);
  const [text, setTextState] = useState(textBefore);
  const textRef = useRef(text);
  const setText = (t: string) => { textRef.current = t; setTextState(t); onText(t); };
  const parsed = useMemo(() => parseText(text), [text]);
  const code = parsed.ok ? parsed.code : null;
  const live = code ? toProgram(code) : null;
  /** The blocks as they last parsed (dimmed while the text does not). */
  const lastBlocks = useRef<Program | null>(blocksOfText(textBefore) ?? blocksOfText(item.fixed));
  if (live) lastBlocks.current = live;
  const link = useLink(code, counters);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<TextError | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [won, setWon] = useState(done);
  const late = useLate(item.kind);
  const visit = useRef({ attempts: 0, errors: [] as string[], edits: 0, ghostFixed: false, logged: done });

  // leaving an item tried but not solved: its text_item says so
  const leave = useRef(() => {});
  leave.current = () => {
    const s = visit.current;
    if (s.logged || (!s.attempts && !s.edits && !v.help.current)) return;
    s.logged = true;
    report({
      item: item.id, kind: item.kind, reason: 'left', text: storedText(textRef.current), correct: false, attempts: s.attempts, errors: s.errors,
      time_ms: Date.now() - v.startedAt.current, help_levels: v.help.current, ghost_fixed: s.ghostFixed, adult_helped: v.track.current.adultHelped,
    });
  };
  useEffect(() => () => leave.current(), []);

  const edit = (t: string) => {
    if (v.demoRef.current || running) return;
    visit.current.edits++;
    setFlash(null);
    setText(t);
  };

  const run = async () => {
    const view = viewRef.current;
    if (!view || running) return;
    const t = textRef.current;
    const s = visit.current;
    s.attempts++;
    counters.run();
    setFlash(null);
    const p = parseText(t);
    if (!p.ok) {
      s.errors.push(p.error.kind);
      setError(p.error);
      v.log('text_run', { item: item.id, ok: false, result: null, error_kind: p.error.kind, line: p.error.line, attempt: s.attempts });
      speak(p.error.say);
      void view.puzzled();
      return;
    }
    setError(null);
    setRunning(true);
    const { trace, lines } = runText(item.board, p.code);
    const res = await view.play(trace, { onStep: (st: TraceStep) => { link.setLit(lines[st.index]); link.step(st); } });
    link.setLit(null); link.step(null);
    setRunning(false);
    if (res === 'aborted') return;
    const result = trace.outcome === 'win' ? 'win' : trace.outcome === 'crash' ? 'bump' : 'short';
    v.log('text_run', { item: item.id, ok: true, result, error_kind: null, line: null, attempt: s.attempts });
    if (result === 'win') {
      setWon(true);
      speak(TX_SAY.won);
      if (!s.logged) {
        s.logged = true;
        report({
          item: item.id, kind: item.kind, reason: 'solved', text: storedText(t), correct: !s.ghostFixed, attempts: s.attempts, errors: s.errors,
          time_ms: Date.now() - v.startedAt.current, help_levels: v.help.current, ghost_fixed: s.ghostFixed, adult_helped: v.track.current.adultHelped,
        });
      }
    } else speak(result === 'bump' ? TX_SAY.bump : TX_SAY.short);
  };

  const onHelp = () => v.onHelp({
    busy: running, target: '.tx-code',
    hint: () => { speak(TX_SAY.hint); void v.demo([{ do: 'point', at: [`.tx-code .tx-line[data-line="${item.focusLine}"]`] }, { do: 'wait', ms: 400 }], 'hint'); },
    solve: () => {
      // the fix, written by the ghost hand: it taps the line and the line becomes right (a ghost edit)
      speak(TX_SAY.ghost);
      void v.demo([{
        do: 'tap', at: `.tx-code .tx-line[data-line="${item.focusLine}"]`,
        apply: () => {
          visit.current.ghostFixed = true;
          setText(item.fixed);
          setError(null);
          setFlash(item.focusLine);
          v.log('text_edit', { item: item.id, ghost: true, line: item.focusLine });
        },
      }, { do: 'wait', ms: 500 }, { do: 'point', at: ['.tx-root .btn-play'] }], 'fix');
    },
  });

  // the error note stays only while the text still has that error
  const shownError = error && !parsed.ok && parsed.error.kind === error.kind && parsed.error.line === error.line ? error : null;

  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __txe: unknown }).__txe = { text: () => textRef.current, setText: edit, run, help: onHelp, won: () => won };
  });

  const blocks = item.blocks ? lastBlocks.current : null;
  const current = running ? link.cur : link.hover?.key ?? null;
  return (
    <Page rootRef={rootRef} layout={blocks ? 'edit-blocks' : 'edit'} item={item} stamps={stamps} onSpeak={v.onSpeak} onHelp={onHelp} busy={running} demoing={v.demoing} board={level}>
      {blocks && <BlocksZone program={blocks} current={current} iteration={running ? link.iteration : null} dim={!live} onKey={running || !live ? undefined : link.fromKey} />}
      <section className="zone zone-program tx-code-zone" aria-label="El programa, con letras">
        <Code
          text={text} editable onText={edit} label="El programa, con letras" caret={item.caret}
          lit={link.lit} linked={running ? [] : link.hover?.lines ?? []} error={shownError} flashLine={flash}
          onLine={running ? undefined : link.fromLine} minLines={6}
        />
      </section>
      <section className="level-stage tx-stage" aria-label="Tablero">
        <div className="controls">
          <button type="button" className="btn btn-play cut" onClick={() => void run()} disabled={running} aria-label="Probar"><PlayIcon /><span>Probar</span></button>
          <RestartButton onClick={() => void viewRef.current?.reset()} disabled={running} />
          {(won || late) && !running && <NextButton onClick={onNext} />}
        </div>
        <Sheet svgRef={svgRef} level={level} />
        {item.kind === 'write' && !won && <p className="tx-stretch" aria-hidden="true">Si querés</p>}
      </section>
    </Page>
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
