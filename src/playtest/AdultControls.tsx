// The adult's hidden controls, never a button the child sees:
// - a long press (1.5 s) on the top-left corner of the screen opens the
//   adult menu: log help given without a call, skip the step, end the
//   session (straight to the survey), the sync status;
// - a long press (1.2 s) on the character's raised hand opens the help
//   panel: what the adult did, which lowers the hand.
// The corner is watched on the window (capture phase), so the page under it
// (the 🔊 of a level's bar) keeps working for a normal tap.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePlaytest, type AdultHelpKind } from './context';
import { canEndNow, canSkip } from './flow';
import { useSyncStatus } from './runtime';
import { STEP_NAME } from './steps';
import { RaisedHand } from './RaisedHand';

export const CORNER_PX = 64;
export const CORNER_HOLD_MS = 1500;
export const HAND_HOLD_MS = 1200;
/** The child keeps ✋ pressed this long: the hand goes up at once. */
export const HAND_HOLD_HELP_MS = 1000;
const SLOP_PX = 14;

export const HELP_KINDS: { kind: AdultHelpKind; label: string }[] = [
  { kind: 'instruction', label: 'Expliqué la consigna' },
  { kind: 'tool', label: 'Mostré cómo usar la herramienta (arrastrar, ▶)' },
  { kind: 'hint', label: 'Di una pista' },
  { kind: 'solved_together', label: 'Lo resolvimos juntos' },
];

/** Swallows the click that ends a long press (so the control under it does not fire too). */
function swallowNextClick() {
  const eat = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
  window.addEventListener('click', eat, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', eat, { capture: true }), 600);
}

/** Calls `fire` after a press held `ms` on the window where `where(e)` holds; `progress` reports the hold (0–1) for a ring. */
export function useHold(ms: number, where: (e: PointerEvent) => boolean, fire: () => void, onProgress?: (p: number | null) => void) {
  const ref = useRef({ where, fire, onProgress });
  ref.current = { where, fire, onProgress };
  useEffect(() => {
    let timer = 0;
    let raf = 0;
    let start: { x: number; y: number; id: number; t: number } | null = null;
    const stop = () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      if (start) ref.current.onProgress?.(null);
      start = null;
    };
    const tick = () => {
      if (!start) return;
      ref.current.onProgress?.(Math.min(1, (performance.now() - start.t) / ms));
      raf = requestAnimationFrame(tick);
    };
    const down = (e: PointerEvent) => {
      if (!ref.current.where(e)) return;
      stop();
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now() };
      raf = requestAnimationFrame(tick);
      timer = window.setTimeout(() => {
        stop();
        swallowNextClick();
        ref.current.fire();
      }, ms);
    };
    const move = (e: PointerEvent) => {
      if (start && e.pointerId === start.id && Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP_PX) stop();
    };
    const up = (e: PointerEvent) => { if (start && e.pointerId === start.id) stop(); };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      stop();
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
  const [panel, setPanel] = useState(false);
  useHold(CORNER_HOLD_MS, (e) => e.clientX < CORNER_PX && e.clientY < CORNER_PX, () => { setPanel(false); setMenu(true); });

  // a long press must not open the browser's menu or select text (touch Chromebooks)
  useEffect(() => {
    const on = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest('textarea, input')) e.preventDefault();
    };
    window.addEventListener('contextmenu', on);
    return () => window.removeEventListener('contextmenu', on);
  }, []);

  useEffect(() => { if (!api.hand) setPanel(false); }, [api.hand]);

  return (
    <>
      {api.hand && <RaisedHand hand={api.hand} holdMs={HAND_HOLD_MS} onAdult={() => { setMenu(false); setPanel(true); }} />}
      {panel && api.hand && (
        <AdultSheet title="¿Qué hiciste?" onClose={() => setPanel(false)}>
          <p className="pp-adult-note">Tocá lo que hiciste y la mano baja.</p>
          <HelpKinds onPick={(k) => { api.adultHelp(k, true); setPanel(false); }} />
        </AdultSheet>
      )}
      {menu && <AdultMenu onClose={() => setMenu(false)} />}
    </>
  );
}

function HelpKinds({ onPick }: { onPick: (k: AdultHelpKind) => void }) {
  return (
    <div className="pp-kinds">
      {HELP_KINDS.map(({ kind, label }) => (
        <button key={kind} type="button" className="pp-adult-btn cut" data-kind={kind} onClick={() => onPick(kind)}>{label}</button>
      ))}
    </div>
  );
}

/** A sheet for the adult over the page (short text allowed). */
export function AdultSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="pp-adult-veil" role="dialog" aria-modal="true" aria-label={title} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="sheet pp-adult-sheet">
        <span className="tape tape-l" aria-hidden="true" />
        <h2 className="pp-adult-h">{title}</h2>
        {children}
        <button type="button" className="pp-adult-close" onClick={onClose}>Cerrar</button>
      </section>
    </div>
  );
}

function SyncDot() {
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
  const step = api.flow.step;
  return (
    <AdultSheet title="Menú del adulto" onClose={onClose}>
      <p className="pp-adult-note">{api.session?.code} · {STEP_NAME[step]}</p>
      {help ? (
        <>
          <p className="pp-adult-note">¿Qué ayuda diste?</p>
          <HelpKinds onPick={(k) => { api.adultHelp(k, false); setHelp(false); setNoted(true); }} />
        </>
      ) : (
        <div className="pp-kinds">
          <button type="button" className="pp-adult-btn cut" data-act="log-help" onClick={() => { setHelp(true); setNoted(false); }}>Registrar ayuda{noted ? ' ✓' : ''}</button>
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
