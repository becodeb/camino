# Data dictionary — pilot playtest ("prueba piloto")

Every table, column and event type the pilot writes, which research question
(numbered 1–9 in `docs/prompts/prueba-piloto.md` §"What we want to learn")
each one serves, the SQL views, retention, deletion and export. T2 onward
must emit event payloads exactly matching the shapes below — this document
is the contract between the front end (T2–T8) and the analysis that will
read this data later.

## Anonymous by design

`sessions` and `events` never store a name, a photo, audio or free text
typed by a child. `device` is whatever the client puts there (user agent,
screen size, touch capability); the server never adds the request IP or any
other header to it. Under Argentina's Ley 25.326 (art. 2), data that cannot
be tied to a determined or determinable person is not personal data — this
schema is designed to stay that way. If a teacher follows individual
children, the names stay on the teacher's own paper, never in this database.

## Table `sessions`

One row per playtest session (one child, one sitting).

| Column | Type | Meaning | Research question |
|---|---|---|---|
| `id` | uuid, PK | Client-generated session id. | — |
| `code` | text | The anonymous session code shown to the adult (e.g. "Zorro 27"), for matching with the adult's paper notes. | 3 |
| `grade` | smallint 1–5 | Grade (1ro–5to). | all, as the grouping dimension |
| `division` | text, 1 letter or null | Optional division letter. | grouping only |
| `consent` | boolean | Adult confirmed the session at setup. | — |
| `started_at` | timestamptz | When the session began. | 5 (duration, idle) |
| `ended_at` | timestamptz, nullable | When the session ended (set on goodbye or an adult end-session gesture). | 5 |
| `end_reason` | text, nullable | `'completed'` (the child reached the goodbye), `'adult_ended'` (the adult's hidden "end the session"; the survey still follows), `'abandoned'` (set by the client when a new session starts on the device while this one never ended, e.g. a reload mid-session; `ended_at` is then its last event's time). | 5 |
| `app_version` | text, nullable | Front-end build version at the time of the session. | — |
| `device` | jsonb | `{ua, w, h, vw, vh, dpr, touch, lang}` as reported by the client: user agent, screen and viewport size in CSS pixels, device pixel ratio, touch capability, browser language. | 1 (device capability vs. tool failures) |
| `survey` | jsonb, nullable | See "survey_answer" below; the final answers, keyed by question. | 9 |
| `adult_form` | jsonb, nullable | The adult's post-session form: `{engagement: 'low'|'mid'|'high', help_needed: 'none'|'some'|'a_lot', comment?: string}`. | 3, 5 |
| `current_step` | text, nullable | Last known flow step (`'setup'`, `'code'`, `'character'`, `'tool_check'`, `'ladder'`, `'free_play'`, `'typing'`, `'wardrobe'`, `'survey'`, `'goodbye'`, `'adult_form'`), for the admin page's live "where is each child" view. | 5 |
| `created_at` | timestamptz | First time this session row was written. | — |
| `last_seen_at` | timestamptz | Updated on every sync; drives the admin page's "active now" indicator. | 5 |

## Table `events`

One row per instrumented event, append-only.

| Column | Type | Meaning |
|---|---|---|
| `session_id` | uuid, FK → sessions.id ON DELETE CASCADE | |
| `seq` | integer ≥ 0 | Per-session sequence number, assigned by the client. `(session_id, seq)` is the unique key that makes retries idempotent. |
| `client_t` | timestamptz | When the client recorded the event (used for durations). |
| `server_t` | timestamptz | When the server accepted it (`now()` at insert). |
| `type` | text, `^[a-z_]{1,40}$` | One of the event types below. |
| `payload` | jsonb | Shape depends on `type`; see below. Validated ≤ 8 KB per event. |

## Event types and payload shapes

Every payload is a plain JSON object. Optional fields are marked `?`.

### `tool_check`
Tap/drag/▶/↺/✋ on the two tiny tool-check levels. **RQ 1.**
```
{ control: 'tap' | 'drag' | 'play' | 'reset' | 'help', success: boolean }
```

### `level_start`
Opens any level (ladder item, free-play activity, probe). **RQ 4, 5.**
```
{ level_id: string, activity?: string, format?: 'solve'|'complete'|'fix'|'predict'|'save_blocks' }
```
`activity` names the free-play menu entry (e.g. `'sheet'`, `'recess'`,
`'guardas'`, `'editor'`, `'corkboard'`, `'rule_game'`, `'game_maker'`,
`'text_probe'`); `v_activity_time` groups by it.

### `run`
One press of ▶ inside a level (T2 logs it for walking, song, guarda and
predict pages through the level's LevelNav), logged when the run ends (its
`client_t` is the end of the animation). **RQ 2, 4.**
```
{
  level_id: string,
  result: 'win'|'bump'|'short'|'wrong_note'|'smudge'|'wrong_guess'|'empty'|'incomplete'|'no_guess'|string,
  blocks_used: number,           // cards in the notebook (a repeat counts itself and its body; empty lines do not)
  attempt: number,               // 1, 2, 3… presses of ▶ on this level
  program: string,               // the program as run, one line: `right right rep3(up) _` (`_` an empty line, `repgoal(…)`, `rep?(…)` a missing count)
  after_ghost: boolean,          // a ghost-hand demo (help 2 or 3, or the concept intro) played since the previous run
  help_step: number,             // automatic help step reached so far on this level (0–3)
  worlds?: string[],             // several worlds: each one's 'win' | 'crash' | 'short'
  culprit?: string,              // the block that tripped (its ref key in the notebook, e.g. '2' or '1:0')
  guess?: {c, r}, final?: {c, r} // predict pages: the cell tapped and where the character ended
}
```
`result`: `bump` a walk that crashed (rock, edge, closed pot), `short` it
ended before the goal, `wrong_note` a song that played a wrong beat,
`smudge` a guarda that left the guide, `wrong_guess` a predict page whose
character ended elsewhere; `empty`, `incomplete` (a complete page with a
line or count still missing) and `no_guess` are presses of ▶ that ran
nothing. The 3ro rule game (realtime pages) does not log `run` yet (T4).

### `level_end`
Closes a level. **RQ 2, 4, 5.**
```
{
  level_id: string,
  activity?: string,
  outcome: 'win' | 'fail' | 'skipped',
  time_ms: number,
  attempts: number,
  help_levels: number,          // how many of the 3 automatic help steps were shown
  blocks_used?: number,
  blocks_optimal?: number,
  adult_helped: boolean          // true if an adult_help happened during this level
}
```
`v_session_summary.levels_won` counts `outcome = 'win'`. `help_levels` is the
highest automatic help step shown (0–3); `blocks_used` the last run's
cards; `blocks_optimal` the page's reference solution's cards. `outcome` is
`skipped` when the flow moved on without the page being solved (the
adult's end-session or skip); T4's ladder sets `fail` by its floor rule. A
level_end also carries whatever the step merges in (`extra`: the ladder's
`concept`, `rung`, `item`; T2's stand-in ladder `item`, `sample: true`).

### `help`
The child pressed ✋ (any of its three automatic steps). **RQ 3.**
```
{ level_id: string, step: 1 | 2 | 3 }
```
Step 1 says the instruction again and makes the goal glow; step 2 is the
next-step hint with the ghost hand; step 3 is the solution hint (the way the
page's solution walks, drawn as footprints on the board; on songs, guardas
and the rule game it falls back to the next-step hint). A fourth press
raises the character's hand (`call_adult`).

### `ghost_demo`
A demonstration played on the page. **RQ 3.**
```
{ level_id: string, kind: 'hint' | 'footprints' | 'intro' }
```
`hint`: ✋ step 2 (or step 3's fallback), the ghost hand shows the next
thing to do; `footprints`: ✋ step 3, the solution's way on the board;
`intro`: the concept demo the page plays by itself (a new idea, after a full
notebook or a failed run). Events are append-only, so "does the demo lead
to success" is read from the next `run` on the same level, which carries
`after_ghost: true`.

### `call_adult`
The child called the adult: the character raises its hand on screen. **RQ 3.**
```
{ level_id?: string, reason: 'help_held' | 'help_step_3', help_step: number, hand_up: boolean }
```
`help_held`: ✋ kept pressed ~1 s; `help_step_3`: ✋ pressed again after
the third automatic help. `help_step` is the automatic help reached on the
level (0–3). Several calls in a row keep one hand up (`hand_up: true` on
the repeats).

### `adult_help`
The adult resolved a call (long press on the raised hand, which lowers
it), or logged help given without a call (long press on the top-left
corner → "Registrar ayuda"). **RQ 3.**
```
{ level_id?: string, kind: 'instruction' | 'tool' | 'hint' | 'solved_together', prompted: boolean, duration_ms?: number }
```
`prompted` is `false` for help logged without a `call_adult`;
`duration_ms` (only when prompted) is the time from the call that raised
the hand to the adult's answer. The level open at the time gets
`adult_helped: true` on its `level_end`.

### `speak`
The child replayed the spoken instruction (🔊). **RQ 3.**
```
{ level_id: string }
```

### `drag`
One drag gesture of a block (palette ↔ notebook). **RQ 1.**
```
{ level_id: string, phase: 'start' | 'drop', success?: boolean, outcome?: string, from?: 'palette' | 'program' }
```
`success`, `outcome` (the editor's: `add`, `move`, `remove`, `cancel`,
`rejected`, `noop`…) and `from` are present on `phase: 'drop'`; `success`
means the program changed.

### `tap_add`
A block added by tapping the palette instead of dragging (counts toward
RQ 1's "tap-to-add instead of drag"); a tap on a full notebook is not
logged. **RQ 1.**
```
{ level_id: string }
```

### `choice`
A free-choice made by the child. **RQ 5, 6.**
```
{ activity?: string, door?: 'easy' | 'medium' | 'hard', character?: 'brote'|'mina'|'pliegue'|'ovillo', outfit_id?: string, seed_id?: string }
```
One event type covers the character pick (sheet 1), the free-play menu, the
door difficulty and wardrobe/seed choices; only the relevant fields are set.
The character step logs `{activity: 'character', character}` on every pick
(a child may change their mind; the last one counts).

### `ladder_step`
One item of the fixed placement-ladder item bank. **RQ 2.**
```
{ concept: string, rung: number, item: string, result: 'pass' | 'fail' | 'floor', next: string | null, time_ms: number, help_levels: number }
```
`concept` is one of the ladder's named concepts (sequence, long_sequence,
fix_predict, repeat, repeat_pattern, before_after_repeat, fog_si,
three_worlds, events_rules_score); `rung` is that concept's difficulty step.
`v_ladder_ceiling` takes the max `rung` with `result = 'pass'` per
`(session_id, concept)`.

### `typing`
One keystroke in "Teclas del bosque". **RQ 7.**
```
{ key: string, expected: string, correct: boolean, latency_ms: number }
```

### `wardrobe`
Time/choices in the wardrobe step. **RQ 6.**
```
{ action: 'open' | 'close' | 'equip', outfit_id?: string, duration_ms?: number }
```

### `garden_view`
The child looked at their session's garden (T2: the goodbye screen, with
the seeds grown this session; logged when it closes). **RQ 6.**
```
{ duration_ms?: number, seeds?: number }
```

### `survey_answer`
One spoken survey question answered with drawn faces/pictures. **RQ 9.**
```
{ question: 'liked' | 'difficulty' | 'favorite_activity' | 'play_again', answer: string }
```
`liked`: `'yes'|'mid'|'no'`. `difficulty`: `'easy'|'mid'|'hard'`.
`favorite_activity`: the activity id tapped, among the activities the child
did this session (`character`, `ladder`, `tool_check`, `typing`, `wardrobe`,
and the free-play entries' `activity` ids); asked only when there are two
or more. `play_again`: `'yes'|'no'`. The first tap answers (the choice is
said aloud and the next question comes). The
full set of answers is also mirrored onto `sessions.survey` (keyed by
`question`) when the survey step ends, so a session's answers can be read
without scanning events.

### `idle`
No pointer or key input for 30 s. One event per idle stretch, logged when
input resumes (or when the tab is hidden); time with the tab hidden does not
count. **RQ 5.**
```
{ step: string, duration_ms: number }
```

### `visibility`
The browser tab was hidden or shown (proxy for attention/offline stretches).
**RQ 5.**
```
{ state: 'hidden' | 'visible' }
```

### `error`
A client JS error (`window.onerror` or an unhandled promise rejection), for
debugging the pilot itself (not a research signal). Only the message (≤ 300
characters) and the script's file name and position, never a URL with its
host or query. Deduplicated (the same error within 30 s is logged once) and
capped at 20 per page load.
```
{ message: string, source?: string, line?: number, col?: number }
```

### `step`
The session moved to another flow step (the same change also updates
`sessions.current_step`). **RQ 5.**
```
{
  from: string | null,          // the step left (null for the first one)
  to: string,                   // one of the current_step values above
  reason: 'start' | 'next' | 'skip' | 'end_now',
  time_ms?: number,             // time spent on `from`
  budget_ms?: number,           // `from`'s planned time (recorded, not enforced)
  over_budget?: boolean
}
```
`skip` is the adult skipping a step (or a step with nothing to show);
`end_now` is the adult's "end the session" gesture (straight to the survey).

## How the client sends (offline queue)

`src/playtest/telemetry.ts`. Every event is stored first in the browser
(`localStorage` key `camino.piloto.queue.v1`, or memory when storage is
blocked) with its per-session `seq` (0, 1, 2…) and `client_t`. A sender posts
`POST /api/sync` with the session record and up to 100 of its events every
5 s, or at once when 25 are waiting (the server allows 1500 posts per
IP per minute, an in-memory counter that never stores the IP: a class of ~25
devices behind one school NAT posts about 300); the `acked` seqs leave the queue. A
network error, a 429 or a 5xx is retried with exponential backoff (1 s,
2 s, 4 s … capped at 60 s, with jitter) and never drops anything; only a 400
drops the batch (with a console warning), a 413 halves the batch size. When
the page is hidden or closed the queue is flushed with `fetch(…, {keepalive:
true})` (≤ 60 KB per request). Sessions left in the queue by an earlier page
load sync on the next load. Session changes (`current_step`, `ended_at`,
`end_reason`, `survey`, `adult_form`) travel in the same posts. Gaps in `seq`
for a session therefore mean a 400-dropped batch, never a network failure.

## SQL views

Defined in `server/migrations/001_init.sql`, always available for ad hoc
analysis (`psql`, or any tool that can read Postgres directly).

- **`v_ladder_ceiling`** — one row per `(session_id, concept)`: the highest
  `rung` reached with `result = 'pass'`. Feeds RQ 2 (prior knowledge, next
  year's starting points).
- **`v_session_summary`** — one row per session: duration, a jsonb map of
  event-type counts, `levels_won`, `calls_to_adult`, `adult_helps`, and the
  session's overall `ladder_ceiling_rung` (max across concepts). A fast
  per-session overview.
- **`v_activity_time`** — one row per `(session_id, activity)`: seconds
  spent, computed by pairing each `level_end` with the nearest preceding
  `level_start` in the same session (grouped by a running count of
  `level_start` events, since Postgres does not support `FILTER` on a
  non-aggregate window function like `lag()`). This is an approximation: a
  child is assumed to never have two levels open at once, which holds for
  this app. Feeds RQ 5 (engagement, time per activity).
- **`v_typing_by_grade`** — one row per grade: attempt count, `accuracy_pct`,
  and `median_latency_ms` from `typing` events. Feeds RQ 7.

## Retention and deletion

`RETENTION_DAYS` (env var, default 180) is read at startup; the server
deletes `sessions` older than that many days (by `started_at`), cascading to
their `events`, once at boot and every 24h after.

**To delete one session** (a check or test session, or one a school asks to
remove): `DELETE /api/admin/sessions/:id` (Bearer `ADMIN_TOKEN`) removes the
session row and, by `ON DELETE CASCADE`, all its events (200 `{ok, deleted}`,
404 unknown id, 400 malformed id). The `/admin` page has a "Borrar" button per
row that asks for confirmation first.

**To delete everything immediately** (e.g. end of pilot, or a request to
wipe the data early):
- From Coolify's terminal on the `db` container: `psql -U camino -d camino_prueba -c "TRUNCATE sessions CASCADE;"`.
- Or drop the whole database by deleting the `db` service's named volume
  from Coolify (irreversible — only do this once the pilot is fully done).

## Export and analysis

- `GET /api/export?format=json` → `{sessions, events, exported_at, app_version}`
  (Bearer `EXPORT_TOKEN`).
- `GET /api/export?format=csv&table=sessions|events` (default `events`) →
  one CSV, jsonb columns serialized as JSON strings, RFC 4180 quoting
  (Bearer `EXPORT_TOKEN`).
- `GET /api/admin/summary` and `GET /api/admin/export` (same shapes, Bearer
  `ADMIN_TOKEN`) — used by the `/admin` page, also usable directly.
- `tools/export-playtest.mjs` — no dependencies; reads `EXPORT_TOKEN` and
  `PLAYTEST_URL` from `~/.credentials/camino-prueba.env` (never printed),
  fetches all three exports and writes them to `exports/` (gitignored) as
  `playtest-<YYYY-MM-DD-HHMM>.json` / `.sessions.csv` / `.events.csv`. Run
  it with `node tools/export-playtest.mjs`.
