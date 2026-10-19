// T39: a long-ladder item on the Game Workshop's blocks (rungs 13–18,
// ladderVm.ts), played with the Workshop's own editor and stage and
// instrumented like a level page (PlaytestLevel.tsx): `level_start`, a `run`
// per checked ▶ (or the predict guess), `help` 1–3 (the goal again; the
// palette glows; one hint line) and a fourth ✋ that raises the hand, the
// adult's help (AdultControls through `api.level`), and `level_end`. The
// ladder's caps work the same (`watch` sees the same LevelStats).
//
// The goal is large inside the screen, above the work. Edit items (fix,
// complete, modify): ▶ runs the game and, after a moment, the check says
// what it saw; a ▶ on the project exactly as given is a look, never a failed
// try. Predict items: the scripts are shown big, the stage marks the places
// to choose from; one tap is the answer, then the game runs with the keys
// pressed and the right place lights up — one guess (a second one, after
// seeing the run, would not be a prediction; a wrong guess gets the rung's
// second item instead).
//
// A wordless first-time demo per format (the ghost hand: a block dragged
// from the palette onto the paper and ▶; or pointing at the places), never
// the answer; none for "modify then make".

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bar } from '../screens/LevelBar';
import { DEBUG } from '../screens/levelKit';
import { PlayerFace } from '../screens/player';
import { SeedPouch } from '../screens/yearKit';
import { ThenArrow } from '../ui/art';
import { playGhost } from '../ui/ghost';
import { speak, stopSpeaking } from '../ui/speech';
import { BlockPicture, FlagGlyph, layoutCtx, resetMeasure } from '../workshop/BlockSvg';
import { Editor, type EditInfo } from '../workshop/Editor';
import { menuLabel } from '../workshop/menus';
import type { Project } from '../workshop/model';
import { Stage, type StageHandle } from '../workshop/Stage';
import { SpriteThumb } from '../workshop/art';
import '../workshop/workshop.css';
import { solve, progress } from '../curriculum/progress';
import { usePlaytest, type LevelTrack } from './context';
import { provideDemoActions } from './demo';
import { checkVm, nearestSpot, predictEnd, PRESS_EVERY, PRESS_FROM, scriptsText, type VmCheck, type VmItem } from './ladderVm';
import type { LevelEnd, LevelOutcome, LevelStats } from './PlaytestLevel';

const CHECK_AFTER_MS = 2500;
const WATCH_TICK_MS = 5000;
const FRAME_MS = 1000 / 30;
/** After the predict run, the right place shows this long before the page turns. */
const REVEAL_MS = 2600;

/** Formats whose wordless demo was already shown to this session's child. */
const demoed = new Map<string, Set<string>>();
const demoKind = (i: VmItem) => (i.format === 'predict' ? 'predict' : i.format === 'modify' ? null : 'edit');

export interface VmItemProps {
  item: VmItem;
  extra?: Record<string, unknown>;
  onEnd(result: LevelEnd): void;
  watch?(stats: LevelStats): LevelOutcome | { outcome: LevelOutcome; reason: string } | null;
  autoNextMs?: number;
}

export function LadderVmItem({ item, extra, onEnd, watch, autoNextMs = 8000 }: VmItemProps) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const props = useRef({ extra, onEnd, watch });
  props.current = { extra, onEnd, watch };
  const [given] = useState(() => item.project());
  const givenText = useMemo(() => scriptsText(given), [given]);
  const [project, setProject] = useState<Project>(given);
  const projectRef = useRef(project);
  projectRef.current = project;
  const [sel, setSel] = useState(item.focus);
  const [help, setHelp] = useState(0);
  const [why, setWhy] = useState<string | null>(null);
  const [won, setWon] = useState(false);
  const [guess, setGuess] = useState<number | null>(null);
  const [answer, setAnswer] = useState<number | null>(null);
  const [fonts, setFonts] = useState(0);
  const stage = useRef<StageHandle>(null);
  const rootRef = useRef<HTMLElement>(null);
  const ended = useRef(false);
  const edits = useRef(0);
  const track = useRef<LevelTrack>({ id: item.id, helpStep: 0, adultHelped: false });
  const stats = useRef<LevelStats>((() => {
    const now = Date.now();
    return { level_id: item.id, startedAt: now, runs: 0, fails: 0, wins: 0, lastResult: null, helpStep: 0, adultHelped: false, won: false, lastInputAt: now };
  })());
  const predict = item.format === 'predict';

  const log = (type: string, payload: Record<string, unknown>) => apiRef.current.log(type, payload);

  useEffect(() => {
    let off = false;
    document.fonts?.ready.then(() => { if (!off) { resetMeasure(); setFonts((f) => f + 1); } });
    return () => { off = true; };
  }, []);
  const names = project.sprites.map((s) => `${s.id}:${s.name}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => layoutCtx((kind, v) => menuLabel(projectRef.current, kind, v)), [names, fonts]);

  // ---------------------------------------------------------------- the page's life

  const end = (outcome: LevelOutcome, notify = true, reason?: string) => {
    if (ended.current) return;
    ended.current = true;
    stage.current?.stop();
    const s = stats.current;
    const payload: LevelEnd = {
      level_id: item.id, activity: 'ladder', outcome, time_ms: Date.now() - s.startedAt, attempts: s.runs, help_levels: s.helpStep,
      blocks_optimal: 0, adult_helped: track.current.adultHelped, edits: edits.current,
      ...(reason ? { end_reason: reason } : {}),
      ...props.current.extra,
    };
    log('level_end', payload);
    apiRef.current.lowerHand('moved_on', item.id);
    if (apiRef.current.level.current === track.current) apiRef.current.level.current = null;
    if (notify) props.current.onEnd(payload);
  };
  const endRef = useRef(end);
  endRef.current = end;

  const check = () => {
    if (ended.current) return;
    const s = stats.current;
    s.adultHelped = track.current.adultHelped;
    const v = props.current.watch?.(s);
    if (!v) return;
    if (typeof v === 'string') end(v); else end(v.outcome, true, v.reason);
  };

  useEffect(() => {
    const a = apiRef.current;
    a.level.current = track.current;
    log('level_start', { level_id: item.id, activity: 'ladder', format: item.format, engine: 'vm', ...props.current.extra });
    a.did('ladder');
    speak(item.goal);
    return () => endRef.current(stats.current.won ? 'win' : 'skipped', false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!props.current.watch) return;
    const id = setInterval(check, WATCH_TICK_MS);
    const onShow = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onShow); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const on = (e: Event) => { if (e.isTrusted) stats.current.lastInputAt = Date.now(); };
    window.addEventListener('pointerdown', on, true);
    window.addEventListener('keydown', on, true);
    return () => { window.removeEventListener('pointerdown', on, true); window.removeEventListener('keydown', on, true); };
  }, []);

  // the first-time wordless demo of the format (the gesture, never the answer)
  useEffect(() => {
    const kind = demoKind(item);
    const sid = apiRef.current.session?.id ?? '';
    if (!kind || !rootRef.current) return;
    const seen = demoed.get(sid) ?? new Set<string>();
    demoed.set(sid, seen);
    if (seen.has(kind)) return;
    seen.add(kind);
    const root = rootRef.current;
    let run: ReturnType<typeof playGhost> | null = null;
    // any real input stops it (as the level pages' ghost)
    const stop = (e: Event) => { if (e.isTrusted) run?.cancel(); };
    const t = window.setTimeout(() => {
      run = playGhost(root, kind === 'predict'
        ? [{ do: 'point', at: ['.pp-vm-spot'] }, { do: 'wait', ms: 500 }]
        : [{ do: 'drag', from: '.ws-pal-item[data-op="show"]', to: '.ws-paper' }, { do: 'point', at: ['.ws-go'] }], { pace: 0.9 });
      log('ghost_demo', { level_id: item.id, kind: 'intro' });
    }, 1400);
    window.addEventListener('pointerdown', stop, true);
    window.addEventListener('keydown', stop, true);
    return () => { clearTimeout(t); run?.cancel(); window.removeEventListener('pointerdown', stop, true); window.removeEventListener('keydown', stop, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pass = () => {
    const s = stats.current;
    s.won = true;
    s.wins++;
    setWon(true);
    apiRef.current.lowerHand('self', item.id);
    progress.update((p) => solve(p, item.id));
    speak('¡Muy bien!');
    window.setTimeout(() => endRef.current('win'), autoNextMs);
  };

  const record = (result: 'win' | 'fail' | 'look', o: Record<string, unknown> = {}) => {
    const s = stats.current;
    s.runs++;
    s.lastResult = result;
    if (result === 'fail') s.fails++;
    log('run', {
      level_id: item.id, result, attempt: s.runs, help_step: s.helpStep, edits: edits.current,
      program: scriptsText(projectRef.current).slice(0, 2000), ...o,
    });
    check();
  };

  // ---------------------------------------------------------------- edit items: ▶ is checked

  const pending = useRef<{ timer: number; res: VmCheck; look: boolean } | null>(null);
  const resolve = useCallback(() => {
    const r = pending.current;
    if (!r) return;
    pending.current = null;
    clearTimeout(r.timer);
    if (ended.current || stats.current.won) return;
    if (r.res.ok) { record('win'); pass(); return; }
    setWhy(r.res.why ?? null);
    record(r.look ? 'look' : 'fail', { why: r.res.why });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onStart = () => {
    if (predict || ended.current || stats.current.won) return;
    stopSpeaking();
    setWhy(null);
    const p = projectRef.current;
    const res = checkVm(item, p);
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = { timer: window.setTimeout(resolve, CHECK_AFTER_MS), res, look: !res.ok && scriptsText(p) === givenText };
  };

  const onEdit = useCallback((p: Project, _e: EditInfo) => {
    edits.current++;
    setProject(p);
    setWhy(null);
  }, []);

  // ---------------------------------------------------------------- predict items: one tap, then it runs

  const choose = (k: number) => {
    if (!predict || guess != null || ended.current) return;
    setGuess(k);
    const right = nearestSpot(item.predict!.spots, predictEnd(item, projectRef.current));
    const st = stage.current;
    st?.start();
    item.predict!.keys.forEach((key, i) => window.setTimeout(() => stage.current?.press(key), (PRESS_FROM + i * PRESS_EVERY) * FRAME_MS));
    const runMs = (PRESS_FROM + item.predict!.keys.length * PRESS_EVERY + 10) * FRAME_MS;
    window.setTimeout(() => {
      stage.current?.stop();
      setAnswer(right);
      const ok = k === right;
      record(ok ? 'win' : 'fail', { guess: k, answer: right });
      if (ok) pass();
      else window.setTimeout(() => endRef.current('fail', true, 'runs'), REVEAL_MS);
    }, runMs);
  };

  // ---------------------------------------------------------------- help

  const onHelp = () => {
    const s = stats.current;
    if (s.won || ended.current) return;
    if (s.helpStep >= 3) { apiRef.current.raiseHand('help_step_3'); return; }
    const step = s.helpStep + 1;
    s.helpStep = step;
    track.current.helpStep = step;
    setHelp(step);
    log('help', { level_id: item.id, step });
    if (step === 1) speak(item.goal);
    else if (step >= 2 && (predict || step === 3)) speak(item.hint);
    check();
  };

  // ---------------------------------------------------------------- the demo bar and the checks' hooks

  const solveNow = () => {
    if (predict) { choose(nearestSpot(item.predict!.spots, predictEnd(item, projectRef.current))); return; }
    setProject(item.solve(projectRef.current));
    window.setTimeout(() => stage.current?.start(), 300);
  };
  const solveRef = useRef(solveNow);
  solveRef.current = solveNow;
  useEffect(() => provideDemoActions({ rank: 2, noun: 'nivel', skip: () => endRef.current(stats.current.won ? 'win' : 'skipped'), solve: () => solveRef.current() }), []);
  const guessRef = useRef(choose);
  guessRef.current = choose;
  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __ladderVm?: unknown }).__ladderVm = {
      item: () => item.id,
      format: () => item.format,
      state: () => ({ id: item.id, won: stats.current.won, runs: stats.current.runs, fails: stats.current.fails, why, guess, answer, ended: ended.current }),
      project: () => projectRef.current,
      /** Checks: the item's own solution put in place and ▶ (or the right place tapped). */
      solve: () => solveRef.current(),
      /** Checks: a predict answer (the index of a place). */
      guess: (k: number) => guessRef.current(k),
      /** Checks: the right place of a predict item. */
      answer: () => (predict ? nearestSpot(item.predict!.spots, predictEnd(item, projectRef.current)) : null),
      /** Checks: ▶ on the project as it is (a real try). */
      run: () => stage.current?.start(),
      /** Checks: put a project in place (e.g. a wrong attempt). */
      setProject: (p: Project) => setProject(p),
    };
    return () => { delete (window as unknown as { __ladderVm?: unknown }).__ladderVm; };
  });

  // ---------------------------------------------------------------- drawing

  // the floor is scenery here; the stage last (as in the Workshop)
  const spritesShown = [...project.sprites.filter((s) => s.kind !== 'floor' && s.kind !== 'stage'), ...project.sprites.filter((s) => s.kind === 'stage')];
  const goal = (
    <section className={`pp-vm-goal sheet${help === 1 ? ' is-glow' : ''}`}>
      <p className="pp-vm-goal-text">{item.goal}</p>
      {predict && help >= 2 && <p className="pp-vm-hint">{item.hint}</p>}
      {predict && won && <p className="pp-vm-won">¡Muy bien!</p>}
    </section>
  );
  // edit items: what the check saw, the hint, the pass, right above the paper
  const feedback = (
    <div className="pp-vm-head" aria-live="polite">
      {help >= 3 && <p className="pp-vm-hint">{item.hint}</p>}
      {why && !won && <p className="pp-vm-why" data-why>{why}</p>}
      {won && <p className="pp-vm-won">¡Muy bien!</p>}
    </div>
  );

  return (
    <main ref={rootRef} className={`pp-page ws-page pp-vm is-${item.format}`} data-item={item.id} data-format={item.format} data-won={won || undefined}>
      <Bar
        instruction={<span className="drawn-task" aria-hidden="true"><PlayerFace className="bar-face" /><ThenArrow /><svg viewBox="0 0 26 26" width="34" height="34"><FlagGlyph /></svg></span>}
        title={<b>{item.title}</b>}
        pages={null}
        aside={<SeedPouch />}
        onSpeak={() => speak(item.goal)}
        onHelp={onHelp}
      />
      {goal}
      <div className="ws-main pp-vm-main">
        <div className="ws-left">
          {predict ? (
            <div className="pp-vm-scripts sheet" aria-label="Los programas del Personaje">
              {project.sprites.flatMap((s) => s.stacks.map((st) => (
                <div key={st.id} className="pp-vm-script">
                  <span className="pp-vm-script-who"><SpriteThumb kind={s.kind} costume={s.costume} /> {s.name}</span>
                  <BlockPicture blocks={st.blocks} ctx={ctx} scale={1.35} />
                </div>
              )))}
            </div>
          ) : (
            <Editor
              project={project} spriteId={sel} ctx={ctx} onChange={onEdit}
              paletteGlow={help >= 2 ? item.highlight : null}
              disabled={won}
              header={feedback}
            />
          )}
        </div>
        <aside className="ws-right pp-vm-right">
          <div className="pp-vm-stage">
            <Stage ref={stage} project={project} monitors={item.monitors} keyboard={!predict} overlays={!predict} controls={!predict} className="ws-main-stage" onStart={onStart} onEnd={() => resolve()} />
            {predict && (
              <svg className="pp-vm-spots" viewBox="-240 -180 480 360" preserveAspectRatio="xMidYMid meet" aria-label="Lugares">
                {item.predict!.spots.map((p, k) => (
                  <g
                    key={k} className={`pp-vm-spot${guess === k ? ' is-guess' : ''}${answer === k ? ' is-answer' : ''}`} data-spot={k}
                    transform={`translate(${p.x} ${-p.y})`} onClick={() => choose(k)} role="button" aria-label={`Lugar ${k + 1}`}
                  >
                    <circle r={30} className="pp-vm-spot-hit" />
                    <circle r={24} className="pp-vm-spot-ring" />
                  </g>
                ))}
              </svg>
            )}
          </div>
          {!predict && (
            <section className="ws-sprites" aria-label="Objetos">
              <ul className="ws-sprite-grid">
                {spritesShown.map((s) => (
                  <li key={s.id}>
                    <button type="button" className={`ws-sprite cut${sel === s.id ? ' is-sel' : ''}`} data-sprite={s.id} data-kind={s.kind} onClick={() => setSel(s.id)} aria-pressed={sel === s.id}>
                      <SpriteThumb kind={s.kind} costume={s.costume} />
                      <span className="ws-sprite-name">{s.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
