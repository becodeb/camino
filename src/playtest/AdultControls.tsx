// The adult's hidden controls, never a button the child sees:
// - a long press (1.5 s) on the top-left corner of the screen opens the
//   adult menu: the survey (T14: the adult opens it, usually once the green
//   flag shows), log help given without a call, the adult's optional
//   comment ("Comentario del adulto": sessions.adult_form), skip the step,
//   end the session (straight to the survey), the sync status; never the
//   session code (round 2);
// - in free play, the adult menu also opens a probe for any grade ("Hacé
//   tu juego", "Del bloque al texto": for testing, or for a child who wants it);
// - T14: holding ✋ (1.5 s) whenever the adult helps asks "¿En qué lo
//   ayudaste?": four big answers, one tap closes it and logs `adult_help`
//   (`prompted` when a hand was up, which goes down). A short tap on ✋ is
//   still the child's help. The child no longer raises the hand by holding
//   ✋ (it still rises after the automatic help steps);
// - a long press (1.2 s) on the character's raised hand asks the same.
// - T18: "Sonido: sí / no" mutes or unmutes this one device for the rest of
//   this page load (soundSetting.ts); the admin's class-wide setting still
//   wins while it is live.
// The corner is watched on the window (capture phase), so the page under it
// (the 🔊 of a level's bar) keeps working for a normal tap.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMuted } from '../ui/mute';
import { holdAdultSheet } from './adultState';
import { AdultFormPanel } from './closing';
import { usePlaytest, type AdultHelpKind, type AdultHelpVia } from './context';
import { canEndNow, canOpenSurvey, canSkip } from './flow';
import { realTimeout } from './demo';
import { createHold } from './hold';
import { useSyncStatus } from './runtime';
import { STEP_NAME } from './labels';
import { RaisedHand } from './RaisedHand';
import { openProbe } from './probes';
import { setAdultOverride } from './soundSetting';

export const CORNER_PX = 64;
export const CORNER_HOLD_MS = 1500;
export const HAND_HOLD_MS = 1200;
/** T14: the adult keeps ✋ pressed this long: "¿En qué lo ayudaste?". */
export const HELP_HOLD_MS = 1500;
/** Any ✋ of a page's bar (levels, the typing game, the probes, the tool check). */
export const HELP_BUTTON = '.level-bar .help';

export const HELP_KINDS: { kind: AdultHelpKind; label: string }[] = [
  { kind: 'instruction', label: 'Le expliqué la consigna' },
  { kind: 'tool', label: 'Le mostré cómo usar los botones (arrastrar, ▶)' },
  { kind: 'hint', label: 'Le di una pista' },
  { kind: 'solved_together', label: 'Lo resolvimos juntos' },
];

/** Swallows the click that ends a long press (so the control under it does not fire too). */
function swallowNextClick() {
  const eat = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
  const off = () => {
    window.removeEventListener('click', eat, { capture: true });
    window.removeEventListener('pointerdown', off, { capture: true });
  };
  window.addEventListener('click', eat, { capture: true, once: true });
  // a new press is not the held one: its click must go through (the page under the press may have changed, so the
  // held press's own click may never come)
  window.addEventListener('pointerdown', off, { capture: true, once: true });
  realTimeout(off, 600);
}

/** Calls `fire` after a press held `ms` on the window where `where(e)` holds (hold.ts); `progress` reports the hold (0–1) for a ring. */
export function useHold(ms: number, where: (e: PointerEvent) => boolean, fire: () => void, onProgress?: (p: number | null) => void) {
  const ref = useRef({ where, fire, onProgress });
  ref.current = { where, fire, onProgress };
  useEffect(() => {
    let raf = 0;
    let active = false;
    let last: PointerEvent | null = null;
    const hold = createHold({
      ms,
      where: () => !!last && ref.current.where(last),
      fire: () => { active = false; cancelAnimationFrame(raf); ref.current.onProgress?.(null); ref.current.fire(); },
      swallowClick: swallowNextClick,
      // the real clock: the demo's "más rápido" must not shorten an adult's long press
      setTimer: (fn, t) => realTimeout(fn, t),
      clearTimer: (h) => window.clearTimeout(h as number),
    });
    const at = (e: PointerEvent) => ({ x: e.clientX, y: e.clientY, id: e.pointerId });
    const tick = () => {
      const p = hold.progress(performance.now());
      ref.current.onProgress?.(p);
      if (p != null) raf = requestAnimationFrame(tick);
    };
    const settle = () => {
      if (!active || hold.progress(performance.now()) != null) return;
      active = false;
      cancelAnimationFrame(raf);
      ref.current.onProgress?.(null);
    };
    const down = (e: PointerEvent) => {
      last = e;
      hold.down(at(e), performance.now());
      if (hold.progress(performance.now()) != null) { active = true; cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); }
    };
    const move = (e: PointerEvent) => { hold.move(at(e)); settle(); };
    const up = (e: PointerEvent) => { hold.up(at(e)); settle(); };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      hold.cancel();
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, [ms]);
}

export function AdultControls() {
  const api = usePlaytest();
  const [menu, setMenu] = useState(false);
  /** "¿En qué lo ayudaste?" open, and how the adult got there. */
  const [panel, setPanel] = useState<AdultHelpVia | null>(null);
  useHold(CORNER_HOLD_MS, (e) => e.clientX < CORNER_PX && e.clientY < CORNER_PX, () => { setPanel(null); setMenu(true); });
  // holding ✋: a ring fills round it while the adult holds; a short tap is the child's help as before
  const held = useRef<HTMLElement | null>(null);
  useHold(HELP_HOLD_MS, (e) => {
    const b = (e.target as Element | null)?.closest?.(HELP_BUTTON) as HTMLElement | null;
    held.current = b;
    return !!b;
  }, () => { setMenu(false); setPanel('help_hold'); }, (p) => {
    const b = held.current;
    if (!b) return;
    if (p == null) { b.classList.remove('pp-holding'); b.style.removeProperty('--hold'); }
    else { b.classList.add('pp-holding'); b.style.setProperty('--hold', String(p)); }
  });

  // a long press must not open the browser's menu or select text (touch Chromebooks)
  useEffect(() => {
    const on = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest('textarea, input')) e.preventDefault();
    };
    window.addEventListener('contextmenu', on);
    return () => window.removeEventListener('contextmenu', on);
  }, []);

  return (
    <>
      {api.hand && <RaisedHand hand={api.hand} holdMs={HAND_HOLD_MS} onAdult={() => { setMenu(false); setPanel('hand'); }} />}
      {panel && <HelpQuestion via={panel} onClose={() => setPanel(null)} />}
      {menu && <AdultMenu onClose={() => setMenu(false)} />}
    </>
  );
}

/** "¿En qué lo ayudaste?": four big answers; one tap logs it (and lowers a raised hand) and closes. */
function HelpQuestion({ via, onClose }: { via: AdultHelpVia; onClose: () => void }) {
  const api = usePlaytest();
  const up = !!api.hand;
  return (
    <AdultSheet title="¿En qué lo ayudaste?" onClose={onClose} className="pp-help-q">
      <p className="pp-adult-note">{up ? 'Tocá una y la mano baja.' : 'Tocá una: queda anotado.'}</p>
      <HelpKinds big onPick={(k) => { api.adultHelp(k, up, via); onClose(); }} />
    </AdultSheet>
  );
}

function HelpKinds({ onPick, big = false }: { onPick: (k: AdultHelpKind) => void; big?: boolean }) {
  return (
    <div className={`pp-kinds${big ? ' is-big' : ''}`}>
      {HELP_KINDS.map(({ kind, label }) => (
        <button key={kind} type="button" className="pp-adult-btn cut" data-kind={kind} onClick={() => onPick(kind)}>{label}</button>
      ))}
    </div>
  );
}

/** T18: "Sonido: sí / no" for this device, this page load only (soundSetting.ts's adult layer). */
function SoundToggle() {
  const muted = useMuted();
  return (
    <button type="button" className="pp-adult-btn cut" data-act="sound" onClick={() => setAdultOverride(muted)}>
      Sonido: {muted ? 'no' : 'sí'}
    </button>
  );
}

/** A sheet for the adult over the page (short text allowed). */
export function AdultSheet({ title, onClose, children, className }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  // the goodbye waits while the adult has a sheet open
  useEffect(() => holdAdultSheet(), []);
  return (
    <div className="pp-adult-veil" role="dialog" aria-modal="true" aria-label={title} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className={`sheet pp-adult-sheet${className ? ` ${className}` : ''}`}>
        <span className="tape tape-l" aria-hidden="true" />
        <h2 className="pp-adult-h">{title}</h2>
        {children}
        <button type="button" className="pp-adult-close" onClick={onClose}>Cerrar</button>
      </section>
    </div>
  );
}

export function SyncDot() {
  const s = useSyncStatus();
  const state = s.failures > 0 ? 'off' : s.pending > 0 || s.dirty > 0 ? 'wait' : 'ok';
  const text = state === 'ok' ? 'Todo enviado' : state === 'wait' ? `${s.pending} eventos por enviar` : `Sin conexión: ${s.pending} eventos guardados, se envían solos después`;
  return <p className="pp-sync" data-sync={state}><span className="pp-sync-dot" aria-hidden="true" />{text}</p>;
}

function AdultMenu({ onClose }: { onClose: () => void }) {
  const api = usePlaytest();
  const [help, setHelp] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [noted, setNoted] = useState(false);
  const [form, setForm] = useState(false);
  const [saved, setSaved] = useState(false);
  const step = api.flow.step;
  return (
    <AdultSheet title={form ? 'Comentario del adulto' : 'Menú del adulto'} onClose={onClose}>
      <p className="pp-adult-note">{STEP_NAME[step]}</p>
      {form ? (
        <AdultFormPanel done={() => { setForm(false); setSaved(true); }} />
      ) : help ? (
        <>
          <p className="pp-adult-note">¿En qué lo ayudaste?</p>
          <HelpKinds onPick={(k) => { api.adultHelp(k, !!api.hand, 'menu'); setHelp(false); setNoted(true); }} />
        </>
      ) : (
        <div className="pp-kinds">
          {canOpenSurvey(api.flow) && <button type="button" className={`pp-adult-btn cut${api.flow.routeDone ? ' is-go' : ''}`} data-act="survey" onClick={() => { api.openSurvey('menu'); onClose(); }}>Hacer la encuesta{api.flow.routeDone ? ' (ya terminó)' : ''}</button>}
          <button type="button" className="pp-adult-btn cut" data-act="log-help" onClick={() => { setHelp(true); setNoted(false); }}>Registrar ayuda{noted ? ' ✓' : ''}</button>
          <button type="button" className="pp-adult-btn cut" data-act="adult-form" onClick={() => setForm(true)}>Comentario del adulto <small>(opcional)</small>{saved ? ' ✓' : ''}</button>
          <SoundToggle />
          {step === 'free_play' && <button type="button" className="pp-adult-btn cut" data-act="open-game-maker" onClick={() => { openProbe('game_maker'); onClose(); }}>Abrir «Hacé tu juego»</button>}
          {step === 'free_play' && <button type="button" className="pp-adult-btn cut" data-act="open-text-probe" onClick={() => { openProbe('text_probe'); onClose(); }}>Abrir «Del bloque al texto»</button>}
          {canSkip(step) && <button type="button" className="pp-adult-btn cut" data-act="skip" onClick={() => { api.skip(); onClose(); }}>Saltar este paso</button>}
          {canEndNow(step) && (
            confirmEnd
              ? <button type="button" className="pp-adult-btn cut is-danger" data-act="end-confirm" onClick={() => { api.endNow(); onClose(); }}>Sí, terminar: ir a la encuesta</button>
              : <button type="button" className="pp-adult-btn cut" data-act="end" onClick={() => setConfirmEnd(true)}>Terminar la sesión</button>
          )}
        </div>
      )}
      <SyncDot />
    </AdultSheet>
  );
}
