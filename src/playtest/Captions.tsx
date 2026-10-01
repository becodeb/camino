// The on-screen text of the spoken lines (captions.ts) and its 💬 toggle.
// On a screen with a top bar (every level page, the menu, the wardrobe, the
// survey, the typing game, the probes) both live in the bar: the line as a
// speech bubble beside the character (in the place of the page's small
// title), so it never covers the board, its goal or the palette; the
// toggle before ✋. On a screen without a bar (the walks between steps, the
// goodbye) they float at the top. A tap on the bubble says the line again.
// The line stays until the next one, or until speech stops (the page or the
// step changes).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { speak } from '../ui/speech';
import { useCaptionLine, useCaptionsOn } from './captions';
import { usePlaytest } from './context';
import type { StepId } from './flow';
import { CaptionsIcon } from './round2Art';

/** The bar on screen (outside the adult's sheets), followed as pages change. */
export function useBar(): Element | null {
  const [bar, setBar] = useState<Element | null>(null);
  useEffect(() => {
    const root = document.querySelector('.piloto');
    if (!root) return;
    const find = () => setBar((b) => {
      const el = root.querySelector('.level-bar');
      return el === b ? b : el;
    });
    find();
    const mo = new MutationObserver(find);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  return bar;
}

/** Long lines get a smaller size so three lines hold them. */
const sizeOf = (t: string) => (t.length > 150 ? ' is-longer' : t.length > 95 ? ' is-long' : '');

export function Captions({ step }: { step: StepId }) {
  const on = useCaptionsOn();
  const line = useCaptionLine();
  const api = usePlaytest();
  const bar = useBar();
  if (step === 'setup') return null;
  const toggle = (
    <button
      type="button" className={`pp-cap-toggle cut${on ? ' is-on' : ''}`} aria-pressed={on}
      aria-label={on ? 'Sacar el texto de la pantalla' : 'Mostrar el texto en la pantalla'}
      onClick={() => api.setCaptions(!on, bar ? 'bar' : 'corner')}
    >
      <CaptionsIcon on={on} />
    </button>
  );
  const bubble = on && line ? (
    <button type="button" key={line.n} className={`pp-cap${sizeOf(line.text)}`} aria-live="polite" aria-label={`${line.text} (escuchar otra vez)`} onClick={() => speak(line.text)}>
      <span className="pp-cap-text">{line.text}</span>
    </button>
  ) : null;
  if (bar) return createPortal(<>{bubble}{toggle}</>, bar);
  return <div className="pp-cap-float">{bubble}{toggle}</div>;
}
