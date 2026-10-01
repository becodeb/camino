// Shared shapes for the sync payload. Validation lives in lib/validate.ts;
// these types describe what a validated payload looks like once accepted.

export interface SessionInput {
  id: string;
  code: string;
  grade: number;
  division: string | null;
  consent: boolean | null;
  started_at: string;
  ended_at?: string | null;
  end_reason?: string | null;
  app_version?: string | null;
  device: Record<string, unknown>;
  survey?: Record<string, unknown> | null;
  adult_form?: Record<string, unknown> | null;
  current_step?: string | null;
  /** A demo session (T14): stored, but out of the export, /admin and the views; deleted after 24 h. */
  demo?: boolean;
}

export interface EventInput {
  seq: number;
  client_t: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface SyncBody {
  session: SessionInput;
  events: EventInput[];
}
