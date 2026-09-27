// Which pages have their stamp. In memory only (no persistence in the demo):
// a reload starts the tramo again.

import { useSyncExternalStore } from 'react';

let done = new Set<string>();
const subs = new Set<() => void>();

export function stamp(levelId: string) {
  if (done.has(levelId)) return;
  done = new Set(done).add(levelId);
  subs.forEach((f) => f());
}

export const isStamped = (levelId: string) => done.has(levelId);

export function useStamps(): ReadonlySet<string> {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f); },
    () => done,
  );
}
