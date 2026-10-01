// On-screen text in the playtest: every spoken line (speech.ts) can also
// show as text, for rooms without headphones. On by default from 3ro (they
// read), off for 1ro and 2do; the setup can force it on or off, and the
// 💬 toggle (Captions.tsx) changes it at any time. The demo never installs
// the listener, so nothing changes there.
//
// The current line is kept here (set when a line is said or queued until
// the first tap, cleared when speech stops: a page closing, a step ending);
// Captions.tsx draws it.

import { useSyncExternalStore } from 'react';
import { setSpeechListener } from '../ui/speech';

/** What the setup chose: by the grade, or forced. */
export type CaptionsSetting = 'auto' | 'on' | 'off';

/** The default for a grade: on from 3ro (inclusive). */
export const captionsByGrade = (grade: number) => grade >= 3;

export function captionsFor(grade: number, setting: CaptionsSetting): boolean {
  return setting === 'auto' ? captionsByGrade(grade) : setting === 'on';
}

export interface CaptionLine {
  text: string;
  /** Increases with every line, so the same words said again still re-show. */
  n: number;
}

let on = false;
let line: CaptionLine | null = null;
let count = 0;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export function setCaptions(v: boolean): void {
  if (on === v) return;
  on = v;
  notify();
}
export const captionsOn = () => on;

/** Starts listening to the spoken lines; returns the uninstaller. */
export function installCaptions(): () => void {
  setSpeechListener((text) => {
    const t = text?.trim();
    if (!t) {
      if (line) { line = null; notify(); }
      return;
    }
    if (line?.text === t) return;
    line = { text: t, n: ++count };
    notify();
  });
  return () => { setSpeechListener(null); line = null; on = false; notify(); };
}

/** Drops the line on screen (a step changed). */
export function clearCaption(): void {
  if (!line) return;
  line = null;
  notify();
}

/** The store, outside React (tests). */
export const subscribeCaptions = subscribe;
export const captionLine = () => line;

export const useCaptionsOn = () => useSyncExternalStore(subscribe, () => on, () => on);
export const useCaptionLine = () => useSyncExternalStore(subscribe, () => line, () => line);
