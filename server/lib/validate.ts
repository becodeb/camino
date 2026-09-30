// Strict validation for POST /api/sync. Never trust the client: this is the
// only write endpoint the kid app uses, and it must reject anything that
// does not match the documented shapes instead of silently coercing it.

import type { EventInput, SessionInput, SyncBody } from '../types.ts';

export const MAX_BODY_BYTES = 1_000_000; // 1 MB
export const MAX_EVENTS_PER_BATCH = 500;
export const MAX_PAYLOAD_BYTES = 8_000; // 8 KB per event payload

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIVISION_RE = /^[A-Za-z]$/;
const EVENT_TYPE_RE = /^[a-z_]{1,40}$/;

export type ValidationResult =
  | { ok: true; value: SyncBody }
  | { ok: false; status: 400 | 413; message: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isParseableDate(v: unknown): v is string {
  if (typeof v !== 'string' || v.length === 0) return false;
  return !Number.isNaN(Date.parse(v));
}

function validateSession(input: unknown): SessionInput | string {
  if (!isPlainObject(input)) return 'session must be an object';

  const id = input.id;
  if (typeof id !== 'string' || !UUID_RE.test(id)) return 'session.id must be a uuid';

  const code = input.code;
  if (typeof code !== 'string' || code.length === 0 || code.length > 200) {
    return 'session.code must be a non-empty string';
  }

  const grade = input.grade;
  if (typeof grade !== 'number' || !Number.isInteger(grade) || grade < 1 || grade > 5) {
    return 'session.grade must be an integer 1..5';
  }

  const division = input.division ?? null;
  if (division !== null && (typeof division !== 'string' || !DIVISION_RE.test(division))) {
    return 'session.division must be null or one letter';
  }

  const consent = input.consent;
  if (typeof consent !== 'boolean') return 'session.consent must be a boolean';

  const started_at = input.started_at;
  if (!isParseableDate(started_at)) return 'session.started_at must be a parseable date';

  const ended_at = input.ended_at ?? null;
  if (ended_at !== null && !isParseableDate(ended_at)) {
    return 'session.ended_at must be null or a parseable date';
  }

  const end_reason = input.end_reason ?? null;
  if (end_reason !== null && typeof end_reason !== 'string') return 'session.end_reason must be a string';

  const app_version = input.app_version ?? null;
  if (app_version !== null && typeof app_version !== 'string') return 'session.app_version must be a string';

  const device = input.device;
  if (!isPlainObject(device)) return 'session.device must be an object';

  const survey = input.survey ?? null;
  if (survey !== null && !isPlainObject(survey)) return 'session.survey must be an object';

  const adult_form = input.adult_form ?? null;
  if (adult_form !== null && !isPlainObject(adult_form)) return 'session.adult_form must be an object';

  const current_step = input.current_step ?? null;
  if (current_step !== null && typeof current_step !== 'string') return 'session.current_step must be a string';

  return {
    id,
    code,
    grade,
    division: division as string | null,
    consent,
    started_at,
    ended_at: ended_at as string | null,
    end_reason: end_reason as string | null,
    app_version: app_version as string | null,
    device,
    survey: survey as Record<string, unknown> | null,
    adult_form: adult_form as Record<string, unknown> | null,
    current_step: current_step as string | null,
  };
}

function validateEvent(input: unknown, index: number): EventInput | string {
  if (!isPlainObject(input)) return `events[${index}] must be an object`;

  const seq = input.seq;
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0) {
    return `events[${index}].seq must be an integer >= 0`;
  }

  const client_t = input.client_t;
  if (!isParseableDate(client_t) && typeof client_t !== 'number') {
    return `events[${index}].client_t must be an ISO date or epoch ms`;
  }
  const clientTIso = typeof client_t === 'number' ? new Date(client_t).toISOString() : (client_t as string);
  if (Number.isNaN(Date.parse(clientTIso))) return `events[${index}].client_t must be a parseable date`;

  const type = input.type;
  if (typeof type !== 'string' || !EVENT_TYPE_RE.test(type)) {
    return `events[${index}].type must match ^[a-z_]{1,40}$`;
  }

  const payload = input.payload ?? {};
  if (!isPlainObject(payload)) return `events[${index}].payload must be an object`;
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_PAYLOAD_BYTES) {
    return `events[${index}].payload exceeds ${MAX_PAYLOAD_BYTES} bytes`;
  }

  return { seq, client_t: clientTIso, type, payload };
}

export function validateSyncBody(raw: unknown, rawByteLength: number): ValidationResult {
  if (rawByteLength > MAX_BODY_BYTES) {
    return { ok: false, status: 413, message: `body exceeds ${MAX_BODY_BYTES} bytes` };
  }
  if (!isPlainObject(raw)) return { ok: false, status: 400, message: 'body must be an object' };

  const session = validateSession(raw.session);
  if (typeof session === 'string') return { ok: false, status: 400, message: session };

  const eventsRaw = raw.events;
  if (!Array.isArray(eventsRaw)) return { ok: false, status: 400, message: 'events must be an array' };
  if (eventsRaw.length > MAX_EVENTS_PER_BATCH) {
    return { ok: false, status: 400, message: `events exceeds ${MAX_EVENTS_PER_BATCH} per batch` };
  }

  const events: EventInput[] = [];
  for (let i = 0; i < eventsRaw.length; i++) {
    const ev = validateEvent(eventsRaw[i], i);
    if (typeof ev === 'string') return { ok: false, status: 400, message: ev };
    events.push(ev);
  }

  return { ok: true, value: { session, events } };
}
