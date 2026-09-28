// A character alive on its own, without a board: the wardrobe's mirror, the
// character choice of sheet 1, the child standing in the garden, the one who
// cheers the family in the showcase. The very actor of the boards (it
// breathes, blinks, follows the pointer, fidgets, dozes off, laughs when
// tapped), standing on a spot of its own drawing.

import { el, blob } from '../../ink/ink.js';
import type { CharacterDef } from '../../ink/characters.js';
import type { Outfit } from '../../curriculum/motivation';
import { REDUCED } from '../runtime';
import { BoardView } from './BoardView';

export class StageView extends BoardView {
  /** `box`: the drawing's viewBox around the character's feet at (0, 0). */
  constructor(svg: SVGSVGElement, box: { x: number; y: number; w: number; h: number } = { x: -80, y: -150, w: 160, h: 164 }, o: { shadow?: boolean } = {}) {
    super(svg);
    svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`);
    // no board: a speech bubble goes over the head when the stage has room above it, beside the head otherwise (as in a board's top row)
    this.frameT = { top: -box.y, right: 0, bottom: 0 };
    if (o.shadow !== false) el('path', { d: blob(0, 2, 44, 9, { seed: 4, n: 10 }), fill: 'url(#hatch)', opacity: 0.6 }, this.L.floor);
  }

  /** Who stands here, dressed (a new one or a new outfit pops in with a puff). */
  show(def: CharacterDef, outfit?: Outfit) {
    this.setCharacter(def, outfit, { x: 0, y: 0 });
  }

  /** Somebody is here: it wakes up if it dozed off, and stays awake a while. */
  poke() {
    this.lastInput = performance.now();
    const a = this.actor;
    if (a?.sleeping) a.wake();
  }

  /** Its own celebration, with confetti: a piece put on, the family's win. */
  async cheer(confetti = true) {
    const a = this.actor;
    if (!a) return;
    this.lastInput = performance.now();
    a.sleeping = false;
    if (confetti) this.burstConfetti(0, -70);
    await a.act(() => a.perform('celebrate'));
  }

  /** A little nod (something new to wear, a tap on a piece). */
  async nod() {
    const a = this.actor;
    if (!a) return;
    await a.act(async () => { await a.settle(60); await a.perform('nod'); });
  }

  /** Watching something go wrong on the board: a wince, "¡Uy!", then a hopeful look. */
  async wince() {
    const a = this.actor;
    if (!a) return;
    this.poke();
    await a.act(async () => {
      a.rig.mouth = 'o';
      a.bubble('¡Uy!');
      if (!REDUCED) {
        await a.T({ sy: 0.9, sx: 1.08, lean: -6 }, 120);
        await a.T({ sy: 1, sx: 1, lean: 0 }, 260);
      }
      await a.wait(500);
      a.rig.mouth = 'smile';
    });
  }

  /** Watching the family press ▶: a hop and "¡Vamos!". */
  async root() {
    const a = this.actor;
    if (!a) return;
    this.poke();
    await a.act(async () => {
      a.rig.eyes = 'happy';
      a.bubble('¡Vamos!');
      if (!REDUCED) {
        await a.T({ sy: 0.84, sx: 1.12 }, 90);
        await a.T({ hop: -22, sy: 1.12, sx: 0.92 }, 170);
        await a.T({ hop: 0, sy: 1, sx: 1 }, 170);
      }
      a.rig.eyes = 'open';
    });
  }

  /** Looks towards a point of the screen (the board being played, a piece on its hook). */
  look(clientX: number, clientY: number, ms = 1600) {
    const a = this.actor;
    const p = this.toBoard(clientX, clientY);
    if (!a || !p) return;
    const dx = p.x - a.rig.x, dy = p.y - (a.rig.y - 50), d = Math.hypot(dx, dy) || 1;
    a.lookAt(dx / d, dy / d, ms);
  }
}
