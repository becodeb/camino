// A tiny in-memory, per-IP sliding-window-ish (fixed window) rate limiter.
// It never writes an IP anywhere durable: the map lives only in this
// process's memory, is used solely to throttle, and is dropped on restart.

export interface RateLimiter {
  check(key: string): boolean;
  size(): number;
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>();

  function sweep(now: number) {
    if (hits.size < 1000) return;
    for (const [key, entry] of hits) {
      if (now >= entry.resetAt) hits.delete(key);
    }
  }

  return {
    check(key: string): boolean {
      const now = Date.now();
      sweep(now);
      const entry = hits.get(key);
      if (!entry || now >= entry.resetAt) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (entry.count >= limit) return false;
      entry.count += 1;
      return true;
    },
    size(): number {
      return hits.size;
    },
  };
}
