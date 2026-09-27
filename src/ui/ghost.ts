// The ghost hand: a paper hand drawn in ink that shows the exact gesture on
// the real screen, without touching anything. Ported from habilidades
// (app/src/ui/ghost.ts @ 9b90d1d). It moves over
// the page on a fixed layer; a drag carries a copy of the block (or piece) so
// the child sees it travel; a tap leaves a blue-pen ripple. Also the glow of
// the goal (a pen ring that pulses around it) and the wiggle of the raised
// hand. Imperative on purpose: it plays over any area's DOM.

import { penLoop } from '../ink/ink.js';
import { REDUCED } from './runtime';

const INK = '#2b2622';
const PEN = '#3d6ea5';
/** The drawn hand is 64 × 64; its fingertip is here. */
const TIP = { x: 17, y: 5 };
const SIZE = 112;
const K = SIZE / 64;

/** A pointing hand in the style of docs/05: the same peach paper as the raised hand of Ayuda, ink outline, knuckle lines, boiled by #rough. */
const HAND_SVG = `
<svg viewBox="0 0 64 64" width="${SIZE}" height="${SIZE}" aria-hidden="true" style="overflow:visible">
  <g filter="url(#rough)">
    <path d="M14,7 C14,2.6 20,2.6 20,7 L20,27 C20.5,24 26,24 26.5,27.5 C27,25 32.5,25 33,28.5 C33.5,26.5 38.5,27 38.5,31
             L38.5,41 C38.5,51 32,57.5 24,57.5 C17,57.5 12.5,53 10.5,47 L5,37.5 C3.4,34.5 7,31.5 9.5,34.5 L14,39 Z"
          fill="#eeac7f" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M26.5,28.5 L26.5,34 M33,29.5 L33,35 M16,19 C17,19.6 18,19.6 19,19" fill="none" stroke="${INK}" stroke-width="1.7" stroke-linecap="round"/>
    <path d="M13,58 C18,61 30,61 36,58" fill="none" stroke="${PEN}" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 5"/>
  </g>
</svg>`;

/**
 * One gesture of a demo: tap a target, point at targets, or drag one onto
 * another (CSS selectors). Help only shows the gesture; a concept demo also
 * makes it happen: `apply` runs at the moment of the tap or the drop.
 */
export type DemoStep =
  | { do: 'tap'; at: string; apply?: () => void }
  | { do: 'point'; at: string[] }
  | { do: 'drag'; from: string; to: string; apply?: () => void }
  | { do: 'wait'; ms: number };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface GhostRun {
  done: Promise<void>;
  cancel(): void;
}

function layer(): HTMLElement {
  let el = document.querySelector<HTMLElement>('.ghost-layer');
  if (!el) {
    el = document.createElement('div');
    el.className = 'ghost-layer';
    el.setAttribute('aria-hidden', 'true');
    document.body.append(el);
  }
  return el;
}

/** Every element a step's selectors match inside the world (first match for taps and drags). */
function all(root: HTMLElement, selectors: string[]): Element[] {
  return selectors.flatMap((s) => [...root.querySelectorAll(s)]).filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}
const one = (root: HTMLElement, sel: string, last = false): Element | null => {
  const found = all(root, [sel]);
  return (last ? found[found.length - 1] : found[0]) ?? null;
};
const centerOf = (e: Element) => {
  const r = e.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/**
 * Plays a demo script. Targets that are not on screen are skipped; the whole
 * run is visual only (pointer-events none) and can be cancelled at any time.
 */
export function playGhost(root: HTMLElement, steps: DemoStep[]): GhostRun {
  let cancelled = false;
  const host = layer();
  const hand = document.createElement('div');
  hand.className = 'ghost-hand';
  hand.innerHTML = HAND_SVG;
  const carried: HTMLElement[] = [];
  let at = (() => {
    // the hand comes in from the lower right of the stage
    const stage = root.querySelector('.shell-stage') ?? root;
    const r = stage.getBoundingClientRect();
    return { x: Math.min(innerWidth - 40, r.right - 30), y: Math.min(innerHeight - 30, r.bottom - 20) };
  })();
  const place = (p: { x: number; y: number }) => `translate(${p.x - TIP.x * K}px, ${p.y - TIP.y * K}px)`;
  hand.style.transform = place(at);
  hand.style.opacity = '0';
  host.append(hand);

  const move = async (to: { x: number; y: number }, ms: number, carry?: HTMLElement) => {
    if (cancelled) return;
    const from = at;
    at = to;
    // short hops (tapping the same count again) are quick
    const dur = REDUCED ? 1 : Math.max(160, ms * Math.min(1, Math.hypot(to.x - from.x, to.y - from.y) / 260));
    const anims = [hand.animate([{ transform: place(from) }, { transform: place(to) }], { duration: dur, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'forwards' })];
    if (carry) {
      // held by its lower left corner, so the hand never hides what it carries
      const off = { x: carry.offsetWidth * 0.3, y: carry.offsetHeight * 0.8 };
      const t = (p: { x: number; y: number }) => `translate(${p.x - off.x}px, ${p.y - off.y}px) rotate(-5deg)`;
      anims.push(carry.animate([{ transform: t(from) }, { transform: t(to) }], { duration: dur, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'forwards' }));
    }
    await Promise.all(anims.map((a) => a.finished.catch(() => undefined)));
  };
  const press = async (down: boolean) => {
    if (cancelled) return;
    await hand.animate([{ scale: down ? '1' : '0.86' }, { scale: down ? '0.86' : '1' }], { duration: 160, fill: 'forwards' }).finished.catch(() => undefined);
  };
  const ripple = (p: { x: number; y: number }) => {
    const r = document.createElement('div');
    r.className = 'ghost-ripple';
    r.style.left = `${p.x}px`;
    r.style.top = `${p.y}px`;
    host.append(r);
    setTimeout(() => r.remove(), 900);
  };

  const run = async () => {
    await hand.animate([{ opacity: 0 }, { opacity: 0.94 }], { duration: 260, fill: 'forwards' }).finished.catch(() => undefined);
    for (const s of steps) {
      if (cancelled) break;
      if (s.do === 'wait') {
        await sleep(s.ms);
      } else if (s.do === 'tap') {
        const el = one(root, s.at);
        if (!el) continue;
        await move(centerOf(el), 650);
        await press(true);
        ripple(at);
        if (!cancelled) s.apply?.();
        await sleep(90);
        await press(false);
        await sleep(380);
      } else if (s.do === 'point') {
        for (const el of all(root, s.at).slice(0, 8)) {
          if (cancelled) break;
          await move(centerOf(el), 480);
          await hand.animate([{ rotate: '0deg' }, { rotate: '-8deg' }, { rotate: '0deg' }], { duration: 320 }).finished.catch(() => undefined);
        }
        await sleep(200);
      } else {
        const from = one(root, s.from);
        const to = one(root, s.to, true);
        if (!from || !to) continue;
        await move(centerOf(from), 650);
        await press(true);
        // a paper copy of what is being dragged travels with the hand
        const copy = from.cloneNode(true) as HTMLElement;
        copy.classList.add('ghost-carry');
        copy.removeAttribute('id');
        const r = from.getBoundingClientRect();
        Object.assign(copy.style, { width: `${r.width}px`, height: `${r.height}px`, transform: `translate(${r.left}px, ${r.top}px)` });
        host.insertBefore(copy, hand);
        carried.push(copy);
        await move(centerOf(to), 950, copy);
        await press(false);
        ripple(at);
        if (!cancelled) s.apply?.();
        await copy.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 380, fill: 'forwards' }).finished.catch(() => undefined);
        copy.remove();
        await sleep(260);
      }
    }
    await hand.animate([{ opacity: 0.94 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished.catch(() => undefined);
    hand.remove();
  };
  const done = run().catch(() => undefined).finally(() => { hand.remove(); carried.forEach((c) => c.remove()); });
  return {
    done,
    cancel() {
      cancelled = true;
      hand.getAnimations().forEach((a) => a.cancel());
      hand.remove();
      carried.forEach((c) => c.remove());
    },
  };
}

/**
 * The goal glows (docs/16 §5, "hace brillar la meta"): a blue-pen ring pulses
 * around every `[data-guide="target"]` of the world, or around the board.
 */
export function glowTargets(root: HTMLElement, ms = 2600): void {
  const targets = all(root, ['[data-guide="target"]']);
  const list = targets.length ? targets : all(root, ['.sheet .board']).slice(0, 1);
  const host = layer();
  list.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const pad = Math.max(10, Math.min(r.width, r.height) * 0.18);
    const w = r.width + pad * 2, h = r.height + pad * 2;
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ring.setAttribute('class', 'guide-ring');
    ring.setAttribute('viewBox', `0 0 ${w} ${h}`);
    Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${w}px`, height: `${h}px` });
    ring.innerHTML = `<path d="${penLoop(w / 2, h / 2, w / 2 - 4, h / 2 - 4, { seed: 7 + i })}" fill="rgba(240, 210, 122, 0.18)" stroke="${PEN}" stroke-width="3.4" stroke-linecap="round" filter="url(#boil)"/>`;
    host.append(ring);
    setTimeout(() => ring.remove(), ms);
  });
}

/** The raised hand wiggles and glows once: "si querés ayuda, tocá la mano". */
export function wiggleHelp(root: HTMLElement): void {
  const help = root.querySelector<HTMLElement>('.help');
  if (!help) return;
  help.classList.remove('is-inviting');
  void help.offsetWidth;
  help.classList.add('is-inviting');
  setTimeout(() => help.classList.remove('is-inviting'), 2600);
}
