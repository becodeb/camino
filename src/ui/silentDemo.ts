// T20 (silent classroom round): a wordless demo (LevelDef.silentDemo) plays
// once per tag per session — not once per level id, since a few rungs share
// the same gesture (e.g. two sequence pages share 'path'). Forgotten on a
// new session (PlaytestScreen.tsx's `start`), exactly like the realtime
// game's and the workshop's own "seen it once" sets.

let shown = new Set<string>();

export const silentDemoShown = (tag: string): boolean => shown.has(tag);
export const markSilentDemoShown = (tag: string): void => { shown.add(tag); };
/** A new child on the same device (the pilot playtest's next session) sees every demo again. */
export const forgetSilentDemos = (): void => { shown = new Set(); };
