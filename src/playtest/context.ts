// What every step of the playtest can reach: the session, the flow, the
// event log, and the adult's raised-hand state. PlaytestScreen provides it;
// a step component (see steps.tsx: STEP_VIEWS) reads it with usePlaytest().

import { createContext, useContext, type MutableRefObject } from 'react';
import type { FlowState } from './flow';
import type { SessionPatch, SessionRecord } from './telemetry';

/** The level on screen, as the adult's gestures need it (PlaytestLevel registers it). */
export interface LevelTrack {
  id: string;
  /** Highest automatic help step shown (0–3). */
  helpStep: number;
  /** An adult_help was logged while it was open. */
  adultHelped: boolean;
}

/** The character's raised hand: waiting for the adult since `since`. */
export interface HandState {
  since: number;
  level_id?: string;
  help_step: number;
  reason: 'help_held' | 'help_step_3';
}

export type AdultHelpKind = 'instruction' | 'tool' | 'hint' | 'solved_together';
/** How the adult got to "¿En qué lo ayudaste?" (T14): holding ✋, the raised hand, the corner menu. */
export type AdultHelpVia = 'help_hold' | 'hand' | 'menu';

export interface PlaytestApi {
  /** Null only on the setup step. */
  session: SessionRecord | null;
  flow: FlowState;
  /** The step is done: the next one. */
  next(): void;
  /** The step is left without being done (a placeholder, the adult). */
  skip(): void;
  /** The adult ends the child's part: straight to the survey. */
  endNow(): void;
  /** The child did an activity (the survey offers it as a favourite). */
  did(activity: string): void;
  /** Changes the session record (the survey, the adult form); synced like events. */
  patchSession(patch: SessionPatch): void;
  /** Logs an event of the session (docs/prueba-piloto-datos.md). */
  log(type: string, payload?: Record<string, unknown>): void;
  level: MutableRefObject<LevelTrack | null>;
  hand: HandState | null;
  raiseHand(reason: HandState['reason']): void;
  /**
   * Lowers a raised hand nobody answered: the child solved the page (`self`)
   * or moved on (`moved_on`); only the hand raised on `levelId` when given.
   * Logs `call_adult_end`.
   */
  lowerHand(how: 'self' | 'moved_on', levelId?: string): void;
  /** Turns the on-screen text on or off (the 💬 toggle); logs `captions`. */
  setCaptions(on: boolean, where: 'bar' | 'corner'): void;
  /** The adult tells what they did (`prompted`: a hand was raised, and this answers it). */
  adultHelp(kind: AdultHelpKind, prompted: boolean, via?: AdultHelpVia): void;
  /** T14: the adult opens the survey (corner menu, the green flag); after it the child returns to free play. */
  openSurvey(via: 'menu' | 'flag'): void;
  /** T14: the session ends where it is (the class end's countdown reached zero) and the queue is sent. */
  endSession(reason: 'class_end'): void;
  /** T14 demo tools (demo sessions only). */
  demoGoto(step: import('./flow').StepId): void;
  demoRouteDone(): void;
  demoEnd(): void;
}

export const PlaytestContext = createContext<PlaytestApi | null>(null);

export function usePlaytest(): PlaytestApi {
  const api = useContext(PlaytestContext);
  if (!api) throw new Error('usePlaytest outside PlaytestScreen');
  return api;
}
