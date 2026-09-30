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
One gesture of the tool check (1–2 min, before the ladder): two tiny pages
built with the real engine and 1ro's arrow (`tool-1`: 2×2, one step to the
seed; `tool-2`: 4×2, three steps), five gestures asked aloud one at a time,
each circled with a blue pen ring: `tap` (tap the arrow in the palette:
tap-to-add), `play` (▶ Probar), then `drag` (drag the arrow into the
notebook), `reset` (↺ Volver a empezar), `help` (✋ once). A gesture not done
in 20 s is shown once by the ghost hand (`ghost_demo` kind `tool`) and said
again; 20 s later the check moves on (`done: false`). One event per gesture,
in that order. **RQ 1.**
```
{
  gesture: 'tap' | 'play' | 'drag' | 'reset' | 'help',
  done: boolean,            // the gesture asked was done (false: moved on after 40 s, or see `via`)
  time_ms: number,          // from the moment it was asked to the moment it was seen (for `play`, the run's end)
  attempts: number,         // tries that answered it: taps, runs, drag drops (dropped nowhere included), ↺ and ✋ presses
  shown_by_ghost: boolean,  // the ghost hand showed it (20 s without it)
  level_id: 'tool-1' | 'tool-2',
  via?: 'drag' | 'tap'      // the block got in the other way: a drag when a tap was asked (moves on, done false); a tap when a drag was asked (keeps waiting)
}
```
The pages' own `drag` (start/drop, success, from) and `tap_add` events are
logged as everywhere (`level_id` `tool-1`/`tool-2`), so drag attempts vs
successes and taps are read from them too. `level_start`/`level_end` carry
`activity: 'tool_check'`.

### `level_start`
Opens any level (ladder item, free-play activity, probe). **RQ 4, 5.**
```
{ level_id: string, activity?: string, format?: 'solve'|'complete'|'fix'|'predict'|'save_blocks' }
```
`activity` is the step or the free-play menu entry: `'tool_check'`,
`'ladder'`, and in free play `'sheet'`, `'recess'`, `'guardas'`, `'editor'`
(the workshop: its test page and the corkboard's cards too), `'rule_game'`,
`'game_maker'`, `'text_probe'` (see "Free play" below); `v_activity_time`
groups by it. A free-play page also carries where it is (in `level_start`
and `level_end`):
```
{ …, sheet?: number,            // the 1ro sheet the page belongs to
  page?: 'core' | 'extra' | 'boss' | 'test' | 'card' | 'core_gold' | 'extra_gold' | 'boss_gold'  // sheets; the rule game: 'core' | 'free'
  door?: 'easy' | 'medium' | 'hard' }   // an extra page: the door it is behind
```
`test` is the workshop's page where the author plays the level being made,
`card` a corkboard level played; voluntary extras are the `extra` and `boss`
pages.

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
nothing.

The 3ro rule game (realtime pages: `3ro-1`, `3ro-2`) logs one `run` per game,
from ▶ to ■ Parar, ↺ or the win: `result` is `win` (the goal reached, or the
jar full), `stopped` (stopped after the child pressed at least one arrow:
a failed run) or `no_play` (stopped before any arrow: not a failed run, like
`empty`); `program` is the rules as one line (`key:right(right)
touch:seed(score)`), `blocks_used` their cards (each hat and each action),
plus `keys` (arrows the child pressed while it ran; the ghost hand's do not
count) and `score` (points in the jar). A game still running when the page
ends logs no `run`.
```
{ …, keys?: number, score?: number }   // rule game only
```
A failed run (the ladder's "two failed runs") is a run that ran and did not
win: not `empty`, `incomplete`, `no_guess` or `no_play`, and not the given
program run unchanged on a fix page (seeing the mistake is part of fixing it).

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
adult's end-session or skip). A level_end also carries whatever the step
merges in (`extra`: the ladder's `concept`, `rung`, `item`, `check`);
`level_start` carries the same. On a ladder item `outcome` is `fail` when the
ladder ended the item (two failed runs, three minutes, or a failed run after
the solution hint or an adult's help); a solved page the child does not turn
turns by itself after 8 s. `blocks_optimal` of a rule game counts its
reference rules' cards.

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
{ level_id: string, kind: 'hint' | 'footprints' | 'intro' | 'tool' }
```
`hint`: ✋ step 2 (or step 3's fallback), the ghost hand shows the next
thing to do; `footprints`: ✋ step 3, the solution's way on the board;
`intro`: the concept demo the page plays by itself (a new idea, after a full
notebook or a failed run; the 3ro rule game's first-page demo too); `tool`:
the tool check showing a gesture not done in 20 s. Events are append-only,
so "does the demo lead
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
{ activity?: string, visit?: number, door?: 'easy' | 'medium' | 'hard', sheet?: number, character?: 'brote'|'mina'|'pliegue'|'ovillo', where?: 'wardrobe' }
```
One event type covers the character pick (sheet 1), the free-play menu and
the door difficulty; only the relevant fields are set. The character step
logs `{activity: 'character', character}` on every pick (a child may change
their mind; the last one counts); a character changed in the wardrobe logs
the same with `where: 'wardrobe'`. A free-play pick is `{activity, visit}`
(`visit`: 1, 2, 3… the activities picked so far, the same number as its
`activity_end`); a door chosen is `{activity: 'sheet', door, sheet}` (logged
when the child opens a page behind another door than the page before: from
the doors page or the bar). Wardrobe pieces are in `wardrobe` events.

### `ladder_step`
One item of the fixed placement-ladder item bank (`src/playtest/ladder.ts`),
logged when the item ends. **RQ 2, 3, 4.**
```
{
  concept: string,          // the rung's concept (table below)
  rung: number,             // 1–12, the item bank's order (easiest first)
  item: string,             // the page played (level id)
  format: 'solve' | 'complete' | 'fix' | 'predict',
  check: 'climb' | 'floor', // floor: the one easier item tried after the first non-pass
  result: 'pass' | 'fail',
  next: string | null,      // the next item's id, null when the ladder stops here
  time_ms: number,
  help_levels: number,      // automatic help steps shown (0–3)
  adult_helped: boolean,
  attempts: number,         // presses of ▶ (level_end's)
  outcome: 'win' | 'fail' | 'skipped'  // level_end's
}
```

The item bank (the same pages for every child):

| Rung | Concept | Format | Item |
|---|---|---|---|
| 1 | `sequence` (short) | solve | `1ro-h1-2` Entre dos piedras |
| 2 | `long_sequence` | solve | `1ro-h2-1` Un camino largo |
| 3 | `fix` | fix | `1ro-h3-3` Casi llega a la maceta |
| 4 | `predict` | predict | `1ro-h3-4` Un camino con vueltas |
| 5 | `repeat` | solve (ghost-hand intro) | `1ro-h4-1` Repetir: muchos pasos, pocos renglones |
| 6 | `repeat_count` (complete the count) | complete | `1ro-h5-1` ¿Cuántas veces para llegar a la esquina? |
| 7 | `repeat_pattern` (two-block body) | solve | `1ro-h6-2` La escalera: repetir → ↑ |
| 8 | `before_after_repeat` | solve | `1ro-h13-2` Subir la cascada |
| 9 | `fog_si` ("si" in fog) | solve | `2do-1` Niebla |
| 10 | `three_worlds` | solve | `2do-2` Tres caminos, un programa |
| 11 | `events_rules` (key rules) | solve (rule game) | `3ro-1` Mi primer juego |
| 12 | `rules_score` (touch rule, score) | solve (rule game) | `3ro-2` Siempre que Brote toque una semilla |

Rules: entry by grade (1ro rung 1, 2do 2, 3ro 5, 4to 7, 5to 9). `pass` =
solved with fewer than 3 help steps (the solution hint never shown) and no
adult help during it; anything else is `fail`: the solution hint or adult
help was used, two failed runs, or three minutes without solving it (after
the solution hint or an adult's help the child keeps one more try: the next
failed run ends the item). After a pass, one rung up (a pass on rung 12
stops). After the first non-pass: if the rung below was not passed in this
ladder, it is tried once (`check: 'floor'`) and the ladder stops whatever
happens; if it was passed, or there is none (rung 1), the ladder stops. At
most 10 items or 12 minutes (checked between items, so an item open at 12
minutes finishes). The child never sees a result: between items the
character walks on to the next page, and at the end it cheers ("¡Muy bien!
Vamos a jugar").

A rule game (rungs 11–12) is solved when the game is won (`3ro-1`: Brote
reaches the seed with the arrows; `3ro-2`: five points in the jar); a failed
run there is a game stopped (■ or ↺) after the child pressed an arrow.

The ceiling is the highest rung passed. `v_ladder_ceiling` takes the max
`rung` with `result = 'pass'` per `(session_id, concept)` (one rung per
concept, so a row means that concept's item was passed), and
`v_session_summary.ladder_ceiling_rung` the max over the session: the same
number as `ladder_end.ceiling_rung`.

### `ladder_end`
The ladder stopped (once per session that reached it). **RQ 2.**
```
{
  entry_rung: number,
  ceiling_rung: number | null,  // highest rung passed, null if none
  items: number,
  time_ms: number,
  reason: 'top' | 'ceiling' | 'floor' | 'bottom' | 'max_items' | 'max_time' | 'left'
}
```
`top`: rung 12 passed; `ceiling`: a fail right above a passed rung;
`floor`: after the floor check; `bottom`: rung 1 failed; `max_items`,
`max_time`: the caps; `left`: the flow moved on mid-ladder (the adult ended
the session or skipped the step; the item open then has no `ladder_step`,
its `level_end` says `skipped`).

### `typing`
One keystroke in "Teclas del bosque". **RQ 7.**
```
{ key: string, expected: string, correct: boolean, latency_ms: number }
```

### `activity_end`
The child left a free-play activity (see "Free play" below). One per
`choice` of the menu, logged once the activity is off screen (after its
last page's `level_end`). **RQ 5.**
```
{
  activity: string,     // the menu entry
  visit: number,        // its choice's `visit`
  time_ms: number,      // from the pick to leaving it (every page in it, and the pages that are not levels: doors, editor, corkboard)
  levels: number,       // level pages ended in it (any outcome)
  wins: number,         // of them, solved
  extras: number,       // of them, voluntary extras solved (pages behind a door, the boss)
  reason: 'menu' | 'done' | 'budget' | 'left'
}
```
`menu`: the child pressed "volver al menú"; `done`: the activity ended by
itself (the boss's or the doors page's page to turn, the rule game's last
page won, a probe done); `budget`: free play's time ran out on a page that
is not a level; `left`: the flow moved on (the adult skipped the step or
ended the session; the open page's `level_end` may then come after it).

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

### Free play

Step `free_play` (`src/playtest/FreePlay.tsx`, menus in `freePlay.ts`). A
drawn menu of 3–4 picture cards by grade; each card's name is said when the
menu opens and when the card is held (a tap picks it). **RQ 5.**

| Grade | Menu (in order) |
|---|---|
| 1ro | `sheet` (sheet 6 "La escalera", its doors and boss), `recess` (sheet 9, the music recess), `guardas` (sheet 14), `editor` (sheet 7's workshop and corkboard) |
| 2do | `sheet` (sheet 8 "Zigzag"), `recess`, `guardas`, `editor` (sheet 7) |
| 3ro | `rule_game`, `sheet` (sheet 13 "Antes y después"), `recess`, `editor` (sheet 7) |
| 4to | `rule_game`, `editor` (sheet 15, the workshop with few lines), `recess`, `game_maker` (T7's probe, once registered) |
| 5to | `rule_game`, `editor` (sheet 15), `recess`, `text_probe` (T8's probe, once registered) |

`rule_game` plays `3ro-1`, `3ro-2` (a page already solved is skipped) and
then `pp-reglas`: the child's own game (every key, move and the point, no
rules to start with, eight seeds to catch). The activities are the year's
own screens with the session's progress: the doors open after the sheet's
pages with a red ribbon, the boss after the core pages, a boss won sends its
critter or plant to the goodbye garden. Per pick: `choice` {activity,
visit}, the pages' events with `activity` (and `sheet`, `page`, `door`), a
door's `choice`, and `activity_end`.

Time: `FREE_PLAY_BUDGET_MS` = 12 minutes for every grade (`?libre=<minutes>`
in the URL sets another, 1–30). A level is never cut: when the time is over,
free play moves on from the menu at once, after the level on screen ends
(the child turns it, or moves to another page), or, on a page that is not a
level (the doors, the editor, the corkboard), at the next page or after two
minutes. Then the character cheers "¡Ahora vamos a otro juego!" and the next
step comes. The adult's corner menu can skip the step at any time (the open
activity's `activity_end` says `left`).

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

Defined in `server/migrations/001_init.sql` (and `002_activity_time.sql`), always available for ad hoc
analysis (`psql`, or any tool that can read Postgres directly).

- **`v_ladder_ceiling`** — one row per `(session_id, concept)`: the highest
  `rung` reached with `result = 'pass'`. Feeds RQ 2 (prior knowledge, next
  year's starting points).
- **`v_session_summary`** — one row per session: duration, a jsonb map of
  event-type counts, `levels_won`, `calls_to_adult`, `adult_helps`, and the
  session's overall `ladder_ceiling_rung` (max across concepts). A fast
  per-session overview.
- **`v_activity_time`** — one row per `(session_id, activity)`: seconds
  spent. A free-play activity counts its visits whole: the sum of its
  `activity_end.time_ms` (the doors page, the editor and the corkboard are
  not level pages, so its pages alone would miss them). Any other activity
  (the tool check, the ladder, the typing minigame) counts its level pages,
  each `level_end` paired with the nearest preceding `level_start` in the
  same session (grouped by a running count of `level_start` events, since
  Postgres does not support `FILTER` on a non-aggregate window function like
  `lag()`; a child never has two levels open at once). Redefined in
  `server/migrations/002_activity_time.sql`. Feeds RQ 5 (engagement, time
  per activity).
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
