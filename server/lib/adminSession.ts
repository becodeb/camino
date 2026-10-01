// The teacher's login for /admin (T14): a password (env ADMIN_PASSWORD,
// never in git) exchanged for a signed cookie, so el docente does not paste
// a token on the classroom computer. The admin API accepts either that
// cookie or the old `Authorization: Bearer ADMIN_TOKEN` (the tools).
//
// - The cookie is `v1.<expiry epoch s>.<HMAC-SHA256>` with a key derived
//   from ADMIN_TOKEN and ADMIN_PASSWORD (changing either logs everyone out),
//   HttpOnly, SameSite=Strict, Secure behind https, 12 hours.
// - Password checks compare HMACs of both strings (constant time, and the
//   length of the real password does not leak).
// - Brute force: at most LOGIN_FAILS failed tries per client per window and
//   LOGIN_FAILS_GLOBAL failed tries in all per window (a backstop when the
//   client address is shared or spoofed). In memory only: the address is
//   never stored, and a restart forgets it.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

export const COOKIE_NAME = 'camino_admin';
export const COOKIE_MAX_AGE_S = 12 * 60 * 60;
export const LOGIN_WINDOW_MS = 10 * 60_000;
export const LOGIN_FAILS = 10;
export const LOGIN_FAILS_GLOBAL = 200;

export interface AdminSecrets {
  token?: string;
  password?: string;
}

function keyOf(s: AdminSecrets): Buffer {
  return createHash('sha256').update(`camino-admin-cookie\0${s.token ?? ''}\0${s.password ?? ''}`).digest();
}

const b64url = (b: Buffer) => b.toString('base64url');

/** A cookie value valid until `nowS + maxAge`. */
export function signCookie(s: AdminSecrets, nowS = Math.floor(Date.now() / 1000), maxAge = COOKIE_MAX_AGE_S): string {
  const body = `v1.${nowS + maxAge}`;
  return `${body}.${b64url(createHmac('sha256', keyOf(s)).update(body).digest())}`;
}

/** Whether a cookie value was signed with these secrets and has not expired. */
export function verifyCookie(s: AdminSecrets, value: string | undefined, nowS = Math.floor(Date.now() / 1000)): boolean {
  if (!value || !s.password) return false;
  const m = /^v1\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!m) return false;
  if (Number(m[1]) <= nowS) return false;
  const want = createHmac('sha256', keyOf(s)).update(`v1.${m[1]}`).digest();
  const got = Buffer.from(m[2], 'base64url');
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Constant-time password check (HMACs of both, so lengths do not leak). */
export function passwordMatches(s: AdminSecrets, typed: unknown): boolean {
  if (!s.password || typeof typed !== 'string' || typed.length === 0 || typed.length > 500) return false;
  const k = keyOf(s);
  const a = createHmac('sha256', k).update(typed).digest();
  const b = createHmac('sha256', k).update(s.password).digest();
  return timingSafeEqual(a, b);
}

/** Reads one cookie from the request's Cookie header. */
export function cookieOf(c: Context, name = COOKIE_NAME): string | undefined {
  const header = c.req.header('cookie') ?? '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

/** Whether the request came over https (directly, or through the Coolify/Cloudflare proxy). */
export function isHttps(c: Context): boolean {
  const proto = c.req.header('x-forwarded-proto');
  if (proto) return proto.split(',')[0].trim() === 'https';
  try { return new URL(c.req.url).protocol === 'https:'; } catch { return false; }
}

export function setCookieHeader(value: string, secure: boolean, maxAge = COOKIE_MAX_AGE_S): string {
  return `${COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
}

/**
 * The client's address for the login limit: Cloudflare's header, else the
 * last X-Forwarded-For hop (added by the proxy in front of the app), else
 * the socket. Never stored.
 */
export function clientKey(c: Context): string {
  const cf = c.req.header('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = c.req.header('x-forwarded-for');
  if (xff) {
    const hops = xff.split(',').map((x) => x.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  try { return getConnInfo(c).remote.address ?? 'unknown'; } catch { return 'unknown'; }
}

/** Failed logins per client and in all, in fixed windows. */
export interface LoginLimiter {
  /** Milliseconds until this client may try again (0: it may). */
  blockedFor(key: string, now?: number): number;
  fail(key: string, now?: number): void;
  ok(key: string): void;
}

export function createLoginLimiter(perKey = LOGIN_FAILS, global = LOGIN_FAILS_GLOBAL, windowMs = LOGIN_WINDOW_MS): LoginLimiter {
  const fails = new Map<string, { n: number; resetAt: number }>();
  let all = { n: 0, resetAt: 0 };
  const entry = (key: string, now: number) => {
    const e = fails.get(key);
    if (!e || now >= e.resetAt) return null;
    return e;
  };
  return {
    blockedFor(key, now = Date.now()) {
      if (now < all.resetAt && all.n >= global) return all.resetAt - now;
      const e = entry(key, now);
      return e && e.n >= perKey ? e.resetAt - now : 0;
    },
    fail(key, now = Date.now()) {
      if (fails.size > 5000) for (const [k, e] of fails) if (now >= e.resetAt) fails.delete(k);
      const e = entry(key, now) ?? { n: 0, resetAt: now + windowMs };
      e.n++;
      fails.set(key, e);
      if (now >= all.resetAt) all = { n: 0, resetAt: now + windowMs };
      all.n++;
    },
    ok(key) { fails.delete(key); },
  };
}
