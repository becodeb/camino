// The automatic events, as pure pieces the browser glue (./runtime.ts)
// feeds: idle stretches (no pointer or key input for 30 s, one event per
// stretch with its length, sent when input resumes; time with the tab hidden
// does not count) and client errors (message and source file/line only,
// deduplicated and capped so a render loop cannot flood the queue).

export const IDLE_MS = 30_000;

export interface IdleTracker {
  /** Input now; returns the idle stretch that just ended, if it was long enough. */
  input(now: number): number | null;
  /** The tab was hidden: returns the idle stretch up to now, if long enough, and stops counting. */
  pause(now: number): number | null;
  /** The tab is visible again: counting starts over. */
  resume(now: number): void;
}

export function createIdleTracker(start: number, threshold = IDLE_MS): IdleTracker {
  let last = start;
  let paused = false;
  const stretch = (now: number) => (now - last >= threshold ? now - last : null);
  return {
    input(now) {
      if (paused) return null;
      const d = stretch(now);
      last = now;
      return d;
    },
    pause(now) {
      if (paused) return null;
      const d = stretch(now);
      paused = true;
      last = now;
      return d;
    },
    resume(now) {
      paused = false;
      last = now;
    },
  };
}

export interface ErrorInfo {
  message: string;
  source?: string;
  line?: number;
  col?: number;
}

/** The file of a script URL, without its origin or query (no host, no tokens). */
export function sourceFile(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  const clean = url.split(/[?#]/)[0];
  const file = clean.slice(clean.lastIndexOf('/') + 1);
  return file ? file.slice(0, 120) : undefined;
}

/** Keeps at most `max` errors per page load and drops a repeat of the same one within `windowMs`. */
export function createErrorLimiter(max = 20, windowMs = 30_000) {
  const seen = new Map<string, number>();
  let count = 0;
  return (info: ErrorInfo, now: number): ErrorInfo | null => {
    if (count >= max) return null;
    const message = (info.message || 'unknown error').slice(0, 300);
    const key = `${message}@${info.source ?? ''}:${info.line ?? ''}`;
    const prev = seen.get(key);
    if (prev != null && now - prev < windowMs) return null;
    seen.set(key, now);
    count++;
    return { ...info, message };
  };
}
