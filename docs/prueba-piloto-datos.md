# Data dictionary — pilot playtest ("prueba piloto")

Every table, column and event type the pilot writes, which research question
(numbered 1–9 in `docs/prompts/prueba-piloto.md` §"What we want to learn")
each one serves, the SQL views, retention, deletion and export. T2 onward
must emit event payloads exactly matching the shapes below — this document
is the contract between the front end (T2–T8) and the analysis that will
read this data later.

## Anonymous by design (unless the T38 name screen is on)

`sessions` and `events` never store a photo, audio or free text typed by a
child. `device` is whatever the client puts there (user agent, screen size,
touch capability); the server never adds the request IP or any other header
to it. Under Argentina's Ley 25.326 (art. 2), data that cannot be tied to a
determined or determinable person is not personal data — this schema is
designed to stay that way whenever the name screen is off (every grade
except 4to/5to by default, and any grade with `?nombre=no`).

**T38 exception:** 4to and 5to (by default) and any grade with `?nombre=si`
show a first screen asking the child's name, so the teacher can read each
child's level individually and spot who knows less than expected. When this
is on, `sessions.child_name` holds that name and **the session is no longer
anonymous: it is personal data of a minor**, kept for the school's own
internal use (the user — the school — decides how that is covered; this app
only stores what it is given). A name is **never shown to another child**
(no rankings, no name on the other children's screens, never spoken aloud —
NamePrompt.tsx's own note on why) and never leaves the session row it
belongs to (it is not mirrored into any event payload). Same retention as
the rest of the row (`RETENTION_DAYS`); a demo session's name is discarded
with it after 24 hours, like everything else demo. If a teacher follows
individual children without this screen on, the names stay on the teacher's
own paper, never in this database.

## Table `sessions`

One row per playtest session (one child, one sitting).

| Column | Type | Meaning | Research question |
|---|---|---|---|
| `id` | uuid, PK | Client-generated session id. | — |
| `code` | text | An anonymous session code (e.g. "Zorro 27"). Round 1 showed it to the adult for paper notes; since round 2 (2026-10-01) the kid app never shows it: it is only for the admin page (telling sessions apart, "Borrar"). | 3 |
| `grade` | smallint 1–5 | Grade (1ro–5to). T19: `?grado=1..5` (also `?grade=`) in the bookmark link preselects it — the setup's cards are skipped, the session starts right away as if that card were tapped (an invalid or missing value falls back to the cards). | all, as the grouping dimension |
| `division` | text, 1 letter or null | Optional division letter. Since T14 the setup has no division buttons: new sessions write `NULL` (the column stays for older rows). | grouping only |
| `consent` | boolean, nullable | Round 1: `true`, the adult ticked "La escuela autorizó esta prueba" at setup. Since round 2 the setup asks no tick (the school's authorization is kept outside the app, and nothing here names a child): new sessions write `NULL` (migration `006_consent_nullable.sql`). | — |
| `started_at` | timestamptz | When the session began. | 5 (duration, idle) |
| `ended_at` | timestamptz, nullable | When the session ended (set on goodbye or an adult end-session gesture). | 5 |
| `end_reason` | text, nullable | `'completed'` (the child reached the goodbye; since T14 also the adult's "end the session" once the core route was done, the green flag), `'adult_ended'` (the adult's hidden "end the session" before the route was done; the survey still follows), `'class_end'` (T14: el docente's "terminar la clase" from `/admin`; since T28, at the end of a non-blocking 10-second countdown banner the child keeps playing through, or at once with no countdown for a command the device sees too late — see `class_command`'s `late`), `'demo_ended'` (a demo session ended from the demo bar; demo sessions are never exported), `'abandoned'` (set by the client when a new session starts on the device while this one never ended, e.g. the adult set up a new child without ending the last one, or a tab reloaded more than 2 hours after its last save; `ended_at` is then its last event's time; T22: also what any ending — including `class_end` — becomes when nobody ever did anything in the session, still on the character screen: no `choice` with `activity: 'character'` and no `level_start`, read from the client's own flow state, not from events after the fact). A reload within a session no longer abandons it: the session carries on (see `resume`). | 5 |
| `app_version` | text, nullable | Front-end build version at the time of the session. | — |
| `device` | jsonb | `{ua, w, h, vw, vh, dpr, touch, lang, captions?, captions_set?, sound?, sound_source?, voice?}` as reported by the client: user agent, screen and viewport size in CSS pixels, device pixel ratio, touch capability, browser language; since round 2 `captions` (on-screen text on now: set at the start and updated by every 💬 toggle, see `captions`) and `captions_set` (`'grade'`: the default, on from 3ro; `'setup'`: forced on or off at setup); since T18 `sound` (the effective sound setting now) and `sound_source` (`'admin'`\|`'url'`\|`'adult'`\|`'default'`: which layer decided it, see the `sound` event and the table `class_settings`); since T27 `voice` (this device's "Voz" switch now: `true` unless the adult turned it off here; independent of `sound` — off, speech is silenced but sfx/music keep playing — and, unlike the adult's `sound` override, persisted so it survives a new session on this computer). | 1 (device capability vs. tool failures), 3 (captions, sound, voice) |
| `survey` | jsonb, nullable | See "survey_answer" below; the final answers, keyed by question. | 9 |
| `adult_form` | jsonb, nullable | The adult's form: `{engagement: 'low'|'mid'|'high'|null, help_needed: 'none'|'some'|'a_lot'|null, comment?: string, step?: string}`. Round 1: a step after the goodbye, both answers required. Since round 2 it is optional, from the corner menu ("Comentario del adulto") at any time of the session; any answer may be left out (`null`), saving again replaces it, and `step` is the flow step it was saved on (see the `adult_form` event). Most round-2 sessions will have none. | 3, 5 |
| `current_step` | text, nullable | Last known flow step (`'character'`, `'tool_check'`, `'ladder'`, `'free_play'`, `'typing'`, `'wardrobe'`, `'survey'`, `'goodbye'`, since T14 `'class_end'`, and since T38 `'name'` — only for a session whose name screen was on; T39: `'workshop'` (4to's Game Workshop step); round-1 sessions may also hold `'code'` and `'adult_form'`, steps removed in round 2), for the admin page's live "where is each child" view. T39: that view also reads, from the events already synced (no new column), the ladder's rung on screen (the last ladder `level_start`), the Workshop's core challenge (the last non-free `workshop_challenge`) and whether the Arcade opened (`arcade_open`): "escalera de niveles · escalón 13", "taller de juegos · desafío 4", "Arcade". T41: a 4to session in `free_play` reads "Arcade" (its free play is the Arcade) instead of "juego libre". | 5 |
| `created_at` | timestamptz | First time this session row was written. | — |
| `last_seen_at` | timestamptz | Updated on every sync; drives the admin page's "active now" indicator. Since T14 a device with a session open syncs at least every ~10 s, so this is also the class's "seen" time. | 5 |
| `demo` | boolean, default false | T14: a session played in demo mode (the adult showing or trying the pilot; see "Demo mode" below). Stored like any other, but left out of `/api/export`, `/api/admin/*` lists and counts and every SQL view, and deleted 24 hours after it started. A later sync never turns it back to `false` (migration `008_class_control.sql`). | — |
| `child_name` | text, nullable | T38 (migration `014_child_name.sql`): the child's first name, typed once on "¿Cómo te llamás?" before the character choice — on by default for 4to/5to, optional for any grade via `?nombre=si` (`?nombre=no` always turns it off). `NULL` for every session where that screen is off (the default for 1ro–3ro). Trimmed, control characters stripped, capped at 24 characters, both client-side (`childName.ts`) and again server-side (`validate.ts`) — the server never trusts the client alone. Shown in `/admin`'s live class list (first column, "—" when absent), exported as its own column, and read by `tools/analyze-playtest.mjs`'s per-child lines and profiles (`report.ts`'s `childLabel`: the name when present, else the anonymous `code`). **Makes the session personal data of a minor — see "Anonymous by design" above.** Same retention as the rest of the row; never mirrored into any event payload, never shown to another child. | 3 |

## Table `class_commands`

T14: el docente's class commands from `/admin` ("Quedan 5 minutos",
"Terminar la clase"); T37 adds "Juegos para todos" (`games_all`). No session
or child is named: a command is for "the sessions active now".

| Column | Type | Meaning |
|---|---|---|
| `id` | bigserial, PK | The command's id; each device applies an id once. |
| `kind` | text | `'five_min'` ("quedan 5 minutos"), `'end_class'` ("terminar la clase") or `'games_all'` (T37: "Juegos para todos"). |
| `created_at` | timestamptz | When el docente sent it. |
| `expires_at` | timestamptz | `created_at` + 2 hours: after that no device gets it (a device offline longer than that never ends by an old command). |
| `cancelled_at` | timestamptz, nullable | "Cancelar aviso" / "Cancelar «Juegos para todos»" (`five_min` and `games_all` only; `end_class` is never cancellable, its second tap already confirms it): devices still waiting to apply it drop it. |

Delivery: every `POST /api/sync` answers `{ok, acked, commands}`, where
`commands` lists `{id, kind, at, expires_at, cancelled}` for each live
command the posted session must see: the session started before the
command (the earlier of the device's `started_at` and the server's first
sight of it, `created_at`, so a device clock running ahead does not hide a
session that was playing), it was seen within the 2 hours before the
command (or is syncing for the first time), and the command has not
expired. A device that was offline while it was sent gets it on its first
sync after reconnecting. Demo sessions get commands too (the adult can try
the class control in demo mode). The client logs `class_command` when it
applies one. Rows expired more than 7 days ago are deleted by the
retention job.

## Table `class_settings`

T18 (the silent classroom round): el docente's class-wide sound setting
from `/admin` ("Con sonido" / "Sin sonido" / "Como diga el link"). Unlike
`class_commands` (a one-time instruction each device applies once by its
id), this is a **current value**: one row per key (`key` text PK, `value`
text, `set_at`, `expires_at` nullable), upserted in place (`ON CONFLICT
(key) DO UPDATE`), never accumulating rows. Only one key exists so far:
`sound`, value `'on'`, `'off'` or `'link'` (no class override: each device
decides for itself). Set from `/admin` with a 4-hour expiry, so a class
left muted overnight is not still muted the next morning; past
`expires_at` (or with no row at all) the live value is `'link'`.

Delivery: the public, cheap `GET /api/class-settings` (no auth, rate
limited per IP like `/api/sync`, `cache-control: no-store`) returns
`{sound, expires_at}`; the client calls it once at page load, before the
setup's spoken question, with a ~1.5 s timeout (a dead network falls back
to the device's own `?sonido=`/localStorage value, never blocking). Every
`POST /api/sync` answer also carries `{settings: {sound}}`, the exact same
live value, so a change from `/admin` reaches a device already playing
within one sync cycle (about 10 s), regardless of when its session
started — the opposite of `class_commands`' once-per-id semantics, since a
setting has one current value, not a sequence of one-time instructions.
`/api/admin/summary` carries it too, as `sound_setting`, for the page
itself. See the `sound` event below and `sessions.device.sound`/
`sound_source` above for how the client resolves and records the
effective value.

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
One gesture of the tool check (before the ladder): two tiny pages built
with the real engine and 1ro's arrow (`tool-1`: 2×2, one step to the seed;
`tool-2`: 4×2, three steps), five gestures one at a time, each circled with
a blue pen ring and said aloud. **RQ 1.**

Round 2 (2026-10-01; the first try waited 40 s on ✋ and logged a drag as
"tap not done"): three gestures are *asked*: `tap` (put the arrow in the
notebook), `play` (▶ Probar), `drag` (put an arrow in again, "también podés
arrastrarla"); **any equivalent gesture answers them** (a tap or a drag both
put the block in: `via` says which). Not done in 8 s, the ghost hand shows
it (`ghost_demo` kind `tool`) and it is said again; 15 s after it was asked
the check moves on (`done: false`). Two gestures are only *shown*
(`asked: false`): `reset` (↺) and `help` (✋): the ghost hand points at each
at once while it is said what it does, for 5 s; a press in that time is
`done: true`, nothing waits for it. From the first gesture done, a drawn
"seguir" arrow in the bar ends the check at once: the gestures not reached
are logged then, `done: false, skipped: true`. The whole check takes ~30 s
for a child who knows the tool, ~70 s at most. One event per gesture, in
order.
```
{
  gesture: 'tap' | 'play' | 'drag' | 'reset' | 'help',
  done: boolean,            // done by the child (false: moved on, only shown, or skipped)
  asked?: boolean,          // round 2: true for tap/play/drag (waited for), false for reset/help (only shown)
  time_ms: number,          // from the moment it was asked to the moment it was seen (for `play`, the run's end)
  attempts: number,         // tries that answered it: block adds (tap or drag; drags dropped nowhere included), runs, ↺ and ✋ presses
  shown_by_ghost: boolean,  // the ghost hand showed it (an asked gesture after 8 s; a shown one always)
  level_id: 'tool-1' | 'tool-2',
  via?: 'drag' | 'tap',     // how the block got in (tap, drag); round 1: only when it came the "other" way
  skipped?: true            // round 2: "seguir" pressed before this gesture came
}
```
Round-1 rows (no `asked`): `tap` was answered by a drag too but logged
`done: false, via: 'drag'` (the bug the first try showed: read it as done);
`drag` waited for a real drag; all five waited 20 s + 20 s.

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
  guess?: {c, r}, final?: {c, r}, // predict pages: the cell tapped and where the character ended
  variant?: number,              // predict pages with alternates (T30): which puzzle was played (0 = the page's own; a wrong guess swaps to a different one for the next try)
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
ends logs no `run`, except on a page the ladder ended (its caps, round 2):
a game the child pressed arrows in is logged then as `result: 'unfinished'`
(an attempt, not a failed run), so a child who played without ever
stopping the game still has a first attempt.
```
{ …, keys?: number, score?: number }   // rule game only
```
A failed run (the ladder's "two failed runs") is a run that ran and did not
win: not `empty`, `incomplete`, `no_guess`, `no_play` or `unfinished`, and not the given
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
  adult_helped: boolean,         // true if an adult_help happened during this level
  end_reason?: string            // a ladder item the ladder ended: why (see ladder_step)
}
```
`v_session_summary.levels_won` counts `outcome = 'win'`. `help_levels` is the
highest automatic help step shown (0–3); `blocks_used` the last run's
cards; `blocks_optimal` the page's reference solution's cards. `outcome` is
`skipped` when the flow moved on without the page being solved (the
adult's end-session or skip). A level_end also carries whatever the step
merges in (`extra`: the ladder's `concept`, `rung`, `item`, `check`);
`level_start` carries the same. On a ladder item `outcome` is `fail` when the
ladder ended the item, and `end_reason` says why (`runs`, `solution_hint`,
`adult`, `time_cap`, `idle_cap`, `ladder_time`; see `ladder_step`); a solved
page the child does not turn turns by itself after 8 s. `blocks_optimal` of a rule game counts its
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
{ level_id: string, kind: 'hint' | 'footprints' | 'intro' | 'tool', gesture?: string }
```
`hint`: ✋ step 2 (or step 3's fallback), the ghost hand shows the next
thing to do; `footprints`: ✋ step 3, the solution's way on the board;
`intro`: the concept demo the page plays by itself (a new idea, after a full
notebook or a failed run; the 3ro rule game's first-page demo too); `tool`:
the tool check showing a gesture (round 2: `gesture` says which; an asked
one after 8 s, ↺ and ✋ always). Events are append-only,
so "does the demo lead
to success" is read from the next `run` on the same level, which carries
`after_ghost: true`.

### `call_adult`
The child called the adult: the character raises its hand on screen. **RQ 3.**
```
{ level_id?: string, reason: 'help_held' | 'help_step_3', help_step: number, hand_up: boolean }
```
`help_held`: ✋ kept pressed ~1 s (rounds 1–2 only: since T14 holding ✋ is
the adult's question, see `adult_help`, and the child raises the hand only
through the help steps); `help_step_3`: ✋ pressed again after the third
automatic help. `help_step` is the automatic help reached on the
level (0–3). Several calls in a row keep one hand up (`hand_up: true` on
the repeats).

### `call_adult_end`
Round 2: the raised hand went down. **RQ 3** (does the child depend on the
adult: how many calls were answered, and how many the child got past alone).
```
{ level_id?: string, resolved_by: 'adult' | 'self' | 'moved_on', duration_ms: number }
```
`adult`: the adult answered (long press on the hand → what they did; an
`adult_help` with `prompted: true` comes just before); `self`: the child
solved the page with the hand up; `moved_on`: the child (or the flow) left
the page, item, probe phase or step with the hand up and nobody came.
`duration_ms` is the time since the hand went up. Round-1 sessions have no
such event (the hand stayed up until the adult answered or the survey).

### `adult_help`
The adult told how they helped. Since T14 the main way is to **hold ✋ for
~0.8 s** (T25: was 1.5 s) whenever they help a child (any ✋ of a page bar:
levels, the typing game, the probes, the tool check): "¿En qué lo ayudaste?"
opens with the four answers as big buttons, and one tap logs it and closes.
A blue ring fills round ✋ while it is held; a shorter press is the child's
help, exactly as before (the click that ends a held press is swallowed, so
it gives no help step). The same question opens with a long press
(~0.8 s) on the raised hand (which lowers it) and from the corner menu
("Registrar ayuda"). **RQ 3.**
```
{ level_id?: string, kind: 'instruction' | 'tool' | 'hint' | 'solved_together', prompted: boolean, duration_ms?: number, via?: 'help_hold' | 'hand' | 'menu' }
```
`prompted` is `true` when a hand was raised at the time (the answer lowers
it), `false` otherwise; `via` (T14) is how the adult got to the question;
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

### `next_choice`
Round 2: a tap on "¿Cómo seguís?", the screen a sheet shows in free play
after its core pages (instead of the year's three doors and boss), and again
after every extra page and after the challenge. Five drawn choices, said
aloud: three ways on (a gentle hill "más fácil" = door `easy`, a flat path
"igual" = `medium`, a steep hill "más difícil" = `hard`), the challenge
(the boss page) and "otro juego" (back to the menu). **RQ 5, 6.**
```
{ sheet: number, pick: 'easy' | 'medium' | 'hard' | 'boss' | 'menu', n: number, time_ms: number }
```
`n`: how many times the screen was shown in this visit (1 = right after the
core pages); `time_ms`: from the screen to the tap. A way on then opens the
next page behind that door and logs the round-1 `choice` {activity, door,
sheet} as before (now on every pick, since the child comes back to the
choice between pages), so door choices stay comparable across rounds.

### `choice`
A free-choice made by the child. **RQ 5, 6.**
```
{ activity?: string, visit?: number, door?: 'easy' | 'medium' | 'hard', sheet?: number, character?: 'brote'|'mina'|'pliegue'|'ovillo', where?: 'wardrobe', by?: 'adult' }
```
One event type covers the character pick (sheet 1), the free-play menu and
the door difficulty; only the relevant fields are set. The character step
logs `{activity: 'character', character}` on every pick (a child may change
their mind; the last one counts); a character changed in the wardrobe logs
the same with `where: 'wardrobe'`. A free-play pick is `{activity, visit}`
(`visit`: 1, 2, 3… the activities picked so far, the same number as its
`activity_end`); a door chosen is `{activity: 'sheet', door, sheet}` (logged
when the child opens a page behind another door than the page before: round
1 from the doors page or the bar; round 2 from "¿Cómo seguís?", which comes
between pages, so every pick of a way on logs one). A probe opened from the adult's corner menu
("Abrir «Hacé tu juego»", any grade) is a pick with `by: 'adult'`.
Wardrobe pieces are in `wardrobe` events. T38: `{activity: 'name'}` is
logged when the name screen's "Listo" is pressed (the name itself is never
in this payload — see `sessions.child_name` above); nothing is logged when
the screen is off or skipped by the adult.

### `ladder_step`
One item of the fixed placement-ladder item bank (`src/playtest/ladder.ts`),
logged when the item ends. **RQ 2, 3, 4.**
```
{
  concept: string,          // the rung's concept (table below)
  rung: number,             // 1–12, the item bank's order (easiest first); T39: 13–18 for 4to
  item: string,             // the page played (level id; T39: a second item ends in `b`, rungs 13–18 are Workshop-blocks items)
  format: 'solve' | 'complete' | 'fix' | 'predict' | 'modify',
  check: 'climb' | 'floor', // floor: the one easier item tried after the first non-pass
  result: 'pass' | 'fail',
  variant: 0 | 1,           // T39: 0 the rung's first item, 1 its second (4to's long ladder only plays a 1); from 2026-10-20
  engine?: 'vm',            // T39: rungs 13–18, played on the Game Workshop's blocks and VM
  next: string | null,      // the next item's id, null when the ladder stops here
  time_ms: number,
  help_levels: number,      // automatic help steps shown (0–3)
  adult_helped: boolean,
  attempts: number,         // presses of ▶ (level_end's)
  outcome: 'win' | 'fail' | 'skipped', // level_end's
  end_reason: 'solved' | 'runs' | 'solution_hint' | 'adult' | 'time_cap' | 'idle_cap' | 'ladder_time' | 'left'
}
```
`end_reason` (round 2): `solved` the page was won (then `result` is `pass`
unless the solution hint or an adult's help was used); `runs` two failed
runs; `solution_hint` / `adult` a failed run after the solution hint / after
an adult's help; `time_cap` 3 minutes of wall time on the item, input or
not (a hidden tab counts: the check also runs when the tab shows again);
`idle_cap` 90 s with no input at all (no tap, drag or key on the page,
counted from the page's start or the last input; the ghost hand's moves are
not input); `ladder_time` the item was still open 13 minutes into the
ladder; `left` the page ended another way (rare). Round-1 rows have no
`end_reason`.

The item bank, round 2 (from 2026-10-01; the same pages for every child,
hand-designed for the ladder in `src/playtest/ladderItems.ts`, every item
different from its neighbours in board size, what is on the board, the goal
cell and its twist; same rungs and concepts as round 1):

| Rung | Concept | Format | Item | What makes it distinct |
|---|---|---|---|---|
| 1 | `sequence` (short) | solve | `pp-l1` Rodear los charcos | forest 4×3, two puddles across the middle, the seed up on the right; 5 lines |
| 2 | `long_sequence` | solve | `pp-l2` Dos semillas y la maceta | forest 6×4, a corridor of rocks: right to the first seed, down to the second, right to the pot (8 lines, a turn, things in order) |
| 3 | `fix` | fix | `pp-l3` Una flecha se mete al agua | the river (6×3): a ford of two stepping stones; one ↑ walks into the water |
| 4 | `predict` | predict | `pp-l4` ¿Dónde se queda Brote? | a tall forest board (4×5), ↑↑↑ →→ ↓: two turns |
| 5 | `repeat` | solve (ghost-hand intro) | `pp-l5` Cruzar el río para el otro lado | the river 8×3, walking LEFT across six stones; 2 lines |
| 6 | `repeat_count` | complete (the count) | `pp-l6` ¿Cuántas veces para arriba? | a stone chimney (3×6): repeat ? ↑, then → →; only the number is missing |
| 7 | `repeat_pattern` | solve | `pp-l7` La escalera de piedras | stepping stones climbing a river staircase ↑→ (5×5) |
| 8 | `before_after_repeat` | solve | `pp-l8` Caminar, bajar la escalera y un paso más | a second, different staircase (stone, going down, 6×5): → →, repeat 3 ↓→, ↓ (lines before and after the repeat) |
| 9 | `fog_si` | solve (ghost-hand intro) | `pp-l9` Niebla en la orilla | a sandy bank (7×1) in fog, two rocks |
| 10 | `three_worlds` | solve | `pp-l10` Tres caminos cortos, un programa | three short forest paths (6, 5, 6), one with a rock right at the start (look before stepping) |
| 11 | `events_rules` | rule game | `pp-l11` Un juego: cada flecha mueve a Brote | 5×4 with puddles and a rock; the ghost makes "cuando aprieto → → derecha", presses ▶ and →, the game keeps running; the way also needs ↑ (on-screen ↑ and → keys) |
| 12 | `rules_score` | rule game | `pp-l12` Un juego: semillas que suman puntos | a sandy 7×4, seeds fall; ← → given; the ghost presses ▶ and →; four points with a new touch rule |

The rule games (round 2) start with the ghost's demo (the rule built if
missing, ▶, its key pressed), then say and caption "Ahora vos: tocá las
flechas del teclado o de la pantalla para mover a <character>…"; rung 11
also says, the first time a key without a rule is pressed, "Esa flecha
todavía no tiene regla. Armala…". The intro is `ghost_demo` kind `intro`.

Round 1's bank (2026-09-30 to 2026-10-01 sessions; `ladder.ts` `LADDER_ROUND1`):

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
help was used, two failed runs, three minutes without solving it, or 90 s
with no input at all (after the solution hint or an adult's help the child
keeps one more try: the next failed run ends the item). After a pass, one rung up (a pass on rung 12
stops). After the first non-pass: if the rung below was not passed in this
ladder, it is tried once (`check: 'floor'`) and the ladder stops whatever
happens; if it was passed, or there is none (rung 1), the ladder stops. At
most 8 items or 8 minutes since the classroom round (T14; round 2: 10 items
or 12 minutes): checked between items; an item open at 8 minutes still ends
by 9 minutes, `end_reason: 'ladder_time'`. The ceiling is the pilot's most
important number: with the entry by grade, 8 items still let a child who
keeps passing climb far (1ro from rung 1 to 8, 3ro from 5 to the top), and
8 minutes keep the ladder a short part of a free class. El docente's
"quedan 5 minutos" ends the ladder after the item on screen (`ladder_end`
`reason: 'wrap_up'`). The caps
are wall time; round 1's rule-game item ran 234 s because the tab was
hidden and the browser delayed the 5-second check (round 2 also checks when
the tab shows again, and on every input). `?caps=fast` in the URL shortens
them for scripted checks (item 30 s, no input 12 s, ladder 60 s, hard 70 s;
`tools/check-caps.mjs`). The child never sees a result: between items the
character walks on to the next page, and at the end it cheers ("¡Muy bien!
Vamos a jugar").

A rule game (rungs 11–12) is solved when the game is won (rung 11: the
character reaches the seed with the arrows; rung 12: four points in the jar;
round 1: `3ro-1`, `3ro-2` with five); a failed run there is a game stopped
(■ or ↺) after the child pressed an arrow.

The ceiling is the highest rung passed. `v_ladder_ceiling` takes the max
`rung` with `result = 'pass'` per `(session_id, concept)` (one rung per
concept, so a row means that concept's item was passed), and
`v_session_summary.ladder_ceiling_rung` the max over the session: the same
number as `ladder_end.ceiling_rung`.

#### T39: 4to's long ladder (from 2026-10-20)

For 4to only (every other grade keeps the rules above, unchanged): up to 18
items or 15 minutes (an item open at 15 minutes ends by 16; per-item caps
unchanged: 3 minutes, 90 s with no input), the top is rung 18, the entry
still rung 7, and every block is labelled word first (`word-picture`, also
on rungs 7–8, whose pages are picture-first for 1ro). **Second items**:
from rung 7 every rung has two different items (the same concept and
difficulty on another board or story). A rung is passed by its first item
(`variant: 0`); a first item not passed gets the rung's second item
(`variant: 1`, `check: 'climb'`) before the ladder steps down or stops; the
second item's result is the rung's. So a child at rung r writes one or two
rows for it; a pass by `variant: 1` means "got it the second time", a
fail/fail pair means "not yet". The floor check and the ceiling are the
same rules (the ceiling is still the highest rung passed, whichever item).
`?caps=fast` for 4to: item 30 s, no input 12 s, ladder 150 s, hard 160 s.

| Rung | Second item (`variant: 1`) | What changes |
|---|---|---|
| 7 | `pp-l7b` La escalera del bosque | a forest staircase going ↑← (5×5) instead of the river's ↑→ |
| 8 | `pp-l8b` Bajar, la escalera y dos pasos más | the river, one step before a ↓→ staircase and two after (instead of two before, one after) |
| 9 | `pp-l9b` Niebla en el sendero | a forest path 8×1 in fog, rocks at 3 and 6 |
| 10 | `pp-l10b` Tres orillas, un programa | three river banks (5, 7, 6 cells) |
| 11 | `pp-l11b` Un juego: las flechas del otro lado | R11 mirrored: the way needs ← and ↑ (the ghost makes ←) |
| 12 | `pp-l12b` Un juego: semillas en el bosque | a forest 6×4, another rain of seeds |

**Rungs 13–18** (PRIMM: predict, investigate/fix, modify, make), played on
the Game Workshop's own blocks (Scratch 3's Spanish wording), editor, stage
and VM (`src/playtest/ladderVm.ts`, `LadderVmItem.tsx`): the goal large
inside the screen, a check that runs the child's project headless and reads
what happened (positions, variables, contacts, messages, the end — any
correct solution passes), a wordless first-time demo of the format only (a
block dragged from the palette onto the paper, then ▶; or a hand pointing
at the places to choose), none for 18. Help: 1 the goal again (said), 2 the
palette glows on the category to look at (predict: a hint line), 3 one hint
line that points at the place, never the answer; a fourth ✋ raises the
hand. A ▶ on the project exactly as given is a look (`run.result: 'look'`),
never a failed try; two real tries that do not pass end the item (`runs`).
A predict item takes one tap: the game then runs with the keys pressed and
the right place lights up; a wrong tap ends the item (`runs`) and the rung's
second item comes.

| Rung | Concept | Format | First item | Second item |
|---|---|---|---|---|
| 13 | `events_predict` | predict | `pp-l13`: two scripts on the character (→ moves 100, ↑ goes to the ceiling); "→ twice: where does it end?" (6 places) | `pp-l13b`: two scripts on the same key (space moves −100 and goes to the ceiling) |
| 14 | `fix_rule` | fix | `pp-l14`: the seed's "si ¿tocando …? → +1 punto" points at the log, not the character | `pp-l14b`: the star's rule changes `vidas` instead of `puntos` |
| 15 | `if_else` | complete | `pp-l15`: assemble "al presionar → : si ¿tocando Piedra? entonces saltar al techo si no avanzar" from loose blocks | `pp-l15b`: the mirror on the ceiling (←, drop to the floor at the log) |
| 16 | `variables` | complete | `pp-l16`: the missing "cambiar puntos en 1" inside the seed's touch rule | `pp-l16b`: the missing "cambiar vidas en −1" in the log's |
| 17 | `broadcast` | complete | `pp-l17`: the seed sends «punto»; make the receiving side (al recibir «punto» → +1 punto) | `pp-l17b`: the log sends «choque»; the character loses a life on receiving it |
| 18 | `modify_make` | modify | `pp-l18`: a working game that never ends → it must be won at 5 points | `pp-l18b`: a bird flies by → the game must be lost when it touches the character |

Their `level_start`/`run`/`level_end` carry `level_id` = the item id and
`engine: 'vm'` (`level_start`); `run` has `result` (`win` | `fail` |
`look`), `attempt`, `help_step`, `edits` (editor operations so far),
`program` (every script as text, `sprite: op input…; …`, up to 2000
characters) and, for predict, `guess`/`answer` (place indices); `level_end`
adds `edits`.

**Concepts for the per-child profile** (T42 prints one; the families group
the rungs a child met): sequence (`sequence`, `long_sequence`), reading and
fixing (`fix`, `predict`, `fix_rule`), repeat (`repeat`, `repeat_count`,
`repeat_pattern`, `before_after_repeat`), conditions (`fog_si`,
`three_worlds`, `if_else`), events (`events_rules`, `rules_score`,
`events_predict`), variables (`variables`, `modify_make`), broadcast
(`broadcast`). Per concept: passed by the first item, passed by the second,
or not passed (both), from `ladder_step` (`concept`, `result`, `variant`).

### `ladder_end`
The ladder stopped (once per session that reached it). **RQ 2.**
```
{
  entry_rung: number,
  ceiling_rung: number | null,  // highest rung passed, null if none
  items: number,
  time_ms: number,
  reason: 'top' | 'ceiling' | 'floor' | 'bottom' | 'max_items' | 'max_time' | 'wrap_up' | 'left'
}
```
`top`: rung 12 passed (T39, 4to: rung 18); `ceiling`: a fail right above a passed rung (4to: after the rung's second item too);
`wrap_up` (T14): "quedan 5 minutos" arrived, the item on screen was the last;
`floor`: after the floor check; `bottom`: rung 1 failed; `max_items`,
`max_time`: the caps; `left`: the flow moved on mid-ladder (the adult ended
the session or skipped the step; the item open then has no `ladder_step`,
its `level_end` says `skipped`).

### `typing`
One key pressed in "Teclas del bosque" (step `typing`, `src/playtest/TypingStep.tsx`,
rules in `typing.ts`). **RQ 7.**
```
{
  key: string,            // the key pressed: one character, lowercased, accents off (a dead key's á is an a), ñ kept; ' ' for the space bar (only when a command waits for its space)
  expected: string,       // the character that was expected
  correct: boolean,
  latency_ms: number,     // a letter, or an item's first character: from the item's appearance; the next ones: from the key before (right or wrong)
  speed_level: number,    // 1–3 since round 2 of the pilot (the gentle pace step inside the round the item fell at); 1–6 in round-1 sessions
  input: 'physical' | 'touch',  // a real keyboard, or a tap on the drawn keyboard (touch screens)
  item: string,           // the letter, syllable, word or command falling
  set: 'vowels' | 'letters' | 'syllables' | 'words' | 'commands' | 'phrases',
  pos: number,            // the expected character's place in the item (0 for a letter)
  round: 1 | 2 | 3        // the game's round (absent in round-1 sessions of the pilot, before T12)
}
```
Only printable keys count (Shift, arrows, Enter, a dead key alone are not
logged; the space only when the item waits for one); a held key's repeats are
not logged; a key pressed while nothing is falling is not logged; keys during
the intro are not logged (the demo's own key skips the intro). On two seeds
at once, a key that matches either catches it (`expected` is that seed's
letter); otherwise `expected` is the lowest item's.

**The game since round 2 of the pilot (T12): three rounds.** Each round has
a goal drawn in the scene: a garden bed of N holes in front of the meadow.
Each catch fills the next hole (a sprout pops; the next hole is circled in
pen). Each round is harder on purpose (the content, or two things at once);
the speed inside a round adapts only gently. A full bed blooms, a critter
comes to see, the round's medal in the bar turns gold, and the next round
says what changes. After round 3 the finale ("¡Listo!" on a sign).

| Grade | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| 1ro | `vowels` a e i o u, one at a time (shuffled first five), 10 s fall, goal 6 | `letters` vowels + m s l p t n, **two at once**, 8.5 s, goal 8 | `syllables` ma me mi mo pa pe pi sa so la lo lu ta te no na, goal 5 |
| 2do | `letters` vowels + m s l p t n r d c b, two at once, 8 s, goal 8 | `syllables` ma pe lo su ta ni ra do ca be mi so lu fe ga ri, goal 6 | `words` sol mar pan oso sapo pato casa luna mesa nube rana taza lupa mapa, goal 5 |
| 3ro | `words` (2do's list), goal 5 | `commands` si ir mover girar parar sumar tocar, goal 5 | `phrases` repetir 2, mover 3, sumar 1, saltar 2, girar 4 (the number row is drawn; the space is the long bar), goal 3 |
| 4to–5to | `commands` si ir mover girar parar sumar tocar, goal 5 | `commands` saltar pintar repetir avanzar esperar, goal 5 | `phrases` repetir 3, mover 2, avanzar 4, esperar 1, sumar 5, girar 2, goal 4 |

A letter falls in the round's time (above); a longer item in 3.5 s plus a
while per character (1ro syllables 3 s, 2do 2.6 / 2.4 s, 3ro 2.1 / 2.0 /
1.9 s, 4to–5to 1.8 / 1.7 / 1.6 s). Nothing of the last two items again.
From round 2 a butterfly carries one item of the round (it flutters; it
falls 25 % slower).

The pace inside a round: three steps (×1, ×0.86, ×0.74 of the fall time),
starting calm each round; three early catches in a row → one step livelier;
an item that reached the ground → one step calmer. Wrong keys never change
it. **Early** = caught before the middle of the fall (the item still shines
above the garland across the scene). **Golden streak:** three early catches
in a row light the garland's three star lamps and plant a golden seed that
fills the next hole too (never past the goal; the streak starts again). A
late catch or an item on the ground only starts the streak again: nothing is
taken away. An item that reaches the ground rests a moment and **comes back
two items later**: no misses counted, no lives, no countdown. A seed for the
session's garden (the pouch in the bar) every three holes filled over the
game (at most 8; about 6 in 1ro).

### `typing_round`
One round of the typing game ended (T12). **RQ 7.**
```
{
  round: 1 | 2 | 3,
  set: 'vowels' | 'letters' | 'syllables' | 'words' | 'commands' | 'phrases',  // the round's set
  goal: number,           // holes in the bed (?metas=<n> sets every goal to n: checks only)
  filled: number,         // holes filled (a golden catch fills two)
  caught: number,         // items caught
  golden: number,         // golden seeds (holes filled for free)
  completed: boolean,     // the bed was filled
  reason: 'goal' | 'time' | 'done' | 'left',   // filled; the cap; "listo"; the flow moved on
  time_ms: number,        // from the round's start (after the intro or its line) to its end
  keys: number, correct: number,   // the round's `typing` rows, and the right ones
  landed: number,         // items that reached the ground (they come back)
  pace_end: number        // 1–3
}
```

### `typing_end`
The typing game ended (once per session that reached it). **RQ 7, 5.**
```
{
  reason: 'rounds' | 'time' | 'done' | 'wrap_up' | 'left',  // the three rounds; the cap (five minutes); "listo" (T14: shown once half of round 2's bed is filled; round 2: after round 1); "quedan 5 minutos" (T14: after the item on screen); the adult moved on. Round-1 sessions: 'time' was four minutes, no 'rounds'
  mode: 'letters' | 'words',   // the grade's kind of game (1ro letters, 2do+ words), as in round 1
  set: 'letters' | 'words' | 'commands',  // the grade's family (1ro, 2do, 3ro+), as in round 1
  rounds_done: number,    // beds filled (0–3)
  time_ms: number,        // from the step's first screen (the intro included) to the end (the finale starts)
  play_ms: number,        // from the end of the intro (0 if it never ended)
  keys: number, correct: number,    // keys logged as `typing`, and the right ones
  caught: number, landed: number,   // items caught; items that reached the ground
  filled: number, golden: number,   // holes filled over the game; golden seeds
  speed_end: number, speed_max: number,   // the pace step (1–3) at the end, and the highest
  input: 'physical' | 'touch' | 'mixed' | 'none',
  seeds: number,          // seeds planted in the session's garden by the game
  help_levels: number,    // ✋ presses (0–3)
  adult_helped: boolean
}
```
The game is never cut in the middle of a word: at the cap or "listo" a word
already begun is finished (or reaches the ground) first; then the finale
(the sign, every critter met, a dance) and "¿Te gustó?". `?teclas=<minutes>`
in the URL sets another cap (0.25–10). The typing game logs no
`level_start`/`level_end`; `v_activity_time` counts it from
`typing_end.time_ms`. Its `help`, `speak` and `ghost_demo` events carry
`level_id: 'typing'` (✋ 1: the key glows harder and the letter is said; ✋ 2
and 3: the ghost hand points at the key too; a fourth press or a held ✋
raises the hand, lowered as `moved_on` when the round ends; the intro's ghost
hand is `kind: 'intro'`), and an adult's help during the game marks
`typing_end.adult_helped`. Right after the game the child is asked "¿Te
gustó este juego?" with three drawn faces: `survey_answer` {question:
'typing_liked'}.

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
The wardrobe step. **RQ 6.**
```
{ action: 'open', seeds: number, unlocked: string[] }                       // the step opened: seeds this session, the pieces unlocked
{ action: 'on' | 'off', outfit_id: string, slot: string }                  // a piece tapped: put on, or taken off
{ action: 'locked', outfit_id: string, slot: string, needs: number }       // a locked piece tapped (it says how many seeds it needs)
{ action: 'character', character: string }                                // another character picked (also a `choice`)
{ action: 'close', reason: 'done' | 'time' | 'left', outfit: {slot: id}, character: string, duration_ms: number, taps: number, seeds: number }
```
`close` is the outfit kept: `done` the child turned the page ("listo"),
`time` about three minutes passed (a gentle "¡Qué lindo quedó!"), `left` the
adult moved on. In the playtest the pieces unlock at a few seeds, known in
advance and drawn on each locked piece (a seed and its number): bufanda and
gorro de hongo 0 (everyone), mochila 4, capa 7, botas 10, flotador 13,
corona 16 (`PLAYTEST_UNLOCKS`, `src/playtest/WardrobeStep.tsx`; the year's
milestones are 3–50 seeds and whole sheets). Seeds are never spent.

### `garden_view`
The child looked at their session's garden: the goodbye screen, the year's
garden grown from this session's seeds (every level page solved in the
playtest plants one: the tool check's, the ladder's, free play's; the
typing minigame plants one every few catches), what a boss sent if one was won in free play, and the
character in the outfit kept in the wardrobe; logged when it closes. **RQ 6.**
```
{ duration_ms: number, seeds: number, critters?: string[], plants?: string[], outfit?: {slot: id}, left?: 'again' | 'time' }
```
Round 2: the goodbye starts the next session by itself after 45 s (paused
while the adult's corner menu is open), or at once with its big drawn "jugar
otra vez" button; `left` says which. The session was already closed as
`completed` on reaching the goodbye. No code is shown.

### Free play

Step `free_play` (`src/playtest/FreePlay.tsx`, menus in `freePlay.ts`). A
drawn menu of 3–4 picture cards by grade; each card's name is said when the
menu opens and when the card is held (a tap picks it). **RQ 5.**

| Grade | Menu (in order) |
|---|---|
| 1ro | `race` (T33, "La carrera"; see below), `sheet` (sheet 6 "La escalera", its doors and boss), `recess` (sheet 9, the music recess; left off while muted), `guardas` (sheet 14), `editor` (sheet 7's workshop and corkboard) |
| 2do | `race`, `sheet` (sheet 8 "Zigzag"), `recess`, `guardas`, `editor` (sheet 7) |
| 3ro | `rule_game`, `sheet` (sheet 13 "Antes y después"), `recess`, `editor` (sheet 7) |
| 4to | T39/T41: the Arcade (see "4to's Arcade" below): `typing_race` ("Carrera de teclas"), `own_game` ("Tu juego"), `race` (from tier 4), `workshop` (back to the Workshop step), `wardrobe` (the wardrobe step). Before T39: `rule_game`, `editor` (sheet 15), `recess`, `game_maker` (T7's probe "Hacé tu juego", now only from the adult's corner menu) |
| 5to | `rule_game`, `editor` (sheet 15), `recess`, `text_probe` (the probe "Del bloque al texto", T8, rebuilt in T16; see below) |

`rule_game` plays `3ro-1`, `3ro-2` (a page already solved is skipped) and
then `pp-reglas`: the child's own game (every key, move and the point, no
rules to start with, eight seeds to catch). The activities are the year's
own screens with the session's progress (round 2: the bar shows no page
icons, doors or boss, only a simple progress; after the core pages
"¿Cómo seguís?" replaces the doors page, see `next_choice`): the extra pages
open after the sheet's pages with a red ribbon, the boss after the core pages, a boss won sends its
critter or plant to the goodbye garden. Per pick: `choice` {activity,
visit}, the pages' events with `activity` (and `sheet`, `page`, `door`), a
door's `choice`, and `activity_end`.

Time (T14): free play's first pass, on the core route before the typing
game, lasts `FREE_PLAY_BUDGET_MS` = 8 minutes for every grade (round 2: 12;
`?libre=<minutes>` in the URL sets another, 1–30) **or** until the child is
back on the menu after a fourth activity picked (`FREE_PLAY_MIN_VISITS`),
whichever comes first. After the route is done (the green flag, see
`route_done`) free play has no end: only el docente ("quedan 5 minutos",
"terminar la clase") or the adult's corner menu end it. "Quedan 5 minutos"
ends it like the time does, after the page on screen (a probe after the
two-minute grace of a non-level page), for the wardrobe and the survey; the
open activity's `activity_end` says `budget`. A level is never cut: when the time is over,
free play moves on from the menu at once, after the level on screen ends
(the child turns it, or moves to another page), or, on a page that is not a
level (the editor, the corkboard), at the next page or after two
minutes; on "¿Cómo seguís?" at once, like the menu. Then the character cheers "¡Ahora vamos a otro juego!" and the next
step comes. The adult's corner menu can skip the step at any time (the open
activity's `activity_end` says `left`).

### The game maker probe, "Hacé tu juego" (4to)

A probe of free play (`src/playtest/GameMaker.tsx`; engine
`src/game/gameMaker.ts`; the steps, their blocks and when each counts as
done `src/playtest/gameMakerProbe.ts`), about ten minutes. **RQ 8** (and 5,
3). It is a card of 4to's menu; the adult's corner menu opens it for any
grade during free play (`choice.by: 'adult'`). Its events carry `probe:
'game_maker'`; its `help`, `speak` and `ghost_demo` carry `level_id:
'game_maker'` and `phase` (the step). It logs no `level_start`/`level_end`:
free play counts the whole visit in `activity_end` (one `levelEnded` at the
end, win when the five build steps were completed). For free play's time the
whole probe is one page: the budget never cuts it; free play moves on when it
ends.

**Round 2 (T15, the teacher's feedback):** the game is built step by step,
playing after each step, so the child knows what each rule does because they
put it there. Round 1 (T7: a ready-made game, "change one rule", "make your
own", the Scratch column "La Traductora" and three Scratch predictions) is
gone; its rows (`probe_phase` play/change/make, `scratch_predict`) may still
be in round-1 data.

One screen: the palette (only the step's blocks) | the notebook (the step's
goal on a taped note; one object's cards at a time, tabs for the objects on
the board) | the board (7 × 6), big, with ▶, ↺ and the arrow keys above it.
An arrow pressed while the game is stopped starts it. Each step's goal is
said, captioned and drawn (the bar's picture, the note); the bar shows the
six steps as stones. A done step says so, stamps its note and turns by itself
after 10 s (or the arrow). After 90 s of trying a step that is not done, a
"seguir" arrow shows in the bar: the step's rules are left built (logged as
`rule_edit` {ghost, filled}) so the next step works, and the page turns.

| # | Step (`phase`) | Object | Blocks in the palette | Done when (seen by the engine) |
|---|---|---|---|---|
| 1 | `move` | the character | cuando aprieto → / ←, mover → / ← | the character moved left and right with the arrows |
| 2 | `stone` | the stone (appears) | siempre, cuando toco el suelo, mover ↓, volver arriba | the stone fell and came back up |
| 3 | `seed_read` | the seed (appears, already programmed: siempre → mover ↓; cuando toco el suelo → volver arriba) | none (an example to read) | the child tapped the seed (its tab or the board) and saw its cards |
| 4 | `touch_rules` | the character (points and lives appear) | cuando toco a 🪨 / 🌱, perder 1 vida, sumar 1 punto | a life was lost and a point won while playing |
| 5 | `win` | the game (the trophy appears; its card already has "si las vidas llegan a 0 → perdés") | si los puntos llegan a [5], ganás | a game ended (won or lost) with a way to win in the rules |
| 6 | `free` | any (the bird can be added) | every block | never: the arrow to finish shows after 45 s, the step ends after 5 minutes |

Then "¿Te gustó hacer tu juego?": `survey_answer` {question:
'game_maker_liked'}. `?caps=fast` (the scripted checks) shortens the waits
("seguir" after 8 s, the free step's arrow after 4 s, its end after 40 s).

The first time on step 1, if nothing is placed in 9 s, the ghost hand shows
the drag of the first block once (`ghost_demo` kind `intro`; nothing is
built). On step 3 it points at the seed after 6.5 s (`intro`).

Blocks are strings `kind:param` (the param is the block's chip, a tap cycles
it). Hats: `start` (al empezar), `key:<dir>` (cuando aprieto), `tick`
(siempre: each object at its own pace), `touch:<me|seed|stone|bird|ground|edge>`
(cuando toco a / el), `recv:<yum|ouch|party>` (cuando recibo ¡ñam! / ¡ay! /
¡fiesta!), and on the game's card (`game`, the trophy) `points:<3|5|10|15>`
(si los puntos llegan a) and `lives0` (si las vidas llegan a 0). Actions:
`move:<dir|ahead>`, `turn`, `top` (volver arriba, a random column),
`score:<1|2|3|-1>` (sumar / restar), `lives:<-1|1>` (perder / ganar una
vida), `say:<mia|ay|pio|bien>`, `send:<msg>` (avisar: heard by every object
with that `recv` on the next tick), `vis:<hide|show>`, `win`, `lose`.
Objects: `me` (the child's character), `seed`, `stone`, `bird` (added by the
child in the free step), `game`. Lives start at 3; a game that ends shows a
drawn card ("¡Ganaste!", or "¡Se acabaron las vidas!" with the hearts filling
again) and "¡Otra vez!".

✋ per step: 1 the step's line again and the block it needs next wiggles (▶
when the rules are there); 2 the ghost hand drags that block to where it goes
(points at the seed on step 3, at ▶ and the arrows when nothing is missing);
3 the ghost hand builds the step's missing rules for real (`rule_edit`
{ghost: true}; on step 3 it taps the seed; in the free step it adds the bird
flying "siempre → mover →"); when nothing is missing it starts the game and
points at the arrows. A fourth press or a held ✋ raises the hand.

#### `probe_phase`
A step ended (done and turned, skipped, or the free step left).
```
{
  probe: 'game_maker',
  phase: 'move' | 'stone' | 'seed_read' | 'touch_rules' | 'win' | 'free',
  completed: boolean,     // the step's goal was seen (always false for 'free')
  skipped: boolean,       // "seguir" after the wait (its rules were left built)
  time_ms: number,        // from the step on screen to the page turning
  help_levels: number,    // ✋ presses in the step (0–3)
  ghost_built: boolean,   // ✋ 3 built (or tapped) something for the child
  runs: number,           // games started in the step
  edits: number,          // the child's own edits in the step
  adds?: number, cards_added?: number, used_send?: boolean  // the free step only
}
```
Done alone = `completed` with `help_levels` 0 and no `ghost_built`.
Round 1 (T7) logged `phase: 'play' | 'change' | 'make'` with `completed,
time_ms, runs, edits, help_levels`.

#### `rule_edit`
One edit of the rules.
```
{
  probe: 'game_maker', phase: <step>,
  object: 'me' | 'seed' | 'stone' | 'bird' | 'game',
  hat: string | null,       // the card's hat (null: the object itself was added)
  action: string | null,    // the action concerned (null: a whole card)
  op: 'add' | 'remove' | 'change',
  from?: string, to?: string,  // a chip tapped: the block before and after
  rules: number,            // cards in the whole game after the edit
  running: boolean,         // edited while the game was playing (rules apply at once)
  ghost?: true,             // done by the help's ghost hand or a skip, not the child
  filled?: true             // left built by a skipped step
}
```
The bird added is `{op: 'add', object: 'bird', hat: null, action: null}`.
Removing is a drag out of the notebook, or a tap on an action; a card goes
with its hat dragged out.

#### `game_run`
One game, from ▶ (or an arrow pressed while stopped) to its end.
```
{
  probe: 'game_maker', phase: <step>,
  result: 'win' | 'lose' | 'stopped',  // stopped: ■, ↺, the page turned or left
  duration_ms: number, score: number, lives: number,
  keys: number,              // arrows the child pressed (not the ghost's)
  rules: string,             // the whole game on one line: "me[key:left>move:left;…] seed[…] game[points:5>win;lives0>lose]"
  rule_count: number, objects: string[],
  broadcasts: string[],      // messages some object sends and some object hears in these rules
  messages_heard: number,    // messages heard by a rule during this game
  win_points: number | null, lose_lives: boolean  // the game's ways to end
}
```

#### `scratch_predict` (round 1 only)
Round 1 (T7) asked three fixed Scratch scripts after the game; round 2 does
not. Kept for reading round-1 data:
`{ item: 'key' | 'star' | 'broadcast', answer: string, correct: boolean, position: number, time_ms: number }`
(answers: key `up`/**`right`**/`say_hola`; star **`star_points`**/`star_says`/`life_lost`;
broadcast `stone_says`/`nobody`/**`bird_says`**). No view reads it any more.

#### `probe_end`
The probe ended: `{ probe: 'game_maker', reason: 'done' | 'left', time_ms: number, steps_completed?: number, runs?: number, edits?: number, rules: string }`
(`left`: back to the menu, the time or the adult ended it before the end;
`steps_completed`: build steps done, alone or with help).

### The text probe, "Del bloque al texto" (5to)

A probe of free play (`src/playtest/TextProbe.tsx`; the text language
`src/game/textCode.ts`; the steps `src/playtest/textProbe.ts`), about 8–10
minutes. **RQ 8** (and 3, 5): how well does a child of 5to, who knows blocks
(MakeCode Arcade, micro:bit) but has never written code, understand the
text version of a block program? Rebuilt from zero in T16 (2026-10-02)
after el docente's feedback ("muy difícil"; they never wrote code): one
idea at a time, always from the blocks they know to the text, never a
surprise. Its card is on 5to's menu; the adult's corner menu opens it for
any grade during free play (`choice.by: 'adult'`). Its events carry
`probe: 'text'` (`probe_phase`, `probe_end`) or `item`/`step`; its `help`,
`speak` and `ghost_demo` carry `level_id: 'text_probe'` and `phase` (the
step, or `<step>_teach` on a teaching screen). It logs no
`level_start`/`level_end`: free play counts the whole visit in
`activity_end` (one `levelEnded` at the end: win when the five core steps
were all done, alone or with help). For free play's time the probe is one
page.

The text (Python-like; Spanish names inside Python's English keywords, as
the children will meet them in Python): `derecha()`, `izquierda()`,
`arriba()`, `abajo()` (one step, Camino's absolute arrows: there is no
`avanzar()`, Camino has no heading), `saltar()` (a jump to the right, the
"saltar" block), `for i in range(n):` ("repetir n", any loop name, n
0–20) and `if hay_piedra():` (looks right). Since T16 there is no `while`
and no `else`: those words are unknown names now. One statement per line,
4 spaces per level (a tab is 4); a loop holds calls and ifs, an if holds
calls. `if hay_piedra():` holding only `saltar()` is the "si hay piedra
[saltar]" block. Error kinds (`text_run.error_kind`), each said to the
child in one short sentence with its line ("Me parece que falta un
paréntesis en la línea 2"): `empty`, `too_long` (over 500 characters or
30 lines), `bad_char`, `unknown_name` (with the likely word: "¿Será
«derecha»?"), `uppercase`, `missing_paren`, `extra_args`, `missing_colon`,
`bad_number`, `big_number`, `same_line` (a body on the header's line),
`extra`, `bad_line`, `missing_indent`, `unexpected_indent`, `bad_indent`,
`empty_block`, `nesting` (a loop in a loop, an if in an if). Round-1 data
may also hold `else_without_if`.

The screens: six steps; the step path (six stones) is in the bar, every
line is said and captioned. A step first shows a block program beside its
text and the board (the **teaching screen**: the child presses Probar, the
line running and its block light together; a line and its block also
light under the finger; short notes in blue pen say what a line means,
e.g. "← repetí 3 veces"); then one very small **task** with that idea.
The editor is a real textarea (big monospace, syntax colours, no
spellcheck/autocorrect/autocapitalize; Tab and Enter indent like a Python
editor); its keys never reach another listener. A marked word (the word
and number tasks) starts selected, and a tap inside it selects it again,
so typing replaces it. Then "¿Te gustó escribir el programa?" (three
faces).

| # | Step (`phase`) | Teaching screen (blocks ↔ text) | Task (`text_item.item`, `kind`) | Done when |
|---|---|---|---|---|
| 1 | `move` | → ↔ `derecha()` (3×1 board) | `move_pick`, `pick`: a ↑ block and two lines, `abajo()` and `arriba()`: which is it? A wrong tap dims that line and shows its own arrow ("Esa es abajo… Probá con la otra") | `arriba()` tapped |
| 2 | `seq` | → → ↑ ↔ three lines; they light top to bottom | `seq_word`, `word`: `derecha()` ×3, the last word marked and selected, the hint "Cambiá derecha por [a][r][r][i][b][a]" (drawn keys); blocks follow the text | the run reaches the seed |
| 3 | `repeat` | repetir 3 {→} ↔ `for i in range(3):` + an indented `derecha()` ("repetí 3 veces", "lo corrido se repite") | `repeat_number`, `number`: `range(2)`, the 2 marked and selected; the note follows the number ("repetí 4 veces"); blocks follow | the run reaches the seed (`range(4)`) |
| 4 | `typo` | none (the task says why: "La compu solo entiende las palabras justas") | `typo_fix`, `typo`: `arriba()` / `drecha()` / `derecha()`; ▶ shows "En la línea 2 dice «drecha» y esa palabra no la conozco. ¿Será «derecha»?"; the blocks of the right program shown dimmed | the run reaches the seed |
| 5 | `if` | →, si hay piedra [saltar], → ↔ `derecha()` / `if hay_piedra():` / `    saltar()` / `derecha()` (a rock on the way: it jumps it) | `if_predict`, `predict`: the same program without the rock (no blocks: reading the text); three drawn answers under the text, picked once, then the run; never marked right or wrong, the line after the run explains ("Solo salta si hay piedra") | a pick (`end_2`, the 2nd drawing, is right) |
| 6 | `write` (optional, "si querés") | none | `write_line`, `write`: `derecha()` ×2 and an empty line: write a line so it goes up; a word bank shows the four moves as block and text | the run reaches the seed |

✋ in three steps per screen (teaching and task screens count apart): 1 the
line again (Probar, the answers or the marked word wiggle); 2 the ghost
hand points at the line that matters (and its block, the hint or the
board); 3 the ghost does it: runs the teaching screen, picks the answer,
writes the fix as a ghost edit (`text_edit` {item, step, ghost: true,
line}), follows the program onto the board on the predict. A fourth press
or a held ✋ raises the hand. A task not done after 90 s gets "seguir" in
the bar (`?caps=fast`: 6 s); a teaching screen's next arrow shows after
its run or after 30 s; the stretch's after 30 s. A screen done turns by
itself after 12 s (or the arrow).

#### `text_item`
One per task, when it ends (answered, solved or skipped).
```
{
  item: 'move_pick' | 'seq_word' | 'repeat_number' | 'typo_fix' | 'if_predict' | 'write_line',
  kind: 'pick' | 'word' | 'number' | 'typo' | 'predict' | 'write',
  step: 'move' | 'seq' | 'repeat' | 'typo' | 'if' | 'write',
  reason: 'answered' | 'solved' | 'skipped',
  correct: boolean,          // ended right by the child (not by ✋ 3)
  first_try: boolean,        // right at the first attempt: the first tap, the first run
  attempts: number,          // taps (pick), runs (edit tasks), 0/1 (predict)
  errors: string[],          // the parse error kinds of the task's runs, in order
  time_ms: number, help_levels: number,  // ✋ presses on the task screen (0–3)
  ghost: boolean,            // ✋ 3 did it
  answer?: string, position?: number,   // pick: the FIRST line tapped; predict: the drawing picked
  text?: string,             // edit tasks: the program as the child left it (only the subset's characters, ≤ 500)
  adult_helped: boolean
}
```
`text` is code, not free text: capitals are lowered and anything outside
a–z, digits, `_`, `(`, `)`, `:`, spaces and newlines is dropped before it is
logged. Round-1 (T8) rows have no `step` and `reason` may be `left`.

#### `text_run`
One press of ▶ on a text: a task's (`item` = the task id) or a teaching
screen's (`item: '<step>_teach'`).
```
{ item: string, step: string, ok: boolean, result: 'win' | 'bump' | 'short' | null, error_kind: string | null, line: number | null, attempt: number }
```
`ok: false`: the text did not parse (nothing ran; `error_kind` and its
`line`). The predict's run after the pick is not a `text_run`. Round-1
rows have `item: 'tour'` and T8's item ids.

#### `probe_phase` (text)
One per step, when it ends:
`{ probe: 'text', phase: <step>, completed: boolean, skipped: boolean, time_ms, help_levels, ghost, teach_runs, links, task }`
(`completed`: the task done, alone or with help; `skipped`: "seguir";
`help_levels`: the highest ✋ step on either screen; `ghost`: ✋ 3 did
something; `teach_runs`: runs on the teaching screen; `links`: taps that
lit a line with its block). **Done alone** = completed with
`help_levels` 0 and no ghost; **with help** = completed otherwise;
**skipped** = skipped. Round 1 logged `phase: 'intro' | 'items'`.

#### `probe_end` (text)
`{ probe: 'text', reason: 'done' | 'left', time_ms, steps_completed, steps_alone, runs }`
(`steps_*` count the stretch too; `runs` = every ▶). Round 1 logged
`items_tried`, `items_correct`.

### La carrera, the race (T33, 1ro and 2do)

A free-play activity (`src/playtest/Race.tsx`, pure logic and tuning in
`src/playtest/race.ts`), first on 1ro's and 2do's menus. **RQ 5** (what
they choose, voluntary "¡Otra carrera!", time per race) and **RQ 6**
(motivators: cups, the seed at the finish). The child's kart races two
forest critters (never classmates; no ranking anywhere); each stretch of
road is a short row of pieces (flat →, a ramp up ↑, a ramp down ↓) with an
empty slot under each; the child fills them with the levels' arrow blocks
(a tap, a drag onto the stretch, or the keyboard's arrow keys). A right
block nudges the kart; a full, right tape makes it zoom through the
stretch (no ▶); a wrong block makes the kart bump a bush and pops out
(nothing lost). Long straights (tier 3 on) offer the real `repetir` block
holding one →, its count the pieces left: the turbo. The critters are
rubber-banded to the child's pace and always cross after the child. Each
finish: a podium, a cup on the session's shelf (kept in the resume state),
one seed for the garden (the cup is solved as `race-cup-<n>` in the session's progress, which also keeps the shelf across a step change or a reload), and "¡Otra carrera!" (a new
race, one tier harder; endless). Tiers: 1: six stretches of 1–2 arrows in
one direction (at least two of two); 2: six of 2–3 mixing directions; 3: seven of 2–3 plus two
turbo straights of 4–6 →; 4 and on: seven of 3–5 plus two turbos. A
race's roads come from `tier` and `seed` (`generateRace`, deterministic).
Free play logs the pick (`choice` {activity: 'race'}) and the time in it
(`activity_end`, where each race finished counts as a won level); free
play's time never ends mid-race (it waits for the race on screen to
finish). Its `help`, `speak` and `ghost_demo` carry `level_id: 'race'` (✋
1: the next piece and slot glow and the road is said; ✋ 2 and 3: the
ghost hand also carries the right block to the slot; a fourth press raises
the hand; the first race of a session opens with a wordless ghost demo,
`kind: 'intro'`).

#### `race_start`
A race began (on screen). **RQ 5.**
```
{
  race_no: number,          // 1, 2, … in the session (kept across a reload; a reload mid-race starts the next number)
  tier: number,             // 1, 2, 3, 4… (4 and on play as 4)
  seed: number,             // with `tier`, draws the race again (generateRace)
  stretches: number,        // stretches in the race (6 or 7)
  roads: string[],          // each stretch's road, one letter a piece: R(ight), U(p), D(own); a turbo straight starts with T, e.g. 'TRRRRR'
  turbo_stretches: number,  // turbo straights in the race (0 or 2)
  rivals: [string, string], // the two critters (in turn: zorro & coati, carpincho & rana, lechuza & carpintero)
  again?: true              // started from the podium's "¡Otra carrera!" (voluntary); absent for the first race of a visit
}
```

#### `race_stretch`
A stretch was finished (or left open). **RQ 5** (and RQ 1 for `sources`).
```
{
  race_no: number, stretch: number,   // 1-based
  road: string,             // 'RUD'… (as in race_start.roads, without T)
  length: number,           // pieces
  turbo_offered: boolean,   // a turbo straight (the palette offered `repetir`)
  used_repeat: boolean,     // the child placed the repeat (the turbo)
  blocks_placed: number,    // blocks placed, right and wrong (a repeat counts one)
  wrong_blocks: number,     // blocks that did not match (each bumped a bush and popped out)
  removed: number,          // taps on a filled slot (that block and the ones after it came out)
  sources: { tap: number, drag: number, key: number },  // how the blocks were placed
  ms: number,               // from the stretch becoming the one to build to its last block
  completed: boolean        // false: the child left the race in the middle of this stretch (logged only if a block was placed in it)
}
```

#### `race_end`
A race ended: the child crossed the line, or left. **RQ 5, 6.**
```
{
  race_no: number, tier: number, seed: number,
  reason: 'finished' | 'left',   // crossed the line; left the race ("volver al menú", the flow moved on, the class ended)
  ms: number,                    // from the race on screen to crossing the line (or leaving)
  play_ms: number,               // from the first block placed
  stretches: number, stretches_done: number,
  blocks_placed: number, wrong_total: number, removed: number,
  turbo_offered: number,         // turbo straights reached
  turbo_used: number,            // of them, done with the repeat
  sources: { tap: number, drag: number, key: number },
  margin_ms: number | null,      // finished: from the child crossing to the first critter crossing (the "small but visible" margin); null when left
  margin_estimated?: true,       // no critter crossed within 3.5 s (a very fast child): margin_ms estimated from the nearest one's distance
  help_levels: number,           // ✋ presses (0–3)
  adult_helped: boolean,
  cups: number                   // cups on the shelf after this race
}
```

### The Game Workshop, "El taller de juegos" (T40, 4to; on 5to's menu too)

A small Scratch inside Camino (`src/workshop/`): Scratch 3's Spanish
blocks and category colours on a free, pannable workspace per sprite, a
deterministic VM (`vm.ts`, 30 fps, one thread per script) and the game
"Al revés" (a corridor runner with flipping gravity) built through PRIMM
challenges (`challenges.ts`): **1** "Que el mundo corra" (predict the
log's given script, run it, then make the floor's), **2** "Que dé vuelta"
(investigate a buggy flip that only goes up: tap the block to blame, then
fix it with `si … si no`), **3** "Trampas arriba y abajo" (duplicate the log,
put the copy on the ceiling), **4** "¡Auch!" (a hit takes one life and sends
the log back, in both logs), **5** "Puntos" (a seed gives a point and comes
back), **6** "Cada vez más rápido" (the logs move with `velocidad`, which
rises with each seed — "every 5 points" became "with each seed": 4to has no
`módulo`, and a kid's `si puntos = 5` or a timer also passes), **7** "Ganar o
perder" (0 lives → `perder`, 20 points → `ganar`); then the free
challenges **8–13** (more traps, a bird, a power-up star, a sound, a new
costume, their own idea), any order, each optional.
**RQ 8** (can 4to build a game, understanding rather than copying), **RQ 4**
(the predict and investigate formats), **RQ 3** (graded help), **RQ 5**
(engagement: runs, free challenges, time), **RQ 1** (drag skills, through
the edit counts).

Every challenge is checked from the game's behaviour, never against one
exact script: on ▶ the child's project is run headless with scripted
players (no keys; space once; space now and then) and its positions,
variables, contacts and end are read (any correct solution passes). Help
is graded: ✋ or "Pista" → 1 a hint line inside the screen, 2 the relevant
blocks glow in the palette, 3 a similar worked example on a side card (never
the answer); a fourth ✋ raises the character's hand (`call_adult`). After
help level 3, or six minutes on a challenge, it can be skipped (its
canonical solution is put in place so the game keeps working). The project
and the progress are saved on the device by session (`camino.piloto.workshop.v1`,
`src/workshop/store.ts`), so a reload, a closed tab or another step never
loses them; the Arcade's "Tu juego" (T41) plays the same save. Free play
logs the pick (`choice` {activity: 'workshop'}) and the time in it
(`activity_end`, where finishing challenges 1–7 counts as one won level).
Its `help` events carry `level_id: 'workshop'` and the challenge `n`.

**Understands vs copies (T42).** Read per child from `workshop_challenge`:
`predict_correct` (challenge 1, before running) and `investigate_correct`
(challenge 2, before fixing) are first answers, given once, before any
help could show the answer (help level 1 on those cards is a hint about
what to read, never the answer, and is counted in `help_level`); for each
make/modify challenge, `help_level` 0 with `attempts` low means built
alone; `phase: 'skipped'` means not built. Both answers are logged the
moment they are given, so a reload never lets the child answer twice.

#### `workshop_challenge`
A challenge's moment. **RQ 8, 4, 3.**
```
{
  n: number,                    // 1–7 core, 8–13 free
  phase: 'start' | 'predict' | 'investigate' | 'solved' | 'skipped',
                                // start: its goal card opened (once per session, even across reloads; core only)
                                // predict: challenge 1's answer, before running; investigate: challenge 2's tap
  attempts: number,             // runs whose check failed so far (make phase)
  help_level: number,           // highest help level shown on it (0–3)
  runs: number,                 // ▶ presses on it so far
  ms: number,                   // from its card opening (0 at start; at solved/skipped: the whole time)
  free?: true,                  // a free challenge (8–13)
  predict_choice?: 'wraps' | 'leaves' | 'still',  // the drawn choice tapped (right: 'wraps')
  predict_correct?: boolean,
  investigate_block?: string,   // the tapped block's op (right: 'setY', "fijar y a 100")
  investigate_correct?: boolean
}
```
`predict_*` is repeated on challenge 1's later rows, `investigate_*` on
challenge 2's, so a `solved` row carries its own answers.

#### `workshop_edit`
Edits, counted per challenge and sent in batches (when the challenge ends,
when the Workshop closes, and at most once a minute), never one event per
drag. **RQ 1, 8.**
```
{
  n: number,                    // the challenge open while editing
  edits: number,                // all edits in the batch
  counts: { add?, move?, detach?, delete?, input?, duplicate?, copy?: number },
                                // add: a block dragged from the palette into the workspace (snapped or loose)
                                // move: a whole stack dragged by its top block ("ordenar" counts one)
                                // detach: a block taken from the middle of a stack (with what was below it) or a reporter out of its slot
                                // delete: dropped on the palette, or "Borrar"; input: a number, text or dropdown changed
                                // duplicate: a block (and what is below it) or a sprite duplicated; copy: a script dropped on another sprite's card
  ops: { [action]: { [op]: number } },  // which blocks, by Scratch op (e.g. add.forever: 2)
  sprites: { [spriteName]: number },     // edits per sprite
  max_stack: number             // the biggest stack moved, added or deleted in the batch (blocks)
}
```

#### `workshop_run`
A run of the game ended (■, `detener todo`, `ganar` or `perder`). **RQ 5, 8.**
```
{
  n: number,                    // the challenge open (8: the free challenges)
  ms_played: number,
  result: 'stopped' | 'won' | 'lost',
  lives: number, points: number,   // the variables at the end
  check: 'pass' | 'fail' | 'none', // the open challenge's check on this run ('none': not in its make phase)
  why?: string                  // a failed check's line, as shown ("El suelo se va… pero no vuelve a empezar.")
}
```

#### `workshop_end`
The Workshop closed (free play's menu, the flow moving on, the class ending). **RQ 5, 8.**
```
{
  challenges_solved: number, challenges_skipped: number,   // core (1–7)
  free_challenges: number,      // 8–13 starred
  current: number,              // the challenge open (8: the free ones)
  arcade: boolean,              // "Tu juego" is in the Arcade (challenge 5 done)
  best: number,                 // best points in one run
  ms: number                    // since the Workshop first opened in this session
}
```

### 4to's Arcade: "Carrera de teclas" and "Tu juego" (T41)

4to's free play is the Arcade (T39: it opens after the Workshop's
challenges 1–5, or for everyone with el docente's "Juegos para todos"). Its
menu, in order: `typing_race`, `own_game`, `race` (La carrera from tier 4),
`workshop` (back to the Workshop step), `wardrobe`. "Tu juego" is there for
every child in the Arcade, also one who came with "Juegos para todos"
before challenge 5 (it plays whatever the child has built). Free play logs
the pick (`choice`) and the time in each (`activity_end`; each typing race
finished counts as a won level). **RQ 5, 6** (what a 4to child chooses,
voluntary replays) and, for the typing race, keyboard fluency for T42.

**Carrera de teclas** (`src/playtest/TypingRace.tsx`, pure logic in
`typingRace.ts`): T33's track, karts, critters, rubber band, podium and
shelf of cups, driven by typing. Each stretch of road is a word or a
phrase of Scratch's Spanish, shown LARGE under the track; the physical
keyboard drives it (no on-screen keyboard; the keys are read on the
window, so a click anywhere keeps typing working, and space never presses
a focused button). Every right letter turns green and nudges the kart; a
finished word boosts it to the next stretch; a wrong letter makes the kart
wobble and the expected letter shake red (nothing lost, no backspace: the
next right key carries on). Accents are optional ("raton" types "ratón"),
case does not matter, the space between words is required; keys that type
no letter (Shift, a dead accent key, Backspace) are ignored. Tiers by
length (a win goes one up, endless; 4 and on play as 4): 1 short words
(`mover`, `girar`, `tecla`…), 2 longer words (`repetir`, `variable`,
`posición`…), 3 phrases (`por siempre`, `si tocando`, `enviar mensaje`,
`al presionar tecla`…), 4 phrases with numbers (`mover 10 pasos`,
`cambiar puntos en 1`…); at least 55/60/65/70 letters a race (about 60–90 s
at a letter a second). Cups are solved as `typing-cup-<n>` in the session's
progress (one seed each), apart from La carrera's. The podium shows the
race's own numbers (words per minute, right keys of all keys), never
compared with anyone. Its `help` and `speak` carry `level_id:
'typing_race'` (✋: the task said again and the next letter glows; a fourth
press raises the hand).

#### `typing_race_start`
```
{
  race_no: number,          // 1, 2, … in the session (kept across a reload)
  tier: number,             // 1, 2, 3, 4… (4 and on play as 4)
  seed: number,             // with `tier`, draws the words again (wordsFor)
  words: string[],          // the race's words and phrases, in order
  chars: number,            // their letters, spaces included
  rivals: [string, string],
  rival_mode: 'band' | 'honest',  // C02: 'honest' for 4to only; every other grade is 'band' (unchanged)
  again?: true,             // started from the result screen's "¡Otra carrera!" (voluntary, a new race)
  revancha?: true           // C02: started from the result screen's "¡Revancha!" (voluntary, the exact same race again)
}
```

#### `typing_race_word`
One per word finished (4–11 a race).
```
{
  race_no: number, word_no: number,  // 1-based
  word: string,
  ms: number,               // from the word on screen (the first word: from the first key) to its last letter
  errors: number            // wrong keys while it was the word to type
}
```

#### `typing_race_end`
```
{
  race_no: number, tier: number, seed: number,
  reason: 'finished' | 'left',
  ms: number,               // from the race on screen to the finish line (or leaving): the 60–90 s target
  play_ms: number,          // from the first key
  words: number, words_done: number,
  chars: number,            // letters of the words finished
  right: number, wrong: number,     // keys
  wpm: number | null,       // words per minute: right keys / 5 per minute of play_ms
  accuracy: number | null,  // right keys / all keys, 0–100
  again: boolean,           // this race came from "¡Otra carrera!"
  margin_ms: number | null, margin_estimated?: true,   // as in race_end (band mode); in honest mode, the honest result's own margin
  help_levels: number, adult_helped: boolean,
  cups: number,             // typing-race cups after this race (honest mode: unchanged on a loss — only 1st place earns one)
  rival_mode: 'band' | 'honest',  // C02
  place?: 1 | 2 | 3,        // C02 (honest mode only): where the child actually finished
  reason?: 'no_turbo' | 'crashes' | 'slow_idle' | 'fast_and_clean'  // C02 (honest mode only): why, from the race's own facts
}
```

**C02 (4to only), honest rivals:** the typing race's two animals drive at a
fixed words-per-minute pace (6/10/15, cycling bronze+silver / silver+gold /
bronze+gold by `race_no`, `honestRace.ts`'s `rivalTiersFor`), independent of
the child — unlike every other grade's rubber band (`BAND`, `race.ts`),
which always lets the child win. `place`/`margin_ms`/`reason` come from
`honestResult()`; a loss does not add a typing-race cup, and the next
race's tier does not escalate (the result screen's "¡Revancha!" replays the
exact same race — same seed, same words, same two rivals — instead of a new
one).

**Tu juego** (`src/playtest/OwnGame.tsx` around the Workshop's
`WorkshopGamePlayer`): the child's own "Al revés" (the Workshop's device
save for this session; a child who never edited it plays the starting
project), played big, with "Tu récord: N" (the session's best; kept with
the Workshop save, and in page memory for a child with no save), "Jugar
otra vez" and "Mejorarlo en el taller" (back to the Workshop step, `step`
reason `arcade`). `help`/`speak` carry `level_id: 'own_game'`.

#### `own_game_run`
Every run's end.
```
{
  ms: number,               // the run's length
  points: number | null,    // `puntos` at the end (null when left mid-run)
  result: 'won' | 'lost' | 'stopped' | 'left',   // the game's own end, ■, or leaving mid-run
  best: number,             // the session's best after this run
  record?: boolean,         // this run beat it
  frames?: number
}
```

#### `own_game_improve`
"Mejorarlo en el taller" pressed (`{}`); the `step` free_play → workshop follows.

### Copa de 4to (C03, not yet on the 4to route — C04 wires it in)

Five kart circuits (`src/playtest/copa.ts` pure logic, `Copa.tsx` the
screen), each one concept with a single empty slot pre-filled around it
(never a blank tape): **1** sequence (the stretch's last arrow piece, a
wrong guess bumps a bush), **2** `repetir` as the turbo (one long straight;
single arrows work but are slower), **3** `si hay charco: despacio / si no:
acelerá` (the one puddle piece left for the child), **4** `al aparecer un
tronco → saltar` (the one log piece left), **5** the variable `vueltas` (a
3-lap circuit; the slot is the number). Honest rivals only, like C02's
block race and typing race: two fixed-pace animals (silver, gold — the fox
is always gold), never the rubber band, so a concept-wrong program loses.
Each circuit opens with its goal LARGE on screen and a short wordless
ghost hint (the slot's shape, never the answer); graded help is two steps
(a spoken hint, then the slot highlighted). The result podium shows the
real place, the margin and a reason, with "¡Revancha!" (the exact same
circuit) and "¡Siguiente circuito!"; a circuit counts as passed once
finished, any place — a strip of the five shows the best medal earned on
each so far.

#### `copa_start`
A circuit began (on screen).
```
{
  circuit: 1 | 2 | 3 | 4 | 5,
  variant: number           // with `circuit`, draws the circuit again (generateCircuit); 0 unless a future variant cycle is wired in
}
```

#### `copa_end`
A circuit's result (the child always finishes: never blocked by losing).
```
{
  circuit: 1 | 2 | 3 | 4 | 5, variant: number,
  place: 1 | 2 | 3,
  margin_ms: number,
  reason: 'no_turbo' | 'crashes' | 'skid' | 'log_hit' | 'wrong_laps' | 'slow_idle',  // circuit 1: crashes; 2: no_turbo; 3: skid; 4: log_hit; 5: wrong_laps; a slow but concept-right run: slow_idle; a clean 1st: the field still carries the reason the UI shows nothing for (place 1 reads as a plain win)
  time_ms: number,          // the child's own finish time (no rubber band)
  errors: number,           // wrong tries at the circuit's one slot before it was right (or the adult's reveal)
  help_level: number,       // highest help level shown (0-2: hint, highlighted slot)
  used_turbo?: boolean,     // circuit 2 only: the repeat block was used (vs single arrows)
  concept_ok: boolean       // the slot ended up right, and not by the adult's skip
}
```

#### `copa_revancha`
"¡Revancha!" pressed: the same circuit (same seed) plays again.
```
{ circuit: 1 | 2 | 3 | 4 | 5 }
```

T42/T34 report (`tools/analyze-playtest.mjs`): an Arcade section with, per
child, typing races (voluntary again, finished), best and median words per
minute, right keys, and "Tu juego" runs and best; the motivation profiles
count typing races for `racer` (like La carrera's) and a little more for
`keyboard` (`TYPING_RACE_WEIGHT`), so a child who only types reads
`keyboard`.

### `survey_answer`
One spoken survey question answered with drawn faces/pictures. **RQ 9.**
```
{ question: 'liked' | 'difficulty' | 'favorite_activity' | 'play_again' | 'typing_liked' | 'game_maker_liked' | 'text_probe_liked', answer: string }
```
`liked`: `'yes'|'mid'|'no'`. `typing_liked` (`'yes'|'mid'|'no'`) is asked by
the typing game at its end, `game_maker_liked` (`'yes'|'mid'|'no'`,
"¿Te gustó hacer tu juego?") by the game maker probe at its end, and
`text_probe_liked` (`'yes'|'mid'|'no'`, "¿Te gustó escribir el programa?")
by the text probe at its end, not by the survey step; none is mirrored onto
`sessions.survey`. `difficulty`: `'easy'|'mid'|'hard'`.
`favorite_activity`: the activity id tapped, among the activities the child
did this session (`character`, `ladder`, `tool_check`, `typing`, `wardrobe`,
and the free-play entries' `activity` ids); asked only when there are two
or more. `play_again`: `'yes'|'no'`. The first tap answers (the choice is
said aloud and the next question comes). The
full set of answers is also mirrored onto `sessions.survey` (keyed by
`question`) when the survey step ends, so a session's answers can be read
without scanning events. T38: for 3ro and up each question's own short text
(already said aloud and shown small in the bar) also appears large inside
the card (`.pp-q-text`, `closing.tsx`'s `Survey`); 1ro/2do are unchanged
(pictures and the spoken line alone, no reading expected). This is a
display-only change: no new field, no new event.

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
  reason: 'start' | 'next' | 'skip' | 'end_now' | 'adult' | 'class_end' | 'demo' | 'games_all' | 'arcade',
  time_ms?: number,             // time spent on `from`
  budget_ms?: number,           // `from`'s planned time (recorded, not enforced)
  over_budget?: boolean,
  wrap_up?: boolean             // T14: the move was "quedan 5 minutos"'s way out
}
```
`games_all` (T37): "Juegos para todos" moved the device straight to
`free_play` (`to: 'free_play'`) from `tool_check`, `ladder`, `typing` or
`wardrobe` — never from `character` (nothing played yet) or from
`free_play` itself (already there), both of which the client treats as a
no-op (no `step` event, no banner). The page open on `from` ends the same
way any other interruption does (`level_end`/`ladder_end`/… `'skipped'` or
`'left'`), never `routeDone`: a child moved to the games zone this way has
not "finished the path".
`skip` is the adult skipping a step (or a step with nothing to show);
`end_now` is the adult's "end the session" gesture (straight to the survey).
Round 2: the first `step` goes from `setup` straight to `character` (no
`code` step), and the last one reaches `goodbye` (no `adult_form` step). T38:
when the name screen is on for a session, the first `step` instead goes
`setup` → `name`, and the next one `name` → `character` (the screen itself
is a child step like any other: skippable from the corner menu, counted by
"end now"); every other session is unaffected.

T14 (the classroom round): the core route is `character` → `tool_check` →
`ladder` → `free_play` → `typing` → `wardrobe`, and then `free_play` again
(the route done, `route_done`), with no end. `adult`: the adult opened the
survey (the corner menu, or a long press on the green flag); after it, back
to `free_play`. `end_now` goes to `survey`, or straight to `goodbye` when
the survey was done. `class_end`: el docente's "terminar la clase"
(`to: 'class_end'`; T28: logged once the session has already ended, after
the non-blocking countdown banner — `from` is whatever step the child was
actually still playing through those 10 seconds, not `class_end` itself;
the late-command case skips this step entirely, see `class_command`).
`demo`: the demo bar's "Ir a…", "Mostrar que terminó"
or "Terminar la sesión" (demo sessions only). Under "quedan 5 minutos"
the step on screen ends after its item and the next steps are the wardrobe
(if not visited), the survey (if not done), then free play (`wrap_up:
true`).

T39 (4to, from 2026-10-20): 4to's own route: `setup` → `name` →
`character` → `tool_check` → `ladder` → `workshop` (the Game Workshop, a
step of its own, mandatory) → `free_play` (for 4to, the Arcade: its menu
is back to the Workshop, La carrera from tier 4 and the wardrobe). No
`typing` step, no `wardrobe` step on the way. `workshop` → `free_play` only
once the Arcade is open (the Workshop's challenges 1–5 done, or "Juegos
para todos"); `arcade` is the child moving between `workshop`,
`free_play` and the Arcade's `wardrobe` (the Workshop card and the
wardrobe card of the Arcade's menu, the Arcade button in the Workshop's
bar, "Ir al Arcade" on the announcement). `games_all` for 4to moves
`tool_check`, `ladder` or `workshop` to `free_play` and opens the Arcade.
Under "quedan 5 minutos" 4to goes from the item on screen to the survey
(if not done), then to the Arcade (or the Workshop while it is closed); in
the Workshop the challenge on screen is the last one (the step moves on
when it is done, or after 90 s, or at once in the free challenges). The
Arcade has no end. Planned times for 4to: tool check 1 min, ladder 15 min,
Workshop 20 min, Arcade 10 min.

### `route_done`
T14: the child finished the core route (tool check, ladder, free play,
typing, wardrobe; a step the adult skipped counts as gone through). The
green flag shows in the top bar from then on (and the bar turns light
green), seen from across the room, and `/admin` shows "Terminó" ✓. Logged
once, when the wardrobe is left. **RQ 5.**
```
{ time_ms: number, via: 'route' | 'wrap_up' | 'demo', survey_done: boolean }
```
`time_ms`: since the session started; `via`: `wrap_up` when it happened
under "quedan 5 minutos", `demo` from the demo bar. T39 (4to): 4to's
green flag is the Workshop's challenges 1–5 done (`via: 'workshop'`,
logged in the Workshop, no step change); "Juegos para todos" never raises
it.

### `arcade_open`
T39 (4to): the Arcade opened, once per session.
```
{ via: 'workshop' | 'games_all' | 'demo', step: string }
```
`workshop`: the Workshop's challenges 1–5 were done (also 4to's
`route_done`); the child sees "¡Se abrió el Arcade!" large inside the
screen, with "Ir al Arcade" and "Seguir en el taller", and from then on an
Arcade button in the Workshop's bar. `games_all`: el docente's "Juegos
para todos" (the notice reads "¡Se abrió el Arcade!" for 4to). `step`: the
step the child was on. `/admin`'s live list shows "Arcade" next to the
child's step from then on.

### `class_command`
T14: a class command from `/admin` reached this device and was applied
(see the table `class_commands`); T37 adds `games_all`/`cancel_games_all`.
**RQ 5** (and data cleaning: what the class end cut).
```
{ kind: 'five_min' | 'cancel_five_min' | 'end_class' | 'games_all' | 'cancel_games_all', id: number, sent_at: string, received_at: string, step: string, late?: true }
```
`five_min`: "¡Quedan 5 minutos!" was shown and said; the step on screen
ends after its item (`ladder_end`/`typing_end` `wrap_up`, free play like its
time), then the wardrobe and the survey, then free play. `cancel_five_min`:
"Cancelar aviso" reached the device while the warning was still pending
(a warning cancelled before the device saw it is never applied).

`games_all` (T37): "Juegos para todos" reached the device; `step` is the
step it was on when the command was seen (`from` of the `step` event this
also logs, where the move was not a no-op — see `step` above). Logged
whether or not the device actually moved (a device on `character`,
`free_play`, `survey`, `goodbye` or `class_end` ignores the move itself but
still logs this event, so the data shows the command reached it).
`cancel_games_all`: "Cancelar «Juegos para todos»" reached a device that had
already moved — the move is immediate, so there is nothing left to undo,
only to log (same "never applied" rule as `cancel_five_min` for a device
that never saw the uncancelled command at all).

`end_class` (T28: non-blocking): the child keeps playing through a
10-second on-screen countdown banner (over whatever is on screen, never
replacing it); only at zero does the session actually end
(`end_reason: 'class_end'`), the queue is sent, and the device shows that
child's own garden (`SessionGarden`) as a calm resting page. The device
returns to the start by itself once it is put away (the page hidden, then
visible again — a lid closed and reopened) or after a few minutes with the
page left open the whole time (`REST_FALLBACK_MS`,
`src/playtest/classroom.tsx`); an adult's 2 s hold on the resting page is
kept as an immediate shortcut. `sent_at` is the server's time of the
command, `received_at` the device's.

`late: true` (T28): this device's clock read more than `LATE_END_CLASS_MS`
(2 minutes) past `sent_at` when the command was finally seen — a device
asleep (lid closed) when el docente pressed "Terminar la clase", waking up
only for the next class, with a new child already sitting down (class 1's
data: 5 devices 24–26 min late). The 10-second countdown and the garden are
skipped entirely: the stale session is ended silently
(`end_reason: 'class_end'`, or `'abandoned'` by the usual T22 rule if
nobody ever really played it) and the device goes straight to a fresh
start, so the new child never sees the previous child's ending. Comparing
`sent_at` to the device's own clock is the only timing available (the sync
answer carries no server-relative "now" to correct for drift); documented
as a known limitation, not treated as exact.

### `captions`
Round 2: the on-screen text was turned on or off with the 💬 toggle (in the
top bar, or at the top of a screen without one). Every spoken line of the
playtest (instructions, help, the ghost's lines, walks, survey questions,
typing prompts, probes) also shows as text while captions are on: in a
speech bubble in the bar beside the character, never over the board or the
palette; a tap on it says the line again. On by default from 3ro (most rooms
have no headphones for them), off for 1ro and 2do; the setup can force it.
The state is also kept on `sessions.device.captions`. **RQ 3.**
```
{ on: boolean, where: 'bar' | 'corner' }
```

### `sound`
T18 (the silent classroom round): the effective sound setting changed,
once a session is open (the value a session started with is only on
`sessions.device.sound`/`sound_source`, not a first `sound` event — the
same choice `captions` makes for the on-screen text). Fires for an admin
push arriving mid-session (`/admin`'s "Con sonido"/"Sin sonido"/"Como diga
el link", or that setting expiring back to `'link'`) and for the adult's
corner-menu "Sonido: sí / no" on this one device. T27: also fires for the
corner-menu "Voz: sí / no" on this one device (speech only); the event
and `sessions.device` fields stay the same shape either way, with `voice`
riding along.
```
{ on: boolean, source: 'admin' | 'url' | 'adult' | 'default', voice: boolean }
```
`source` names which layer decided the new `on` value (`src/playtest/
soundSetting.ts`): `admin` (the class setting, while live), `adult` (the
corner-menu toggle, this page load only), `url` (the bookmark's
`?sonido=`/localStorage baseline) or `default` (on, nothing else said
anything). Precedence: `admin` while live, else `adult` (a fresh page
load clears it), else `url`, else `default`. Muted, `speak` still feeds
the on-screen text listener (`captions`/the 🔊 buttons keep working — a
🔊 tap re-shows the line rather than being hidden) and only
`speechSynthesis.speak`/`ringNote` (the xylophone) are skipped; muting
also cancels a line already speaking. The state is also kept on
`sessions.device.sound`/`sound_source`. **RQ 3** (and data cleaning: a
muted session's lack of spoken-line timing is expected, not a tool
failure).

`voice` (T27, `src/playtest/voiceSetting.ts`/`src/ui/voice.ts`) is a
second, independent on/off: `true` unless the adult turned this device's
voice off from the corner menu. Voice off silences `speak`'s
`speechSynthesis.speak` call only — sfx and music (`ringNote`) keep
playing regardless of `voice`, the opposite split from the master
`sound`/`on` above — so a teacher can turn one noisy computer's speech
off while its sound effects and music (and every other computer's
sound) stay exactly as they were. The on-screen text falls back on
exactly as it does when muted (always shown; capital letters for
1ro/2do). Unlike the adult's `sound` override (this page load only), the
voice choice is saved on the device (`localStorage`) and is restored on
a new session or a reload on the same computer — a teacher sets it once
per machine. Also kept on `sessions.device.voice`.

### `adult_form`
Round 2: the adult saved "Comentario del adulto" from the corner menu (the
answers themselves go on `sessions.adult_form`). **RQ 3, 5.**
```
{ step: string, engagement: 'low' | 'mid' | 'high' | null, help_needed: 'none' | 'some' | 'a_lot' | null, comment: boolean, previous?: true }
```
`comment` only says whether a comment was written (its text is on the
session, never in an event). `previous` (T22): the comment was "Comentario
del chico anterior" — the adult's corner menu, on this session's own device,
about the *previous* session on it (it already ended; by the time this is
saved, a different child's session may be the one being played). `step` is
then that previous session's last known `current_step` when it ended (e.g.
`class_end`), not a step of the session this event is attached to. Written
by its own endpoint, `POST /api/adult-form/:id` (below), not `/api/sync`:
the server picks the event's `seq` itself (one past whatever that session's
events already hold), since the device sending it may no longer know the
session's real seq count (see "The previous child's comment").

### `resume`
The tab reloaded (a stray F5, a Chromebook discarding the tab, the adult
reloading) — or, T29, the tab was closed outright and the bookmark opened
again — and the session carried on (`src/playtest/resume.ts`). The device
keeps the session's flow, progress and a few steps' state in `localStorage`
(`camino.piloto.resume.v1` — T29: moved off `sessionStorage`, which a
closed tab loses; the 2-hour window below is unchanged); after a reload or
reopen the playtest opens on the same step, from that step's start: the
ladder carries on with the item that was on screen (its earlier items stand) and
free play keeps its clock and visit count (the child is back on the menu);
the tool check, typing game, wardrobe and survey start that step again.
Offline, the service worker (`src/playtest/serviceWorker.ts`) still opens
the app. No `step` event is logged for it. A resume needs the device's
current queued session, a step past the setup — and, T28, never the
class-end/rest screen: reopening the bookmark or reloading there always
starts fresh, the same as a session that really is over — and a save
younger than 2 hours; otherwise the setup opens as before. **RQ 5** (and
data cleaning: the page that was open logged a `level_start` with no
`level_end`, and an open free-play activity no `activity_end`).
```
{
  step: string,          // the flow step it carries on at
  since_save_ms: number, // since the tab last saved the session (≈ since the reload's last activity)
  step_ms: number        // since the step began (before the reload)
}
```

T29 also added a `beforeunload` prompt (the browser's own "leave this
page?") while a session is actually being played (not the setup, not the
class-end countdown/rest, not the goodbye) — a second chance before the
tab closes, on top of resume surviving it either way; none of the app's
own transitions (the goodbye's restart, the adult's "Terminar la sesión",
demo mode) navigate the page, so the prompt never fires for them. The
telemetry queue itself (`camino.piloto.queue.v1`) was already in
`localStorage`, unaffected by either change — only `resume`'s own key
moved.

## Demo mode (T14)

For el docente to show or try the pilot without touching the data. At the
setup, a tiny "demo" word in the bottom-left corner, held 2 s, asks "¿Activar
el modo demo?" (a child tapping it gets nothing); on, the setup shows a
"DEMO" stamp and "Salir del modo demo", and the mode lasts for the browser
tab (`sessionStorage` `camino.piloto.demo.v1`). Sessions started then are
synced with `sessions.demo = true`: stored, but left out of the export,
`/admin`'s lists and counts and every view, and deleted 24 hours after
they started. A demo session shows the demo bar, docked on the right edge
(the page is laid out in the rest of the window), with a "DEMO · no se
guarda" mark and buttons that say what they do: "Más rápido ×3" (the
character's runs and moves, the pages' waits and every animation three
times faster; speech is not), "Saltar este nivel / esta ronda / este juego
/ este paso" (the page turned as the child would; a typing round counted
full; back to the menu from an activity; else the step skipped), "Resolver
este nivel" (the page plays its own solution: a program page's reference
program and ▶, a predict page the right cell, a rule game its rules and ▶),
"Ir a…" (the steps by the names the children hear), "Mostrar que terminó"
(the route done: the green flag, free play) and "Terminar la sesión" (the
goodbye, after a second tap). Demo sessions get the class commands too, so
el docente can try the class control in demo mode.

## The previous child's comment (T22, back-to-back classes)

A class ending (`class_end`) now sends the device back to the start by
itself (`?grado`'s character choice, or the grade cards), ready for the
next child — before, only an adult's long press on the resting page did
that. T28 changed *when* "by itself" fires: no longer a fixed few seconds
after the countdown, but when the lid is closed and reopened (the page
hidden, then visible again) or after a longer fallback with the page left
open the whole time (`REST_FALLBACK_MS`); the adult's long press is still
kept as an immediate shortcut. By the time el docente wants to leave
"Comentario del chico anterior", the device may already be playing a
different child's session (or sitting idle, waiting for one), so the
previous session's record is no longer the one the kid app has open.

The device keeps a small, independent record of its own last ended,
really-played (non-demo, non-empty — see `sessions.end_reason`'s
`'abandoned'`), on this one device: the session id, when it ended, its
grade and character, and its last known step (`localStorage`
`camino.piloto.previous.v1`, outside telemetry.ts's own event queue and its
pruning). The adult corner menu's "Comentario del chico anterior" item
appears while that record is no more than 3 hours old; it opens the same
questions as "Comentario del adulto" (engagement, help needed, a comment
without names), prefilled if this exact feature already saved one for that
session, with the previous character's picture and "hace N min" above them
— never a name.

Saving posts to `POST /api/adult-form/:id` (`:id` the previous session's
id; no auth — the kid app has no admin token — rate limited per IP like
`/api/class-settings`), not `/api/sync`: the client no longer has (or
trusts) that session's full record or its next free event `seq`, and
reconstructing both just to patch one field would be more code than one
small, focused endpoint. The body is the same shape as `sessions.adult_form`
(`{engagement, help_needed, comment?}`); the server refuses an unknown id,
a demo session, or a session that has not ended yet (400: the live
"Comentario del adulto" path, not this one, covers an open session), sets
`sessions.adult_form` (replacing it if called again) with `step` set to
that session's own last known `current_step`, and logs one `adult_form`
event on it with `previous: true` and its own next `seq` (picked by the
server: `max(seq) + 1` over that session's existing events, never a seq the
device itself tracks). A post that fails (offline, a dropped class wifi) is
kept as one pending submission on the device and retried once the network
is back or the app next loads (`src/playtest/previousChild.ts`) — not the
full batched-and-acked offline queue telemetry.ts has for events, since
this is one comment, not a stream.

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
load sync on the next load (a reload, even offline: the playtest build's
service worker serves the app from its cache when the network fails or
does not answer in 4 s; it never caches `/api` or `/admin`). Since T14,
while a session is open (not ended) the client also posts at least every
10 s even with nothing queued (the session record alone, so `last_seen_at`
moves too): the answer carries the class's commands (`class_commands`), so
"quedan 5 minutos" and "terminar la clase" reach every device within about
10 s, and a device that was offline gets them when it reconnects. The
answer also carries T18's `settings.sound` (`class_settings`'s live
value), every time, not once per id: the admin's class-wide sound setting
reaches an already-open device the same way, within about 10 s. Session changes (`current_step`, `ended_at`,
`end_reason`, `survey`, `adult_form`) travel in the same posts. Gaps in `seq`
for a session therefore mean a 400-dropped batch, never a network failure.

## SQL views

Defined in `server/migrations/001_init.sql` (and `002_activity_time.sql`, `003_typing.sql`, `004_game_maker.sql`, `005_text_probe.sql`, `007_typing_rounds.sql`, `009_game_maker_steps.sql`, `010_text_probe_steps.sql`, `012_race.sql`, `015_workshop.sql`), always available for ad hoc
analysis (`psql`, or any tool that can read Postgres directly).

Since T14 (`008_class_control.sql`) every view reads only real sessions:
two base views, **`real_sessions`** (`sessions` without demo rows) and
**`real_events`** (the events of real sessions), and each `v_*` view below
was redefined on them (its own definition with the table names swapped, the
logic unchanged). Read `real_sessions`/`real_events` for ad hoc analysis
too; the tables themselves still hold the demo rows until they are deleted.

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
  (the tool check, the ladder) counts its level pages,
  each `level_end` paired with the nearest preceding `level_start` in the
  same session (grouped by a running count of `level_start` events, since
  Postgres does not support `FILTER` on a non-aggregate window function like
  `lag()`; a child never has two levels open at once). The typing minigame
  counts its `typing_end.time_ms`. Redefined in
  `server/migrations/002_activity_time.sql` and `003_typing.sql`. Feeds RQ 5
  (engagement, time per activity).
- **`v_typing_by_grade`** — one row per grade: `attempts`, `correct_count`,
  `accuracy_pct` and `median_latency_ms` from `typing` events, then
  `sessions` (sessions that typed), `median_correct_latency_ms` (right keys
  only), `touch_attempts` (keys tapped on the drawn keyboard) and `liked_yes`,
  `liked_mid`, `liked_no` (the `typing_liked` answers); since T12 also
  `rounds_sessions` (sessions that logged rounds), `all_rounds_sessions`
  (`typing_end.rounds_done` = 3), `median_rounds_done` and `golden_total`.
  Redefined in `server/migrations/003_typing.sql` and
  `007_typing_rounds.sql` (the older columns unchanged and first). Feeds RQ 7.
- **`v_typing_rounds_by_grade`** — one row per grade and round (T12): from
  `typing_round`, `sessions`, `completed`, `median_time_ms`,
  `median_completed_time_ms`, `median_caught`, `golden`; from the round's
  `typing` keys, `attempts`, `correct_count`, `accuracy_pct`,
  `median_correct_latency_ms`. Round-1 sessions of the pilot (no rounds) are
  not in it. `server/migrations/007_typing_rounds.sql`. Feeds RQ 7.
- **`v_probe_game_maker`** — one row per session that opened "Hacé tu
  juego" (T15's steps; redefined in `server/migrations/009_game_maker_steps.sql`,
  on `real_events`/`real_sessions`): `steps_reached` (build steps 1–5),
  `steps_alone`, `steps_with_help`, `steps_skipped`; per step
  `<step>_result` (`alone` | `help` | `skipped` | null = not reached) and
  `<step>_seconds` for `move`, `stone`, `seed_read`, `touch_rules`, `win`;
  `free_reached`, `free_seconds`; the child's own edits (ghost and skip
  edits left out) `rule_edits`, `free_edits`, `free_rules_added` (new cards
  in the free step), `free_actions_added`, `used_avisar` (an "avisar" or
  "cuando recibo" placed), `bird_added`; `games_run`, `games_played` (with an
  arrow), `games_won`, `games_lost`, `free_games`, `messages_heard`; `liked`;
  `end_reason`, `probe_seconds`; `last_rules` (the last game's rules).
  Round-1 sessions get a row with empty step columns. Feeds RQ 8.
- **`v_probe_game_maker_by_grade`** — RQ 8 per grade: `sessions`; for each
  build step `<step>_alone`, `<step>_help`, `<step>_skipped`,
  `<step>_median_s`; `free_reached`, `free_median_s`,
  `median_free_rules_added`, `changed_in_free`, `used_avisar`,
  `added_the_bird`, `won_a_game`, `liked_yes`, `liked_mid`, `liked_no`.

- **`v_probe_text`** — one row per session that opened "Del bloque al
  texto" (T16's steps; redefined in `server/migrations/010_text_probe_steps.sql`,
  on `real_events`/`real_sessions`): `steps_reached` (core steps 1–5),
  `steps_alone`, `steps_with_help`, `steps_skipped`; per step
  `<step>_result` (`alone` | `help` | `skipped` | null = not reached) and
  `<step>_seconds` for `move`, `seq`, `repeat`, `typo`, `if`, `write`;
  `<step>_first_try` for the five core tasks; `move_answer` (the first line
  tapped), `if_answer` (the drawing picked), `write_text` (the stretch's
  program); `tasks_correct`, `tasks_first_try`; `teach_runs`, `links`; the
  tasks' runs (`runs`, `runs_parsed`, `runs_won`, `parse_errors`,
  `error_kinds`; teaching runs left out); `liked`; `end_reason`,
  `probe_seconds`. Round-1 sessions get a row with empty step columns.
  Feeds RQ 8.
- **`v_probe_text_by_grade`** — RQ 8 per grade: `sessions`; for each core
  idea `<step>_alone`, `<step>_help`, `<step>_skipped`, `<step>_first_try`,
  `<step>_median_s`; `write_reached`, `write_alone`, `write_help`;
  `median_steps_alone`, `parse_errors`, `liked_yes`, `liked_mid`,
  `liked_no`.

- **`v_race_by_grade`** — T33, one row per grade that raced (real sessions
  only): `sessions`, `races_started`, `again_races` (voluntary "¡Otra
  carrera!"), `median_races_per_session`, `max_tier`; from `race_end`
  `races_finished`, `races_left`, `median_race_ms`, `median_wrong_per_race`,
  `median_margin_ms`, `races_with_help`; from `race_stretch`
  `stretches_done`, `median_stretch_ms`, `wrong_blocks`, `turbo_offered`,
  `turbo_used`, `turbo_use_pct` (the repeat chosen when it paid),
  `placed_tap`, `placed_drag`, `placed_key`. `server/migrations/012_race.sql`.
  Feeds RQ 5, 6.
- **`v_race_stretches_by_tier`** — T33, one row per grade and tier (each
  stretch joined to its race's `race_start.tier`): `stretches_done`,
  `median_stretch_ms`, `avg_wrong_per_stretch`, `stretches_without_wrong`,
  `turbo_offered`, `turbo_used`, `median_turbo_stretch_ms` (with the
  repeat) and `median_turbo_by_hand_ms` (the same straights with single
  arrows). Feeds RQ 5.

- **`v_workshop_challenges`** — T40, one row per session and challenge
  (real sessions only): `grade`, `child_name`, `n`, `free`, `started`,
  `predict_choice`, `predict_correct`, `investigate_block`,
  `investigate_correct`, `outcome` ('solved' | 'skipped' | null), `attempts`,
  `help_level`, `runs`, `ms`. The base of T42's "understands vs copies"
  signal. `server/migrations/015_workshop.sql`. Feeds RQ 8, 4, 3.
- **`v_workshop_by_grade`** — T40, one row per grade: `sessions`,
  `median_core_solved`, `max_core_solved`, `core_solved_without_help`,
  `core_skipped`, `free_solved`, `arcade_sessions`, `predicted`,
  `predicted_right`, `investigated`, `investigated_right`,
  `median_challenge_ms`, `median_runs_per_challenge`, `runs`, `runs_won`,
  `runs_lost`, `edits`. Feeds RQ 8, 5.

## Retention and deletion

`RETENTION_DAYS` (env var, default 180) is read at startup; the server
deletes `sessions` older than that many days (by `started_at`), cascading to
their `events`, once at boot and every hour after. Since T14 the same job
deletes demo sessions 24 hours after they started (the earlier of
`started_at` and `created_at`) and class commands that expired more than 7
days ago.

**To delete one session** (a check or test session, or one a school asks to
remove): `DELETE /api/admin/sessions/:id` (Bearer `ADMIN_TOKEN`) removes the
session row and, by `ON DELETE CASCADE`, all its events (200 `{ok, deleted}`,
404 unknown id, 400 malformed id). The `/admin` page has a "Borrar" button per
row that asks for confirmation first. `node tools/delete-sessions.mjs
<id,id,…>` does the same for a list (it reads `ADMIN_TOKEN` and
`PLAYTEST_URL` from `~/.credentials/camino-prueba.env`, never printed): the
way to remove the sessions a scripted check made (`tools/check-session.mjs`
prints them as `SESSION_IDS=…`).

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
- `GET /api/admin/summary` and `GET /api/admin/export` (same export shapes,
  Bearer `ADMIN_TOKEN` or the `/admin` login cookie) — used by the `/admin`
  page, also usable directly. Demo sessions are never exported (both exports
  read `real_sessions`/`real_events`).

### `/admin` (T14)

- **Login**: `POST /api/admin/login {password}` checks `ADMIN_PASSWORD`
  (env var, set in Coolify only, never in git) and sets the cookie
  `camino_admin` = `v1.<expiry>.<HMAC-SHA256>` (key derived from
  `ADMIN_TOKEN` and `ADMIN_PASSWORD`: changing either logs everyone out),
  `HttpOnly; SameSite=Strict; Path=/; Max-Age=43200` (12 h), `Secure` behind
  https. Wrong password: 401; no `ADMIN_PASSWORD`: 503. At most 10 failed
  tries per client per 10 minutes (then 429 with `retry-after`, even with
  the right password) and 200 failed tries in all per 10 minutes, counted in
  memory (the address is never stored; the client is Cloudflare's
  `cf-connecting-ip`, else the proxy's last `x-forwarded-for` hop).
  `POST /api/admin/logout` clears the cookie; `GET /api/admin/me` says
  whether the cookie (or token) is valid. `Authorization: Bearer
  ADMIN_TOKEN` keeps working for the tools. A change made with the cookie
  (POST/DELETE) must carry the header `x-camino-admin: 1` (403 otherwise).
- **Class commands**: `POST /api/admin/commands {kind: 'five_min' |
  'end_class' | 'games_all'}` → `{ok, command}` (T37 adds `games_all`,
  "Juegos para todos"); `POST /api/admin/commands/cancel {kind?: 'five_min' |
  'games_all'}` (default `five_min`, kept for older callers) → `{ok,
  cancelled}` (that kind's still-pending commands; `end_class` is never
  cancellable).
- **Sound setting** (T18): `POST /api/admin/settings {sound: 'on' | 'off' |
  'link'}` → `{ok, setting}` (same auth as the class commands); the public
  `GET /api/class-settings` (no auth, rate limited, `cache-control:
  no-store`) → `{sound, expires_at}`, what a device reads at page load.
- **Summary** (`GET /api/admin/summary`): `sessions` (non-demo) with
  `route_done` (a `route_done` event exists: the green flag), `survey_done`
  (`sessions.survey` set), `in_class` (seen in the last 2 hours),
  `current_step`, `last_seen_at`, …; `class_counts {sessions, route_done,
  survey_done}` for the sessions in class; `active_now` (seen in the last 2
  minutes, not ended); `counts_by_grade`; `demo_hidden` (how many demo
  sessions exist, not listed); `commands` (the live ones, newest first);
  `sound_setting` (the live `class_settings` row, T18).
- The page: a password form; then "Quedan 5 minutos", "Terminar la clase"
  (a second tap confirms) and T37's "Juegos para todos", each with a
  one-line explanation; "Cancelar aviso" / "Cancelar «Juegos para todos»";
  "Sonido": "Con sonido" / "Sin sonido" / "Como diga el link", highlighting
  the one in effect and when it expires (T18); "Esta clase": who is
  playing, on which step, "Terminó" (the green flag) and "Encuesta"; all
  sessions with "Borrar"; the exports. It polls every 5 s.
- `tools/export-playtest.mjs` — no dependencies; reads `EXPORT_TOKEN` and
  `PLAYTEST_URL` from `~/.credentials/camino-prueba.env` (never printed),
  fetches all three exports and writes them to `exports/` (gitignored) as
  `playtest-<YYYY-MM-DD-HHMM>.json` / `.sessions.csv` / `.events.csv`. Run
  it with `node tools/export-playtest.mjs`.
- `tools/analyze-playtest.mjs <export.json> [--since YYYY-MM-DD] [--until
  YYYY-MM-DD]` (T34) — no dependencies; prints a plain-text class report
  (what noise was dropped and why; classes clustered by start time; the
  ladder's ceiling and end reasons; free play's activities and time after
  the green flag; the repeat dropped-after-not-inside heuristic; predict's
  no-guess presses and wrong→right patterns; typing's touch vs physical
  accuracy; help usage; garden views/reloads/visibility/idle; late class
  commands; the survey; T33's race; T37's motivation profiles). The actual
  computations are a pure module, `src/playtest/report.ts` (unit-tested in
  `report.test.ts`), imported directly by its `.ts` path — Node strips the
  types at load time, same as `server/*.ts`. Run it with `node
  tools/analyze-playtest.mjs exports/playtest-….json`.
- `tools/check-session-data.mjs <exports/playtest-…> <SESSION_IDS>` — checks
  the scripted check sessions in an export (rows, seq without gaps, event
  types, survey and adult form, both CSVs); with `PSQL` set, the SQL views
  too. Reads only the exported files.
