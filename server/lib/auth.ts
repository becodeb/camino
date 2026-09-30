// Bearer token middleware compared in constant time. A missing token env var
// disables the endpoint (503, "not configured"), never leaves it open.

import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Compare against itself so a length mismatch takes about as long as a
    // real comparison, instead of returning immediately.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function bearerAuth(token: string | undefined): MiddlewareHandler {
  return async (c, next) => {
    if (!token) {
      return c.json({ error: 'not_configured' }, 503);
    }
    const header = c.req.header('authorization') ?? '';
    const [scheme, value] = header.split(' ');
    if (scheme !== 'Bearer' || !value || !constantTimeEqual(value, token)) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    await next();
  };
}
