// The Workshop's stage (T40): "Al revés" running on the VM. Scratch's
// green flag (▶) and stop (■) above it, Scratch's variable monitors in its
// corner; the arrow keys and space reach the game while it runs (a tap or
// click on the stage is space, for touch screens). The VM steps at a fixed
// 30 frames a second from requestAnimationFrame with an accumulator (never
// more than 4 steps a paint); positions are interpolated between steps;
// everything per frame is written to the SVG directly (no React render per
// frame).
//
// The game feel lives here, not in the child's scripts: the character runs
// in place (a bob and a lean), a flip is tweened with stretch in the air and
// a squash on landing, a ceiling sprite is drawn upside down, the floor's
// own run scrolls the ceiling and the arches behind (parallax), a lost life
// shakes the screen with a burst, a point throws sparks. The same component
// plays the goal card's looping previews (a scripted player, `bot`) and the
// Arcade's "Tu juego" (WorkshopGamePlayer.tsx).

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import { KEYS, type VarName } from './blocks';
import { BackTile, Burst, BirdArt, FloorTile, ObstacleArt, PlayerArt, SeedArt, SpeedLines, StarArt } from './art';
import { FlagGlyph } from './BlockSvg';
import { COSTUMES } from './game';
import type { Project, SpriteKind } from './model';
import { playSfx } from './sfx';
import { DT, VM, type EndState } from './vm';

export interface RunResult { result: Exclude<EndState, 'running'>; ms: number; frames: number; vars: Record<VarName, number> }
export interface StageHandle { start(): void; stop(): void; running(): boolean; press(key: string): void; poke(v: Partial<Record<VarName, number>>): void }

export interface StageProps {
  project: Project;
  monitors?: readonly VarName[];
  onStart?(): void;
  onEnd?(r: RunResult): void;
  /** After every step of a live run (observations). */
  onStep?(vm: VM): void;
  /** A scripted player that loops (previews): space every `every` frames from `from`; restart after `loop` frames. */
  bot?: { every?: number; from?: number; loop: number };
  className?: string;
  /** The window's keys reach the game while it runs. */
  keyboard?: boolean;
  sound?: boolean;
  /** The ▶ and ■ buttons (and anything extra beside them). */
  controls?: boolean;
  extra?: ReactNode;
  /** The won/lost overlays. */
  overlays?: boolean;
  label?: string;
}

const STEP_MS = DT * 1000;
const FLIP_MS = 170;
const LAND_MS = 120;
const flips = (k: SpriteKind) => k === 'player' || k === 'obstacle';
/** A monitor's label width (Andika bold 13 in stage units). */
const MON_W: Record<string, number> = { vidas: 36, puntos: 46, velocidad: 66, poder: 42 };

interface Look { x: number; y: number; from: number; to: number; t0: number; land: number }
interface Fx { id: number; kind: 'hit' | 'spark'; x: number; y: number }

export const Stage = forwardRef<StageHandle, StageProps>(function Stage(props, ref) {
  const { project } = props;
  const vmRef = useRef<VM | null>(null);
  const [running, setRunning] = useState(false);
  const [end, setEnd] = useState<RunResult | null>(null);
  const [fx, setFx] = useState<Fx[]>([]);
  const propsRef = useRef(props);
  propsRef.current = props;
  const nodes = useRef(new Map<string, { outer: SVGGElement; inner: SVGGElement; costumes: Map<string, SVGGElement>; bubble: SVGGElement | null; text: SVGTextElement | null; rect: SVGRectElement | null }>());
  const looks = useRef(new Map<string, Look>());
  const prev = useRef(new Map<string, { x: number; y: number }>());
  const shown = useRef(new Map<string, { costume: string; visible: boolean; say: string | null }>());
  const rootRef = useRef<HTMLDivElement>(null);
  const ceilRef = useRef<SVGGElement>(null);
  const backRef = useRef<SVGGElement>(null);
  const speedRef = useRef<SVGGElement>(null);
  const monRefs = useRef(new Map<string, SVGTextElement>());
  const startedAt = useRef(0);
  const lastVars = useRef<Record<string, number> | null>(null);
  const fxId = useRef(0);
  const botUp = useRef(false);

  const sprites = useMemo(() => project.sprites.filter((s) => s.kind !== 'stage'), [project]);

  // a fresh VM, not started, shows the project where it starts (and after every edit while stopped)
  const fresh = () => {
    const vm = new VM(propsRef.current.project, (Date.now() % 100_000) + 1);
    vmRef.current = vm;
    prev.current.clear();
    looks.current.clear();
    lastVars.current = { ...vm.vars };
    dirty.current = true;
    return vm;
  };
  /** Something changed while stopped (a new project, the run's end): draw once more. Idle stages draw nothing (the classroom's machines are slow). */
  const dirty = useRef(true);
  useEffect(() => { if (!running) fresh(); }, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    const vm = fresh();
    vm.start();
    startedAt.current = performance.now();
    acc.current = 0;
    last.current = performance.now();
    setEnd(null);
    setRunning(true);
    runningRef.current = true;
    propsRef.current.onStart?.();
  };
  const finish = (vm: VM) => {
    runningRef.current = false;
    dirty.current = true;
    setRunning(false);
    const r: RunResult = { result: vm.state === 'running' ? 'stopped' : vm.state, ms: Math.round(performance.now() - startedAt.current), frames: vm.frame, vars: { ...vm.vars } };
    setEnd(r);
    propsRef.current.onEnd?.(r);
  };
  const stop = () => {
    const vm = vmRef.current;
    if (!vm || !runningRef.current) return;
    vm.stop();
    finish(vm);
  };
  const press = (k: string) => {
    const vm = vmRef.current;
    if (!vm || !runningRef.current) return;
    vm.keyDown(k);
    window.setTimeout(() => vm.keyUp(k), 90);
  };
  useImperativeHandle(ref, () => ({ start, stop, running: () => runningRef.current, press, poke: (v) => vmRef.current?.poke(v) }));

  const runningRef = useRef(false);
  const lastDraw = useRef(0);
  const acc = useRef(0);
  const last = useRef(0);

  // previews: start by themselves and loop
  useEffect(() => {
    if (!props.bot) return;
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- the loop

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const vm = vmRef.current;
      if (!vm) return;
      const p = propsRef.current;
      if (runningRef.current) {
        acc.current += Math.min(150, t - last.current);
        last.current = t;
        let steps = 0;
        while (acc.current >= STEP_MS && steps < 4) {
          for (const s of vm.sprites) prev.current.set(s.id, { x: s.x, y: s.y });
          if (p.bot) {
            if (botUp.current) { vm.keyUp(' '); botUp.current = false; }
            const every = p.bot.every ?? 0;
            if (every && vm.frame >= (p.bot.from ?? 10) && (vm.frame - (p.bot.from ?? 10)) % every === 0) { vm.keyDown(' '); botUp.current = true; }
          }
          vm.step();
          acc.current -= STEP_MS;
          steps++;
          p.onStep?.(vm);
          effects(vm);
          if (vm.state !== 'running') break;
          if (p.bot && vm.frame >= p.bot.loop) break;
        }
        if (acc.current > STEP_MS * 4) acc.current = 0;
        if (vm.state !== 'running') {
          if (p.bot) { runningRef.current = false; window.setTimeout(() => { if (propsRef.current.bot) start(); }, 900); }
          else finish(vm);
        } else if (p.bot && vm.frame >= p.bot.loop) {
          runningRef.current = false;
          window.setTimeout(() => { if (propsRef.current.bot) start(); }, 500);
        }
      }
      if (!runningRef.current && !dirty.current && t - lastDraw.current < 400) return;
      dirty.current = false;
      lastDraw.current = t;
      draw(vm, runningRef.current ? acc.current / STEP_MS : 1, t);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effects = (vm: VM) => {
    const lv = lastVars.current;
    lastVars.current = { ...vm.vars };
    if (propsRef.current.sound !== false) for (const s of vm.sounds.splice(0)) playSfx(s.name);
    else vm.sounds.length = 0;
    if (!lv) return;
    const pl = vm.sprites.find((s) => s.kind === 'player');
    if (!pl) return;
    if (vm.vars.vidas < lv.vidas) {
      addFx('hit', pl.x + 18, pl.y);
      const r = rootRef.current;
      if (r) { r.classList.remove('is-shaking'); void r.offsetWidth; r.classList.add('is-shaking'); }
    }
    if (vm.vars.puntos > lv.puntos) addFx('spark', pl.x + 10, pl.y + 10);
  };
  const addFx = (kind: Fx['kind'], x: number, y: number) => {
    const id = ++fxId.current;
    setFx((f) => [...f.slice(-5), { id, kind, x, y }]);
    window.setTimeout(() => setFx((f) => f.filter((e) => e.id !== id)), 700);
  };

  const draw = (vm: VM, alpha: number, t: number) => {
    const live = runningRef.current;
    let floorX = 0;
    for (const s of vm.sprites) {
      const n = nodes.current.get(s.id);
      if (!n) continue;
      const pv = prev.current.get(s.id) ?? s;
      const jumpX = Math.abs(s.x - pv.x) > 120;
      const x = jumpX ? s.x : pv.x + (s.x - pv.x) * Math.min(1, alpha);
      let y = Math.abs(s.y - pv.y) > 60 ? s.y : pv.y + (s.y - pv.y) * Math.min(1, alpha);
      let sx = 1, sy = 1, lean = 0;
      if (s.kind === 'player') {
        // the flip: tweened through the air, stretched, squashed on landing
        let lk = looks.current.get(s.id);
        if (!lk) { lk = { x: s.x, y: s.y, from: s.y, to: s.y, t0: -1e9, land: 0 }; looks.current.set(s.id, lk); }
        if (Math.abs(s.y - lk.to) > 60) { lk.from = lk.y; lk.to = s.y; lk.t0 = t; }
        const k = (t - lk.t0) / FLIP_MS;
        if (k < 1) {
          const e = 1 - (1 - k) * (1 - k);
          lk.y = lk.from + (lk.to - lk.from) * e;
          sx = 0.82; sy = 1.24;
        } else {
          lk.to = s.y;
          lk.y = y;
          const q = (t - lk.t0 - FLIP_MS) / LAND_MS;
          if (q >= 0 && q < 1) { sx = 1.18 - 0.18 * q; sy = 0.84 + 0.16 * q; }
        }
        y = lk.y;
        if (live && vm.state === 'running') { y += Math.abs(Math.sin(t / 75)) * 3 * (s.y > 0 ? -1 : 1); lean = 5; }
      }
      const up = flips(s.kind) && y > 0 ? -1 : 1;
      n.outer.setAttribute('transform', `translate(${x.toFixed(1)} ${(-y).toFixed(1)})`);
      n.inner.setAttribute('transform', `scale(${sx.toFixed(3)} ${(sy * up).toFixed(3)}) rotate(${lean * up})`);
      const sh = shown.current.get(s.id);
      if (!sh || sh.visible !== s.visible) n.outer.style.display = s.visible ? '' : 'none';
      if (!sh || sh.costume !== s.costume) for (const [c, g] of n.costumes) g.style.display = c === s.costume ? '' : 'none';
      if (n.bubble && (!sh || sh.say !== s.say)) {
        n.bubble.style.display = s.say ? '' : 'none';
        if (s.say && n.text && n.rect) {
          n.text.textContent = s.say;
          const w = Math.max(46, s.say.length * 10 + 22);
          n.rect.setAttribute('width', String(w));
          n.rect.setAttribute('x', String(-w / 2));
        }
      }
      shown.current.set(s.id, { visible: s.visible, costume: s.costume, say: s.say });
      if (s.kind === 'floor') floorX = x;
    }
    // the ceiling and the arches follow the floor's own run
    ceilRef.current?.setAttribute('transform', `translate(${floorX.toFixed(1)} -155)`);
    backRef.current?.setAttribute('transform', `translate(${((((floorX / 3) % 160) + 160) % 160 - 160).toFixed(1)} 0)`);
    // the arches only move when the floor does (the world runs because the child made it run)
    if (speedRef.current) speedRef.current.style.display = live && vm.state === 'running' ? '' : 'none';
    for (const [v, el] of monRefs.current) el.textContent = String(Math.round(vm.vars[v as VarName] * 100) / 100);
  };

  // ---------------------------------------------------------------- keys

  useEffect(() => {
    if (!props.keyboard) return;
    const typing = () => {
      const a = document.activeElement;
      return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') || !!document.querySelector('.ws-pop-back');
    };
    const down = (e: KeyboardEvent) => {
      if (!runningRef.current || typing()) return;
      if (!KEYS.some((k) => k.key === e.key)) return;
      e.preventDefault();
      vmRef.current?.keyDown(e.key);
    };
    const up = (e: KeyboardEvent) => { if (KEYS.some((k) => k.key === e.key)) vmRef.current?.keyUp(e.key); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [props.keyboard]);

  // ---------------------------------------------------------------- drawing

  const reg = (id: string) => (el: SVGGElement | null) => {
    if (!el) { nodes.current.delete(id); shown.current.delete(id); return; }
    const inner = el.querySelector<SVGGElement>(':scope > .ws-sp-in')!;
    const costumes = new Map<string, SVGGElement>();
    el.querySelectorAll<SVGGElement>(':scope > .ws-sp-in > [data-costume]').forEach((g) => costumes.set(g.getAttribute('data-costume')!, g));
    nodes.current.set(id, { outer: el, inner, costumes, bubble: el.querySelector('.ws-say'), text: el.querySelector('.ws-say text'), rect: el.querySelector('.ws-say rect') });
    shown.current.delete(id);
  };
  const floor = project.sprites.find((s) => s.kind === 'floor');
  const art = (kind: SpriteKind, c: string) => {
    switch (kind) {
      case 'player': return <PlayerArt costume={c} />;
      case 'obstacle': return <ObstacleArt costume={c} />;
      case 'seed': return <SeedArt costume={c} />;
      case 'bird': return <BirdArt costume={c} />;
      case 'star': return <StarArt costume={c} />;
      case 'floor': return <><g transform="translate(-480 0)"><FloorTile costume={c} /></g><FloorTile costume={c} /><g transform="translate(480 0)"><FloorTile costume={c} /></g></>;
      default: return null;
    }
  };
  const order: SpriteKind[] = ['floor', 'seed', 'star', 'obstacle', 'bird', 'player'];
  const drawOrder = [...sprites].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const monitors = props.monitors ?? [];
  const tapSpace = () => { if (runningRef.current) press('espacio'); };

  return (
    <div className={`ws-stage-box ${props.className ?? ''}`}>
      {props.controls && (
        <div className="ws-stage-bar">
          <button type="button" className={`ws-go cut${running ? ' is-on' : ''}`} onClick={start} aria-label="Bandera verde: jugar" data-act="go"><svg viewBox="0 0 26 26" width="30" height="30"><FlagGlyph /></svg></button>
          <button type="button" className="ws-stop cut" onClick={stop} aria-label="Detener" data-act="stop" disabled={!running}>
            <svg viewBox="-13 -13 26 26" width="26" height="26"><path d="M-5,-12 L5,-12 L12,-5 L12,5 L5,12 L-5,12 L-12,5 L-12,-5 Z" fill="#c9574a" stroke="#2b2622" strokeWidth={2} strokeLinejoin="round" /></svg>
          </button>
          {props.extra}
        </div>
      )}
      <div ref={rootRef} className={`ws-stage${running ? ' is-running' : ''}`} onPointerDown={tapSpace} role="img" aria-label={props.label ?? 'El juego'} data-running={running || undefined} data-end={end?.result}>
        <svg viewBox="-240 -180 480 360" preserveAspectRatio="xMidYMid meet" className="ws-stage-svg">
          <rect x={-240} y={-180} width={480} height={360} fill="#efe4cd" />
          <g ref={backRef}>{[-240, -80, 80, 240, 400].map((x) => <g key={x} transform={`translate(${x} 0)`}><BackTile /></g>)}</g>
          <g ref={ceilRef} transform="translate(0 -155)">
            {floor && [-480, 0, 480].map((dx) => <g key={dx} transform={`translate(${dx} 0)`}><FloorTile costume={floor.costume} ceiling /></g>)}
          </g>
          {drawOrder.map((s) => (
            <g key={s.id} ref={reg(s.id)} className={`ws-sp ws-sp-${s.kind}`} data-sprite={s.id} data-kind={s.kind}>
              <g className="ws-sp-in">
                {s.kind === 'player' && <g ref={speedRef} transform="translate(-20 4)"><SpeedLines /></g>}
                {COSTUMES[s.kind].map((c) => <g key={c} data-costume={c}>{art(s.kind, c)}</g>)}
              </g>
              {s.kind !== 'floor' && (
                <g className="ws-say" style={{ display: 'none' }} transform="translate(0 -62)">
                  <rect x={-40} y={-16} width={80} height={30} rx={10} fill="#fbf7ee" stroke="#2b2622" strokeWidth={2.4} />
                  <path d="M-6,13 L0,22 L6,13" fill="#fbf7ee" stroke="#2b2622" strokeWidth={2.4} strokeLinejoin="round" />
                  <text x={0} y={5} textAnchor="middle" className="ws-say-text" />
                </g>
              )}
            </g>
          ))}
          {fx.map((f) => <g key={f.id} className={`ws-fx ws-fx-${f.kind}`} transform={`translate(${f.x} ${-f.y})`}><Burst hit={f.kind === 'hit'} /></g>)}
          {monitors.length > 0 && (
            <g className="ws-monitors" transform="translate(-234 -174)">
              {monitors.map((v, i) => {
                const lw = MON_W[v] ?? 50;
                const x0 = monitors.slice(0, i).reduce((a, m) => a + (MON_W[m] ?? 50) + 56, 0);
                return (
                  <g key={v} transform={`translate(${x0} 0)`} data-monitor={v}>
                    <rect x={0} y={0} width={lw + 50} height={26} rx={6} fill="#fbf7ee" stroke="#2b2622" strokeWidth={1.8} />
                    <text x={7} y={18} className="ws-mon-name">{v}</text>
                    <rect x={lw + 8} y={4} width={36} height={18} rx={9} fill="#f39657" stroke="#2b2622" strokeWidth={1.4} />
                    <text ref={(el) => { if (el) monRefs.current.set(v, el); else monRefs.current.delete(v); }} x={lw + 26} y={18} textAnchor="middle" className="ws-mon-val">0</text>
                  </g>
                );
              })}
            </g>
          )}
        </svg>
        {props.overlays && end && end.result !== 'stopped' && (
          <div className={`ws-end is-${end.result}`} data-end={end.result}>
            <b className="ws-end-title">{end.result === 'won' ? '¡Ganaste!' : '¡Perdiste!'}</b>
            <span className="ws-end-sub">{end.vars.puntos} puntos</span>
            <button type="button" className="ws-end-again cut" onPointerDown={(e) => e.stopPropagation()} onClick={start}>
              {end.result === 'won' ? '¡Otra vez!' : '¿Otra vez?'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
