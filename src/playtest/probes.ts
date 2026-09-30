// The 4to and 5to probes plug into free play here. A probe's card shows on
// its grade's menu (freePlay.ts MENU) only once its component is in PROBES:
// T7 adds `game_maker: GameMaker` ("Hacé tu juego"), T8 `text_probe:
// TextProbe` ("Del bloque al texto").
//
// A probe is a component with ProbeProps. It plays its own pages (usually
// PlaytestLevel with `activity` so level_start/level_end carry it, and any
// events of its own through usePlaytest().log), tells free play when a page
// ends (`levelEnded`: free play's time runs out only between pages) and
// calls `done()` when the child finished it (back to the menu). Free play
// draws the "volver al menú" button, logs the pick (`choice`) and the time
// in it (`activity_end`), and plants the seeds of the pages solved.

import type { ComponentType } from 'react';
import type { ProbeId } from './freePlay';
import type { LevelEnd } from './PlaytestLevel';
import { GameMaker } from './GameMaker';
import { TextProbe } from './TextProbe';

export interface ProbeProps {
  /** The activity id to log on the probe's pages (`game_maker`, `text_probe`). */
  activity: ProbeId;
  /** A page of the probe ended (pass PlaytestLevel's onEnd result). */
  levelEnded(end: LevelEnd): void;
  /** The child finished the probe: back to the menu. */
  done(): void;
}

export const PROBES: Partial<Record<ProbeId, ComponentType<ProbeProps>>> = { game_maker: GameMaker, text_probe: TextProbe };

export const hasProbe = (id: ProbeId) => !!PROBES[id];

/** The adult menu asks free play to open a probe (any grade: to test it, or for a 5to who wants the game maker). */
export const OPEN_PROBE_EVENT = 'pp-open-probe';
export function openProbe(id: ProbeId) {
  window.dispatchEvent(new CustomEvent<ProbeId>(OPEN_PROBE_EVENT, { detail: id }));
}
