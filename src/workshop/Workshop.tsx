// The Game Workshop (T40): a small Scratch inside Camino, the heart of 4to's
// class. The child builds an original game, "Al revés", through PRIMM
// challenges (challenges.ts), with Scratch's Spanish blocks on a free
// workspace (Editor.tsx), the game always playable on the stage (Stage.tsx)
// and the sprites listed under it.
//
// Every challenge opens with its goal large inside the screen (a card over
// the editor, with the expected behaviour looping in a small stage); then
// the goal stays in a note above the workspace. Challenge 1 asks a predict
// question before running, challenge 2 an investigate question (tap the
// block to blame). Every ▶ in the make phase is checked from the game's
// behaviour (never against one exact script); a pass is celebrated and the
// next challenge opens. Help is graded and never gives the answer: a hint
// line, then the blocks glow in the palette, then a similar worked example
// on a side card; a fourth ✋ raises the character's hand. After six
// minutes on a challenge (or after the example) it can be skipped (its
// canonical solution is put in place so the game keeps working).
//
// Progress: the strip of stars in the bar (always visible), the game on the
// stage, a short celebration per challenge, "¡Tu juego ya está en el
// Arcade!" after challenge 5, then six optional free challenges with their
// own stars. Everything survives a reload (store.ts).
//
// Entry points (T39, T41): `Workshop` (a flow step or a free-play activity:
// grade, initial save, onProgress, onDone), `WorkshopActivity` (free play's
// card), `WorkshopGamePlayer` (WorkshopGamePlayer.tsx: the Arcade's "Tu
// juego"), `loadWorkshop` (store.ts).
//
// Logged (docs/prueba-piloto-datos.md): `workshop_challenge` (start,
// predict, investigate, solved, skipped), `workshop_edit` (batched counts),
// `workshop_run`, `workshop_end`, and `help` with `level_id: 'workshop'`.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { progress as sessionProgress, solve } from '../curriculum/progress';
import { Bar } from '../screens/LevelBar';
import { DEBUG } from '../screens/levelKit';
import { PlayerFace } from '../screens/player';
import { SeedPouch } from '../screens/yearKit';
import { ThenArrow } from '../ui/art';
import { speak, stopSpeaking } from '../ui/speech';
import { usePlaytest } from '../playtest/context';
import { provideDemoActions } from '../playtest/demo';
import type { VarName } from './blocks';
import { BlockPicture, FlagGlyph, layoutCtx, resetMeasure } from './BlockSvg';
import { ARCADE_AFTER, challenge, FREE, INVESTIGATE, PREDICT, scriptsKey, type Challenge } from './challenges';
import { Editor, type EditInfo } from './Editor';
import { ENTER, newProject, runScript, LANE, solvedUpTo, SOLVE, SPRITE_IDS } from './game';
import { menuLabel } from './menus';
import { allBlocks, duplicateSprite, make, spriteById, type Project, type Sprite } from './model';
import {
  challengePayload, coreDone, EditBatch, endPayload, finishCurrent, freeCount, initialProgress, LAST_CORE, solvedCount, solveFree, stripOf, withRec, type WsProgress,
} from './progress';
import { Stage, type RunResult, type StageHandle } from './Stage';
import { SpriteThumb } from './art';
import { loadWorkshop, saveWorkshop, type WorkshopSaved } from './store';
import { IconBigger, IconBulb, IconDup, IconEye, IconSound, IconStar } from './icons';
import type { VM } from './vm';
import './workshop.css';

/** What the Workshop tells its host (T39's route, free play, T41's Arcade). */
export interface WorkshopInfo { current: number; solved: number; coreDone: boolean; arcade: boolean; free: number; best: number }

export interface WorkshopProps {
  grade: number;
  /** A save to open (default: this session's own, from device storage). */
  initial?: WorkshopSaved | null;
  onProgress?(info: WorkshopInfo): void;
  /** Offered as "Terminé" once the core challenges are done (a flow step moves on). */
  onDone?(): void;
}

const SKIP_AFTER_MS = 6 * 60_000;
const CHECK_AFTER_MS = 2500;
const EDIT_FLUSH_MS = 60_000;
const LEVEL_ID = 'workshop';

/** The variables shown on the stage by challenge (Scratch's monitors). */
const monitorsFor = (n: number): VarName[] => (n >= 6 ? ['vidas', 'puntos', 'velocidad'] : n >= 5 ? ['vidas', 'puntos'] : n >= 4 ? ['vidas'] : []);
/** Which sprite a challenge's moment is about (selected when it opens). */
const focusOf = (c: Challenge, phase: WsProgress['phase']) => (c.n === 1 && phase !== 'make' ? SPRITE_IDS.log : c.focus);

const PHASE_HINT = {
  1: 'Leé el bloque «si»: ¿qué hace cuando la posición en x es menor que -240?',
  2: 'Probá tocar espacio dos veces. ¿A qué número va la y? ¿Cambia alguna vez?',
} as Record<number, string>;

export function Workshop({ grade, initial, onProgress, onDone }: WorkshopProps) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const sid = api.session?.id ?? '';
  const [saved] = useState(() => initial ?? loadWorkshop(sid));
  const [project, setProject] = useState<Project>(() => saved?.project ?? newProject());
  const [prog, setProg] = useState<WsProgress>(() => saved?.progress ?? initialProgress(Date.now()));
  const projectRef = useRef(project);
  projectRef.current = project;
  const progRef = useRef(prog);
  progRef.current = prog;
  const core = prog.current <= LAST_CORE ? challenge(prog.current) : null;
  const [sel, setSel] = useState<string>(() => (core ? focusOf(core, prog.phase) : SPRITE_IDS.player));
  const [why, setWhy] = useState<string | null>(null);
  const [party, setParty] = useState<{ n: number; title: string; arcade: boolean; free: number[] } | null>(null);
  const [example, setExample] = useState(false);
  const [freeList, setFreeList] = useState(false);
  const [big, setBig] = useState(false);
  /** "Ver objetivo": the goal card again, without changing the moment. */
  const [peek, setPeek] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [fonts, setFonts] = useState(0);
  const stage = useRef<StageHandle>(null);
  const batch = useRef(new EditBatch());
  const log = (type: string, payload: Record<string, unknown>) => apiRef.current.log(type, payload);

  // the blocks are measured in Andika: once it has loaded, measure again
  useEffect(() => {
    let off = false;
    document.fonts?.ready.then(() => { if (!off) { resetMeasure(); setFonts((f) => f + 1); } });
    return () => { off = true; };
  }, []);
  const names = project.sprites.map((s) => `${s.id}:${s.name}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => layoutCtx((kind, v) => menuLabel(projectRef.current, kind, v)), [names, fonts]);

  // ---------------------------------------------------------------- saving and telemetry

  useEffect(() => {
    if (!sid) return;
    const t = window.setTimeout(() => saveWorkshop({ sid, project, progress: prog }), 250);
    return () => clearTimeout(t);
  }, [sid, project, prog]);

  const info = (p: WsProgress): WorkshopInfo => ({ current: p.current, solved: solvedCount(p), coreDone: coreDone(p), arcade: p.arcade, free: freeCount(p), best: p.best });
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  useEffect(() => { onProgressRef.current?.(info(prog)); }, [prog.current, prog.arcade, freeCount(prog), prog.best]); // eslint-disable-line react-hooks/exhaustive-deps

  const flushEdits = (n = progRef.current.current) => {
    const p = batch.current.take(n);
    if (p) log('workshop_edit', p);
  };
  useEffect(() => {
    const id = window.setInterval(() => flushEdits(), EDIT_FLUSH_MS);
    return () => {
      clearInterval(id);
      flushEdits();
      log('workshop_end', endPayload(progRef.current, Date.now()));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a challenge opening: its given scripts, its sprite, its `start` (once, even across reloads)
  useEffect(() => {
    const n = prog.current;
    const c = challenge(n);
    if (n <= LAST_CORE && ENTER[n]) setProject((p) => ENTER[n](p));
    if (c && n <= LAST_CORE) setSel(focusOf(c, prog.phase));
    if (n <= LAST_CORE && !prog.recs[n]?.logged) {
      const q = withRec(prog, n, (r) => ({ ...r, logged: true }));
      setProg(q);
      log('workshop_challenge', challengePayload(q, n, 'start', Date.now()));
    }
    if (n > LAST_CORE) setFreeList(true);
    setWhy(null);
    setExample(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prog.current]);

  // ---------------------------------------------------------------- editing

  const onEdit = useCallback((p: Project, e: EditInfo) => {
    setProject(p);
    batch.current.add(e, spriteById(p, e.sprite)?.name ?? e.sprite);
  }, []);

  const duplicate = (id: string) => {
    const d = duplicateSprite(projectRef.current, id);
    if (!d) return;
    setProject(d.project);
    setSel(d.sprite.id);
    batch.current.add({ action: 'duplicate', op: 'flag', sprite: d.sprite.id, stack_size: d.sprite.stacks.reduce((n, s) => n + [...allBlocks(s.blocks)].length, 0) }, d.sprite.name);
  };

  // ---------------------------------------------------------------- the challenge's moments

  const finish = (how: 'solved' | 'skipped') => {
    const p = progRef.current;
    const n = p.current;
    flushEdits(n);
    const q = finishCurrent(p, how, Date.now(), n === LAST_CORE ? scriptsKey(projectRef.current) : null);
    log('workshop_challenge', challengePayload(q, n, how, Date.now()));
    setProg(q);
    if (how === 'solved') {
      sessionProgress.update((s) => solve(s, `workshop-${n}`));
      setParty({ n, title: challenge(n)?.title ?? '', arcade: n === ARCADE_AFTER, free: [] });
    }
    setWhy(null);
  };
  const skip = () => {
    const n = progRef.current.current;
    const fix = SOLVE[n];
    if (!fix) return;
    stage.current?.stop();
    setProject((p) => fix(ENTER[n] ? ENTER[n](p) : p));
    finish('skipped');
  };

  const choosePredict = (choice: string) => {
    const correct = choice === PREDICT.right;
    const q = { ...withRec(progRef.current, 1, (r) => ({ ...r, predict: { choice, correct } })), phase: 'run' as const };
    setProg(q);
    log('workshop_challenge', challengePayload(q, 1, 'predict', Date.now()));
    setSel(SPRITE_IDS.log);
  };
  const revealed = useRef(false);
  const reveal = () => {
    if (progRef.current.phase !== 'run' || revealed.current) return;
    revealed.current = true;
    setProg((p) => ({ ...p, phase: 'reveal' }));
  };
  const pickBlock = (_id: string, op: string) => {
    if (progRef.current.phase !== 'investigate') return;
    const correct = op === INVESTIGATE.right;
    const q = { ...withRec(progRef.current, 2, (r) => ({ ...r, investigate: { op, correct } })), phase: 'reveal' as const };
    setProg(q);
    log('workshop_challenge', challengePayload(q, 2, 'investigate', Date.now()));
  };
  const toMake = () => {
    revealed.current = false;
    setProg((p) => ({ ...p, phase: 'make' }));
    const c = challenge(progRef.current.current);
    if (c) setSel(c.focus);
  };

  // ---------------------------------------------------------------- help

  const onHelp = () => {
    const p = progRef.current;
    const n = p.phase === 'free' ? p.focus : p.current;
    if (!n) { setFreeList(true); return; }
    const r = p.recs[n];
    const step = (r?.help ?? 0) + 1;
    if (step > 3) { apiRef.current.raiseHand('help_step_3'); return; }
    setProg(withRec(p, n, (x) => ({ ...x, help: step })));
    log('help', { level_id: LEVEL_ID, step, n });
    if (step === 3) setExample(true);
    const c = challenge(n);
    if (c && step === 1) speak(p.phase === 'card' || p.phase === 'run' || p.phase === 'investigate' ? PHASE_HINT[n] ?? c.hint : c.hint);
  };

  // ---------------------------------------------------------------- runs

  const run = useRef<{ n: number; at: number; check: ReturnType<Challenge['check']> | null; free: number[]; done: boolean; timer: number; lastLogX: number | null } | null>(null);
  const resolveRun = () => {
    const r = run.current;
    if (!r || r.done) return;
    r.done = true;
    clearTimeout(r.timer);
    const p = progRef.current;
    if (r.check && p.current === r.n && p.phase === 'make') {
      if (r.check.ok) finish('solved');
      else { setProg(withRec(p, r.n, (x) => ({ ...x, attempts: x.attempts + 1 }))); setWhy(r.check.why ?? null); }
    }
    if (r.free.length) {
      let q = progRef.current;
      for (const n of r.free) {
        q = solveFree(q, n);
        q = withRec(q, n, (x) => ({ ...x, solved: true, ms: Date.now() - (x.startedAt || p.startedAt) }));
        log('workshop_challenge', challengePayload(q, n, 'solved', Date.now()));
        sessionProgress.update((s) => solve(s, `workshop-${n}`));
      }
      setProg(q);
      setParty({ n: r.free[0], title: r.free.map((n) => challenge(n)?.title).join(' · '), arcade: false, free: r.free });
    }
  };
  const onStart = () => {
    const p = progRef.current;
    stopSpeaking();
    setWhy(null);
    const n = p.phase === 'free' ? (p.focus ?? LAST_CORE + 1) : p.current;
    if (p.phase !== 'free') setProg(withRec(p, n, (x) => ({ ...x, runs: x.runs + 1 })));
    const check = p.phase === 'make' && core ? challenge(p.current)!.check(projectRef.current) : null;
    const free = p.phase === 'free' ? FREE.filter((c) => !p.free[c.n] && c.check(projectRef.current, { baseline: p.baseline ?? undefined }).ok).map((c) => c.n) : [];
    const timer = window.setTimeout(resolveRun, CHECK_AFTER_MS);
    if (run.current) clearTimeout(run.current.timer);
    run.current = { n: p.current, at: Date.now(), check, free, done: false, timer, lastLogX: null };
    // challenge 1's run shows what was predicted
    if (p.phase === 'run') window.setTimeout(reveal, 6000);
  };
  const onEnd = (r: RunResult) => {
    const cur = run.current;
    log('workshop_run', {
      n: cur?.n ?? progRef.current.current, ms_played: r.ms, result: r.result, lives: r.vars.vidas, points: r.vars.puntos,
      check: cur?.check ? (cur.check.ok ? 'pass' : 'fail') : 'none', ...(cur?.check && !cur.check.ok ? { why: cur.check.why } : {}),
    });
    if (r.vars.puntos > progRef.current.best) setProg((p) => ({ ...p, best: r.vars.puntos }));
    if (progRef.current.phase === 'run' && r.ms > 1500) reveal();
    resolveRun();
  };
  const onStep = (vm: VM) => {
    const r = run.current;
    if (!r || progRef.current.phase !== 'run') return;
    const log0 = vm.sprite(SPRITE_IDS.log);
    if (!log0) return;
    if (r.lastLogX !== null && log0.x - r.lastLogX > 150) window.setTimeout(reveal, 700);
    r.lastLogX = log0.x;
  };

  // space is the game's key: it never presses a button that kept the focus (a kid flipping with the game stopped would skip a challenge)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== ' ') return;
      const t = e.target as HTMLElement | null;
      if (t?.tagName === 'BUTTON' && t.closest('.ws-page') && !t.closest('.ws-pop')) {
        e.preventDefault();
        t.blur();
      }
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, []);
  // a slow clock, so "Saltear" appears after its six minutes without anything else changing
  const [, setTick] = useState(0);
  useEffect(() => { const id = window.setInterval(() => setTick((t) => t + 1), 30_000); return () => clearInterval(id); }, []);

  // ---------------------------------------------------------------- the demo bar and the checks' hooks

  const demoRef = useRef({ skip, solve: () => {} });
  demoRef.current = { skip, solve: () => { const n = progRef.current.current; if (SOLVE[n]) setProject((p) => SOLVE[n](ENTER[n] ? ENTER[n](p) : p)); } };
  useEffect(() => provideDemoActions({ rank: 2, noun: 'desafío', skip: () => demoRef.current.skip(), solve: () => demoRef.current.solve() }), []);
  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __workshop?: unknown }).__workshop = {
      state: () => ({ current: progRef.current.current, phase: progRef.current.phase, recs: progRef.current.recs, free: progRef.current.free, arcade: progRef.current.arcade, best: progRef.current.best, sel, why }),
      project: () => projectRef.current,
      solve: () => demoRef.current.solve(),
      running: () => stage.current?.running() ?? false,
      stop: () => stage.current?.stop(),
      press: (k: string) => stage.current?.press(k),
      /** Checks only: variables set in the running game (e.g. 19 points, to win with the next real seed). */
      poke: (v: Partial<Record<VarName, number>>) => stage.current?.poke(v),
    };
    return () => { delete (window as unknown as { __workshop?: unknown }).__workshop; };
  });

  // ---------------------------------------------------------------- drawing

  const n = prog.current;
  const rec = prog.recs[n];
  const free = prog.phase === 'free';
  const focusC = free && prog.focus ? challenge(prog.focus) : core;
  const help = focusC ? prog.recs[focusC.n]?.help ?? 0 : 0;
  const glowPalette = help >= 2 && focusC ? focusC.highlight : null;
  const wsGlow = useMemo(() => {
    if (prog.phase === 'reveal' && n === 2) {
      const pl = spriteById(project, SPRITE_IDS.player);
      const ids = new Set<string>();
      pl?.stacks.forEach((st) => { for (const b of allBlocks(st.blocks)) if (b.op === INVESTIGATE.right) ids.add(b.id); });
      return ids;
    }
    return undefined;
  }, [prog.phase, n, project]);
  const longOnIt = rec ? Date.now() - rec.startedAt > SKIP_AFTER_MS : false;
  const canSkip = !free && prog.phase === 'make' && (help >= 3 || longOnIt);
  const monitors = monitorsFor(free ? 7 : n);
  const cardOpen = !free && (prog.phase === 'card' || prog.phase === 'reveal' || peek) && !party;
  const overlay = cardOpen || party || (free && freeList);

  const note = (
    <GoalNote
      c={focusC} n={n} prog={prog} help={help} why={why} canSkip={canSkip}
      onHint={onHelp} onShow={() => (free ? setFreeList(true) : setPeek(true))} onSkip={skip}
      onExample={() => setExample(true)} onDone={coreDone(prog) ? onDone : undefined}
    />
  );

  return (
    <main className="pp-page ws-page" data-challenge={n} data-phase={prog.phase} data-grade={grade}>
      <Bar
        instruction={<span className="drawn-task" aria-hidden="true"><PlayerFace className="bar-face" /><ThenArrow /><svg viewBox="0 0 26 26" width="34" height="34"><FlagGlyph /></svg></span>}
        title={<><b>El taller de juegos</b>{free ? `desafíos libres · ${freeCount(prog)} de ${FREE.length}` : `desafío ${n} de ${LAST_CORE}`}</>}
        pages={<Strip prog={prog} onFree={() => setFreeList(true)} />}
        aside={<SeedPouch />}
        onSpeak={() => speak(focusC ? focusC.goal : 'Desafíos libres: elegí el que quieras.')}
        onHelp={onHelp}
      />
      <div className="ws-main">
        <div className="ws-left">
          <Editor
            project={project} spriteId={sel} ctx={ctx} onChange={onEdit} paletteGlow={glowPalette} wsGlow={wsGlow}
            investigate={prog.phase === 'investigate' ? pickBlock : null}
            spriteAt={(x, y) => spriteCardAt(x, y)} onSpriteHover={setHover}
            disabled={!!overlay}
            header={prog.phase === 'investigate' ? <InvestigateBanner help={help} /> : note}
          />
          {example && focusC && <ExampleCard c={focusC} ctx={ctx} close={() => setExample(false)} />}
          {cardOpen && core && peek && <GoalCard c={core} prog={prog} ctx={ctx} project={project} help={help} asking={false} onPredict={choosePredict} onGo={() => setPeek(false)} />}
          {cardOpen && core && !peek && prog.phase === 'card' && (
            <GoalCard c={core} prog={prog} ctx={ctx} project={project} help={help} asking
              onPredict={choosePredict} onGo={() => (n === 2 ? setProg((p) => ({ ...p, phase: 'investigate' })) : toMake())}
            />
          )}
          {cardOpen && core && !peek && prog.phase === 'reveal' && <RevealCard n={n} prog={prog} onGo={toMake} />}
          {party && <Party party={party} onDone={() => setParty(null)} />}
          {free && freeList && !party && (
            <FreeList prog={prog} onPick={(k) => { setProg((p) => ({ ...p, focus: k })); setFreeList(false); const c = challenge(k); if (c) setSel(c.focus); }} close={() => setFreeList(false)} onDone={onDone} />
          )}
        </div>
        <aside className={`ws-right${big ? ' is-big' : ''}`}>
          {big && <div className="ws-big-back" onClick={() => setBig(false)} />}
          <Stage
            ref={stage} project={project} monitors={monitors} keyboard overlays controls className="ws-main-stage"
            onStart={onStart} onEnd={onEnd} onStep={onStep}
            extra={<button type="button" className="ws-bigger cut" onClick={() => setBig((b) => !b)} aria-label={big ? 'Achicar' : 'Agrandar'} data-act="big"><IconBigger big={big} /></button>}
          />
          <SpriteList project={project} sel={sel} hover={hover} onSelect={setSel} onDuplicate={duplicate} highlight={focusC && !overlay ? focusC.focus : null} />
        </aside>
      </div>
    </main>
  );
}

/** Which sprite card is under a point (a script dropped on it is copied there). */
function spriteCardAt(x: number, y: number): string | null {
  for (const el of document.querySelectorAll<HTMLElement>('.ws-sprite[data-sprite]')) {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el.getAttribute('data-sprite');
  }
  return null;
}

// ------------------------------------------------------------------ the strip of stars (the bar)

function Star({ state, n }: { state: 'solved' | 'skipped' | 'here' | 'todo'; n: number }) {
  return (
    <span className={`ws-star-slot is-${state}`} data-n={n} title={`Desafío ${n}`}>
      <svg viewBox="-14 -14 28 28" width="30" height="30" aria-hidden="true">
        <path d="M0,-12 L3.5,-4 L12,-3.5 L5.5,2.5 L7.5,11 L0,6.5 L-7.5,11 L-5.5,2.5 L-12,-3.5 L-3.5,-4 Z" className="ws-star-shape" />
      </svg>
      <b>{n}</b>
    </span>
  );
}
function Strip({ prog, onFree }: { prog: WsProgress; onFree(): void }) {
  const strip = stripOf(prog);
  return (
    <span className="pp-progress ws-strip" role="img" aria-label={`${solvedCount(prog)} de ${LAST_CORE} desafíos`} data-solved={solvedCount(prog)}>
      {strip.map((s) => <Star key={s.n} n={s.n} state={s.state} />)}
      <button type="button" className={`ws-free-pill cut${prog.phase === 'free' ? ' is-open' : ''}`} onClick={onFree} disabled={prog.phase !== 'free'} aria-label="Desafíos libres">
        {freeCount(prog)}/{FREE.length} libres
      </button>
    </span>
  );
}

// ------------------------------------------------------------------ the goal, in the screen

function GoalNote({ c, n, prog, help, why, canSkip, onHint, onShow, onSkip, onExample, onDone }: {
  c: Challenge | null; n: number; prog: WsProgress; help: number; why: string | null; canSkip: boolean;
  onHint(): void; onShow(): void; onSkip(): void; onExample(): void; onDone?: () => void;
}) {
  const free = prog.phase === 'free';
  let line: ReactNode = c?.goal;
  if (!free && prog.phase === 'run') line = <>Ahora tocá la bandera verde <span className="ws-flag-inline"><svg viewBox="0 0 26 26" width="22" height="22"><FlagGlyph /></svg></span> para ver si tenías razón.</>;
  if (free && !c) line = 'Elegí un desafío libre (o inventá el tuyo) y probalo con la bandera verde.';
  return (
    <div className={`ws-note cut${why ? ' has-why' : ''}`} data-note={free ? 'free' : prog.phase}>
      <span className="ws-note-n" aria-hidden="true">{free ? '+' : n}</span>
      <div className="ws-note-text">
        <b className="ws-note-title">{c ? c.title : 'Desafíos libres'}</b>
        <span className="ws-note-goal">{line}</span>
        {help >= 1 && c && <span className="ws-note-hint"><IconBulb /> {prog.phase === 'run' ? PHASE_HINT[n] ?? c.hint : c.hint}</span>}
        {why && <span className="ws-note-why" role="status">Casi: {why}</span>}
      </div>
      <div className="ws-note-acts">
        <button type="button" className="ws-mini cut" onClick={onHint} data-act="hint"><IconBulb /> Pista</button>
        {help >= 3 && <button type="button" className="ws-mini cut" onClick={onExample} data-act="example">Ejemplo</button>}
        <button type="button" className="ws-mini cut" onClick={onShow} data-act="show"><IconEye /> {free ? 'Lista' : 'Objetivo'}</button>
        {canSkip && <button type="button" className="ws-mini ws-skip cut" onClick={onSkip} data-act="skip">Saltear</button>}
        {free && onDone && <button type="button" className="ws-mini ws-done cut" onClick={onDone} data-act="done">Terminé</button>}
      </div>
    </div>
  );
}

function InvestigateBanner({ help }: { help: number }) {
  return (
    <div className="ws-note ws-investigate cut" data-note="investigate">
      <span className="ws-note-n" aria-hidden="true">?</span>
      <div className="ws-note-text">
        <b className="ws-note-title">¿Cuál tiene la culpa?</b>
        <span className="ws-note-goal">{INVESTIGATE.question}</span>
        {help >= 1 && <span className="ws-note-hint"><IconBulb /> {PHASE_HINT[2]}</span>}
      </div>
    </div>
  );
}

/** The challenge's big card: its number, title and goal, the expected behaviour looping; challenge 1 asks its predict question here. */
function GoalCard({ c, prog, ctx, project, help, asking, onPredict, onGo }: {
  c: Challenge; prog: WsProgress; ctx: ReturnType<typeof layoutCtx>; project: Project; help: number; asking: boolean; onPredict(choice: string): void; onGo(): void;
}) {
  const preview = useMemo(() => solvedUpTo(c.n), [c.n]);
  const choices = useMemo(predictChoices, []);
  const predicting = asking && c.n === 1 && !prog.recs[1]?.predict;
  const investigating = asking && c.n === 2;
  useEffect(() => { speak(predicting ? PREDICT.question : investigating ? INVESTIGATE.question : `${c.title}. ${c.goal}`); return () => stopSpeaking(); }, [c.n]); // eslint-disable-line react-hooks/exhaustive-deps
  if (predicting) {
    const log = spriteById(project, SPRITE_IDS.log);
    return (
      <section className="ws-card ws-card-predict sheet" data-card="predict" aria-label="Predecí">
        <span className="tape tape-l" aria-hidden="true" />
        <header className="ws-card-head"><span className="ws-card-n">1</span><div><h2>{c.title}</h2><p className="ws-card-goal">{PREDICT.question}</p></div></header>
        <div className="ws-predict">
          <figure className="ws-predict-code">
            <figcaption>El programa del Tronco</figcaption>
            {log?.stacks[0] && <BlockPicture blocks={log.stacks[0].blocks} ctx={ctx} className="ws-code-pic" />}
          </figure>
          <ul className="ws-choices">
            {PREDICT.choices.map((ch) => (
              <li key={ch.id}>
                <button type="button" className="ws-choice cut" data-choice={ch.id} onClick={() => onPredict(ch.id)}>
                  <Stage project={choices[ch.id]} bot={{ loop: 120 }} sound={false} className="ws-mini-stage" label={ch.text} />
                  <span>{ch.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {help >= 1 && <p className="ws-card-hint"><IconBulb /> {PHASE_HINT[1]}</p>}
      </section>
    );
  }
  return (
    <section className="ws-card sheet" data-card={investigating ? 'investigate' : 'goal'} aria-label={c.title}>
      <span className="tape tape-l" aria-hidden="true" />
      <header className="ws-card-head"><span className="ws-card-n">{c.n}</span><div><h2>{c.title}</h2><p className="ws-card-goal">{investigating ? INVESTIGATE.question : c.goal}</p></div></header>
      <div className="ws-card-body">
        <figure className="ws-card-preview">
          <figcaption>Así tiene que funcionar</figcaption>
          <Stage project={preview} monitors={monitorsFor(c.n)} bot={{ every: c.n >= 2 ? 46 : 0, from: 30, loop: c.n === 7 ? 420 : 260 }} overlays={c.n === 7} sound={false} className="ws-preview-stage" label="El objetivo, funcionando" />
        </figure>
        <ul className="ws-card-facts">
          <li><b>Qué practicás</b>{CONCEPT_WORDS[c.concept] ?? ''}</li>
          <li><b>Dónde</b>{c.n === 7 ? 'En el Escenario' : `En el programa de ${c.n === 2 ? 'el Personaje' : c.n === 5 ? 'la Semilla' : c.n === 1 ? 'el Suelo' : 'los troncos'}`}</li>
        </ul>
      </div>
      <button type="button" className="btn btn-play cut ws-card-go" onClick={onGo} data-act="go-card">{!asking ? 'Seguir' : investigating ? 'Buscar el error' : '¡Vamos!'}</button>
    </section>
  );
}

const CONCEPT_WORDS: Record<string, string> = {
  loops_motion: '«por siempre», moverse y volver a empezar',
  events_ifelse: 'eventos y «si … si no»',
  duplicate_modify: 'duplicar y cambiar un programa',
  sensing_variables: '«¿tocando?» y la variable vidas',
  variables: 'la variable puntos',
  variable_expression: 'una variable adentro de una cuenta',
  conditions_variables: 'condiciones con variables',
};

/** Challenge 1's three possible outcomes: the log's given script, the same without its «si», and without its loop. */
function predictChoices(): Record<string, Project> {
  const base = newProject();
  const only = (blocks: ReturnType<typeof runScript>): Project => ({
    ...base,
    sprites: base.sprites.map((s) => (s.id === SPRITE_IDS.log ? { ...s, stacks: [{ id: 'c', x: 0, y: 0, blocks }] } : s.kind === 'player' ? { ...s, visible: false } : s)),
  });
  return {
    wraps: only(runScript(LANE.floor)),
    leaves: only([make('flag'), make('goto', { X: 240, Y: LANE.floor }), make('forever', {}, [[make('changeX', { DX: -6 })]])]),
    still: only([make('flag'), make('goto', { X: 120, Y: LANE.floor })]),
  };
}

function RevealCard({ n, prog, onGo }: { n: number; prog: WsProgress; onGo(): void }) {
  const r = prog.recs[n];
  const ok = n === 1 ? !!r?.predict?.correct : !!r?.investigate?.correct;
  const text = n === 1 ? (ok ? PREDICT.yes : PREDICT.no) : (ok ? INVESTIGATE.yes : INVESTIGATE.no);
  useEffect(() => { speak(text); }, [text]);
  return (
    <section className={`ws-card ws-reveal sheet is-${ok ? 'yes' : 'no'}`} data-card="reveal" data-ok={ok}>
      <span className="tape tape-r" aria-hidden="true" />
      <b className="ws-reveal-stamp">{ok ? '¡Bien!' : 'Mirá…'}</b>
      <p className="ws-reveal-text">{text}</p>
      <p className="ws-card-goal">{challenge(n)?.goal}</p>
      <button type="button" className="btn btn-play cut ws-card-go" onClick={onGo} data-act="go-make">{n === 1 ? '¡A programar el Suelo!' : '¡A arreglarlo!'}</button>
    </section>
  );
}

function ExampleCard({ c, ctx, close }: { c: Challenge; ctx: ReturnType<typeof layoutCtx>; close(): void }) {
  return (
    <aside className="ws-example sheet" data-card="example" aria-label="Un ejemplo parecido">
      <button type="button" className="ws-x" onClick={close} aria-label="Cerrar">×</button>
      <b className="ws-example-title">Un ejemplo parecido (no es la respuesta)</b>
      <p>{c.example.caption}</p>
      <figure>
        <figcaption>{c.example.sprite}</figcaption>
        <BlockPicture blocks={c.example.blocks()} ctx={ctx} className="ws-code-pic" />
      </figure>
    </aside>
  );
}

function Party({ party, onDone }: { party: { n: number; title: string; arcade: boolean; free: number[] }; onDone(): void }) {
  const ms = party.arcade ? 5200 : 2600;
  useEffect(() => {
    speak(party.arcade ? '¡Tu juego ya está en el Arcade!' : '¡Desafío superado!');
    const t = window.setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="ws-party" data-party={party.n} onClick={onDone}>
      <div className="ws-party-card">
        <svg className="ws-party-star" viewBox="-14 -14 28 28" aria-hidden="true"><path d="M0,-12 L3.5,-4 L12,-3.5 L5.5,2.5 L7.5,11 L0,6.5 L-7.5,11 L-5.5,2.5 L-12,-3.5 L-3.5,-4 Z" /></svg>
        <b className="ws-party-title">{party.free.length ? '¡Desafío libre!' : `¡Desafío ${party.n} superado!`}</b>
        <span className="ws-party-sub">{party.title}</span>
        {party.arcade && <span className="ws-party-arcade">¡Tu juego ya está en el Arcade!</span>}
      </div>
    </div>
  );
}

/** Each free challenge's picture: the sprite it is about, drawn like the game. */
const FREE_PIC: Record<number, ReactNode> = {
  8: <SpriteThumb kind="obstacle" costume="pinches" />,
  9: <SpriteThumb kind="bird" costume="pájaro" />,
  10: <SpriteThumb kind="star" costume="estrella" />,
  11: <IconSound />,
  12: <SpriteThumb kind="player" costume="mareado" />,
  13: <IconBulb />,
};

function FreeList({ prog, onPick, close, onDone }: { prog: WsProgress; onPick(n: number): void; close(): void; onDone?: () => void }) {
  return (
    <section className="ws-card ws-free sheet" data-card="free" aria-label="Desafíos libres">
      <span className="tape tape-l" aria-hidden="true" />
      <header className="ws-card-head">
        <span className="ws-card-n">+</span>
        <div>
          <h2>Desafíos libres</h2>
          <p className="ws-card-goal">¡Tu juego ya funciona! Mejoralo como quieras: cada desafío te da una estrella. Probá con la bandera verde.</p>
        </div>
      </header>
      <ul className="ws-free-grid">
        {FREE.map((c) => (
          <li key={c.n}>
            <button type="button" className={`ws-free-item cut${prog.free[c.n] ? ' is-done' : ''}${prog.focus === c.n ? ' is-focus' : ''}`} data-free={c.n} onClick={() => onPick(c.n)}>
              <span className="ws-free-star" aria-hidden="true"><IconStar on={!!prog.free[c.n]} /></span>
              <b>{c.title}</b>
              <span>{c.goal}</span>
              <span className="ws-free-pic" aria-hidden="true">{FREE_PIC[c.n]}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="ws-free-acts">
        <button type="button" className="btn cut" onClick={close} data-act="close-free">Seguir programando</button>
        {onDone && <button type="button" className="btn cut" onClick={onDone} data-act="done">Terminé</button>}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ the sprites

function SpriteList({ project, sel, hover, onSelect, onDuplicate, highlight }: {
  project: Project; sel: string; hover: string | null; onSelect(id: string): void; onDuplicate(id: string): void; highlight: string | null;
}) {
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const press = useRef<{ id: string; t: number } | null>(null);
  const card = (s: Sprite) => (
    <li key={s.id}>
      <div
        role="button" tabIndex={0}
        className={`ws-sprite cut${s.id === sel ? ' is-sel' : ''}${hover === s.id ? ' is-drop' : ''}${!s.visible ? ' is-hidden' : ''}${highlight === s.id && s.id !== sel ? ' is-cue' : ''}`}
        data-sprite={s.id} data-kind={s.kind} aria-pressed={s.id === sel}
        onClick={() => onSelect(s.id)} onKeyDown={(e) => { if (e.key === 'Enter') onSelect(s.id); }}
        onContextMenu={(e) => { e.preventDefault(); if (s.kind === 'obstacle' || s.kind === 'seed' || s.kind === 'bird' || s.kind === 'star') setMenu({ id: s.id, x: e.clientX, y: e.clientY }); }}
        onPointerDown={(e) => { const id = s.id; const x = e.clientX, y = e.clientY; press.current = { id, t: window.setTimeout(() => { if (s.kind === 'obstacle') setMenu({ id, x, y }); }, 650) }; }}
        onPointerUp={() => { if (press.current) clearTimeout(press.current.t); }} onPointerLeave={() => { if (press.current) clearTimeout(press.current.t); }}
      >
        <SpriteThumb kind={s.kind} costume={s.costume} />
        <span className="ws-sprite-name">{s.name}</span>
        {!s.visible && <span className="ws-sprite-tag">escondido</span>}
        {s.kind === 'obstacle' && (
          <button type="button" className="ws-dup" aria-label={`Duplicar ${s.name}`} data-act="dup" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onDuplicate(s.id); }}><IconDup size={22} /></button>
        )}
      </div>
    </li>
  );
  // the stage last, in the same grid (Scratch keeps it apart; here every card must fit under the stage)
  const list = [...project.sprites.filter((s) => s.kind !== 'stage'), ...project.sprites.filter((s) => s.kind === 'stage')];
  return (
    <section className="ws-sprites" aria-label="Objetos">
      <ul className="ws-sprite-grid">{list.map(card)}</ul>
      {menu && (
        <div className="ws-pop-back" onPointerDown={(e) => { if (e.target === e.currentTarget) setMenu(null); }}>
          <div className="ws-pop ws-menu cut" style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 90), width: 200 }}>
            <button type="button" className="ws-opt" data-act="dup-sprite" onClick={() => { onDuplicate(menu.id); setMenu(null); }}><IconDup /> Duplicar</button>
          </div>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ free play's card

/** The Workshop as a free-play activity (probes.ts' shape): finishing the seven challenges counts as a won level. */
export function WorkshopActivity({ activity, levelEnded }: { activity: string; levelEnded(end: import('../playtest/PlaytestLevel').LevelEnd): void; done(): void }) {
  const api = usePlaytest();
  const told = useRef(false);
  const t0 = useRef(Date.now());
  useEffect(() => { api.did('workshop'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Workshop
      grade={api.session?.grade ?? 4}
      onProgress={(i) => {
        if (!i.coreDone || told.current) return;
        told.current = true;
        levelEnded({ level_id: LEVEL_ID, activity, outcome: 'win', time_ms: Date.now() - t0.current, attempts: 0, help_levels: 0, blocks_optimal: 0, adult_helped: false });
      }}
    />
  );
}

