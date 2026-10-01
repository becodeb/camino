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
| `code` | text | An anonymous session code (e.g. "Zorro 27"). Round 1 showed it to the adult for paper notes; since round 2 (2026-10-01) the kid app never shows it: it is only for the admin page (telling sessions apart, "Borrar"). | 3 |
| `grade` | smallint 1–5 | Grade (1ro–5to). | all, as the grouping dimension |
| `division` | text, 1 letter or null | Optional division letter. | grouping only |
| `consent` | boolean, nullable | Round 1: `true`, the adult ticked "La escuela autorizó esta prueba" at setup. Since round 2 the setup asks no tick (the school's authorization is kept outside the app, and nothing here names a child): new sessions write `NULL` (migration `006_consent_nullable.sql`). | — |
| `started_at` | timestamptz | When the session began. | 5 (duration, idle) |
| `ended_at` | timestamptz, nullable | When the session ended (set on goodbye or an adult end-session gesture). | 5 |
| `end_reason` | text, nullable | `'completed'` (the child reached the goodbye), `'adult_ended'` (the adult's hidden "end the session"; the survey still follows), `'abandoned'` (set by the client when a new session starts on the device while this one never ended, e.g. the adult set up a new child without ending the last one, or a tab reloaded more than 2 hours after its last save; `ended_at` is then its last event's time). A reload within a session no longer abandons it: the session carries on (see `resume`). | 5 |
| `app_version` | text, nullable | Front-end build version at the time of the session. | — |
| `device` | jsonb | `{ua, w, h, vw, vh, dpr, touch, lang, captions?, captions_set?}` as reported by the client: user agent, screen and viewport size in CSS pixels, device pixel ratio, touch capability, browser language; since round 2 `captions` (on-screen text on now: set at the start and updated by every 💬 toggle, see `captions`) and `captions_set` (`'grade'`: the default, on from 3ro; `'setup'`: forced on or off at setup). | 1 (device capability vs. tool failures), 3 (captions) |
| `survey` | jsonb, nullable | See "survey_answer" below; the final answers, keyed by question. | 9 |
| `adult_form` | jsonb, nullable | The adult's form: `{engagement: 'low'|'mid'|'high'|null, help_needed: 'none'|'some'|'a_lot'|null, comment?: string, step?: string}`. Round 1: a step after the goodbye, both answers required. Since round 2 it is optional, from the corner menu ("Comentario del adulto") at any time of the session; any answer may be left out (`null`), saving again replaces it, and `step` is the flow step it was saved on (see the `adult_form` event). Most round-2 sessions will have none. | 3, 5 |
| `current_step` | text, nullable | Last known flow step (`'character'`, `'tool_check'`, `'ladder'`, `'free_play'`, `'typing'`, `'wardrobe'`, `'survey'`, `'goodbye'`; round-1 sessions may also hold `'code'` and `'adult_form'`, steps removed in round 2), for the admin page's live "where is each child" view. | 5 |
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
`help_held`: ✋ kept pressed ~1 s; `help_step_3`: ✋ pressed again after
the third automatic help. `help_step` is the automatic help reached on the
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
Wardrobe pieces are in `wardrobe` events.

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
most 10 items or 12 minutes (checked between items; an item open at 12
minutes still ends by 13 minutes, `end_reason: 'ladder_time'`). The caps
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
One key pressed in "Teclas del bosque" (step `typing`, `src/playtest/TypingStep.tsx`,
rules in `typing.ts`). **RQ 7.**
```
{
  key: string,            // the key pressed: one character, lowercased, accents off (a dead key's á is an a), ñ kept
  expected: string,       // the letter that was expected
  correct: boolean,
  latency_ms: number,     // a letter, or a word's first letter: from the item's appearance; a word's next letters: from the key before (right or wrong)
  speed_level: number,    // 1–6, the speed the item fell at (adaptive, see below)
  input: 'physical' | 'touch',  // a real keyboard, or a tap on the drawn keyboard (touch screens)
  item: string,           // the letter or word falling
  set: 'vowels' | 'letters' | 'words' | 'commands',
  pos: number             // the expected letter's place in the word (0 for a letter)
}
```
Only printable keys count (Shift, arrows, Enter, the space and a dead key alone
are not logged); a held key's repeats are not logged; a key pressed while
nothing is falling is not logged. On 1ro's two seeds at once, a key that
matches either catches it (`expected` is that seed's letter); otherwise
`expected` is the lowest seed's.

What falls, by grade (the same lists for every child; the order is random):

| Grade | Set | Items |
|---|---|---|
| 1ro | `vowels`, then `vowels` and `letters` mixed | a e i o u first (shuffled), then those and m s l p t n; never the same letter twice in a row. The seed shows the letter lowercase and big, and a small drawn key with it as the keyboard prints it (uppercase). |
| 2do | `words` | sol mar pan oso (three letters while slow), sapo pato casa luna mesa nube rana taza lupa mapa (from speed 3) |
| 3ro–5to | `commands` | si ir mover girar parar sumar tocar (up to five letters at speed 1), saltar pintar (speed 2), repetir avanzar esperar (speed 3+) |

A word is typed letter by letter, in order; a wrong key changes nothing. The
speed starts at 1: three quick right keys in a row (a first letter within 2 s
of the appearance, a next letter within 1.2 s of the key before) → one level
faster; two wrong keys, a slow right key (5 s / 3.5 s) or an item that reached
the ground → one level slower. Top speed: 1ro 4, 2do 5, 3ro+ 6. A letter falls
in 11 s at speed 1 down to 4.4 s at 6; a word in 3.5 s plus 3 s (speed 1) to
1.2 s (speed 6) per letter. One thing falls at a time; 1ro's letters two at
once from speed 3. An item that reaches the ground rests a moment and the next
one falls: no misses counted, no lives, no countdown. A seed for the session's
garden every 5 letters or 2 words caught (at most 8 per game).

### `typing_end`
The typing game ended (once per session that reached it). **RQ 7, 5.**
```
{
  reason: 'time' | 'done' | 'left',  // about four minutes passed; the child pressed "listo" (shown after one minute); the adult moved on
  mode: 'letters' | 'words',
  set: 'letters' | 'words' | 'commands',
  time_ms: number,        // from the step's first screen (the intro included) to the end
  play_ms: number,        // from the end of the intro (0 if it never ended)
  keys: number, correct: number,    // keys logged as `typing`, and the right ones
  caught: number, landed: number,   // items caught; items that reached the ground
  speed_end: number, speed_max: number,
  input: 'physical' | 'touch' | 'mixed' | 'none',
  seeds: number,          // seeds planted by the game
  help_levels: number,    // ✋ presses (0–3)
  adult_helped: boolean
}
```
The game is never cut in the middle of a word: at the time or "listo" a word
already begun is finished (or reaches the ground) first. `?teclas=<minutes>`
in the URL sets another length (0.25–10; "listo" then shows at half of it, at
most one minute). The typing game logs no `level_start`/`level_end`;
`v_activity_time` counts it from `typing_end.time_ms`. Its `help`, `speak` and
`ghost_demo` events carry `level_id: 'typing'` (✋ 1: the key glows harder and
the letter is said; ✋ 2 and 3: the ghost hand points at the key too; a fourth
press or a held ✋ raises the hand; the intro's ghost hand is `kind: 'intro'`),
and an adult's help during the game marks `typing_end.adult_helped`. Right
after the game the child is asked "¿Te gustó este juego?" with three drawn
faces: `survey_answer` {question: 'typing_liked'}.

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
| 1ro | `sheet` (sheet 6 "La escalera", its doors and boss), `recess` (sheet 9, the music recess), `guardas` (sheet 14), `editor` (sheet 7's workshop and corkboard) |
| 2do | `sheet` (sheet 8 "Zigzag"), `recess`, `guardas`, `editor` (sheet 7) |
| 3ro | `rule_game`, `sheet` (sheet 13 "Antes y después"), `recess`, `editor` (sheet 7) |
| 4to | `rule_game`, `editor` (sheet 15, the workshop with few lines), `recess`, `game_maker` (T7's probe "Hacé tu juego"; see below) |
| 5to | `rule_game`, `editor` (sheet 15), `recess`, `text_probe` (T8's probe "Del bloque al texto"; see below) |

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

Time: `FREE_PLAY_BUDGET_MS` = 12 minutes for every grade (`?libre=<minutes>`
in the URL sets another, 1–30). A level is never cut: when the time is over,
free play moves on from the menu at once, after the level on screen ends
(the child turns it, or moves to another page), or, on a page that is not a
level (the editor, the corkboard), at the next page or after two
minutes; on "¿Cómo seguís?" at once, like the menu. Then the character cheers "¡Ahora vamos a otro juego!" and the next
step comes. The adult's corner menu can skip the step at any time (the open
activity's `activity_end` says `left`).

### The game maker probe, "Hacé tu juego" (4to)

A probe of free play (`src/playtest/GameMaker.tsx`; engine
`src/game/gameMaker.ts`; phases and prediction items
`src/playtest/gameMakerProbe.ts`), about ten minutes. **RQ 8** (and 5, 3).
It is a card of 4to's menu; the adult's corner menu opens it for any grade
during free play (`choice.by: 'adult'`). Its events carry `probe:
'game_maker'`; its `help`, `speak` and `ghost_demo` carry `level_id:
'game_maker'` and `phase`. It logs no `level_start`/`level_end`: free play
counts the whole visit in `activity_end` (one `levelEnded` at the end, win
when phase 3 was completed). For free play's time the whole probe is one
page: the budget never cuts it; free play moves on when it ends.

Phases on one screen (palette | rule cards with "La Traductora", the same
rule as a Scratch script, beside each card | the board, 7 × 6):

1. `play`: a ready-made game (the child's character catches falling seeds
   with the arrows; a stone takes a life; 5 points win, 0 lives lose). The
   rules are shown but cannot be edited. Completed: one game played with
   at least one arrow. The next page shows after a game ends or 45 s after
   the first ▶ (or at 90 s anyway).
2. `change`: change one rule ("que cada semilla valga 2 puntos": tap the
   number) and play again. Completed: an edit, then a game started after
   it (the next page shows then, or at 3 minutes anyway).
3. `make`: your own variant: add or change rules, add the bird, "avisar"
   (broadcast), the win condition. Completed as phase 2 (4 minutes anyway).
4. `predict`: three fixed Scratch scripts, "¿Qué pasa…?", three drawn
   answers each (`scratch_predict`), never marked right or wrong.
5. "¿Te gustó hacer tu juego?": `survey_answer` {question:
   'game_maker_liked'}.

Blocks are strings `kind:param` (the param is the block's chip, a tap cycles
it like a Scratch dropdown). Hats: `start` (al empezar), `key:<dir>`
(cuando aprieto), `tick` (siempre: each object at its own pace),
`touch:<me|seed|stone|bird|ground|edge>` (cuando toco a), `recv:<yum|ouch|party>`
(cuando recibo ¡ñam! / ¡ay! / ¡fiesta!), and on the whole game's card
(`game`, the trophy) `points:<3|5|10|15>` (si los puntos llegan a) and
`lives0` (si las vidas llegan a 0). Actions: `move:<dir|ahead>`, `turn`,
`top` (volver arriba, a random column), `score:<1|2|3|-1>`, `lives:<-1|1>`,
`say:<mia|ay|pio|bien>`, `send:<msg>` (avisar: heard by every object with
that `recv` on the next tick), `vis:<hide|show>`, `win`, `lose`. Objects:
`me` (the child's character), `seed`, `stone`, `bird` (added by the child),
`game`. Lives start at 3; a game that ends shows a drawn card ("¡Ganaste!",
or "¡Se acabaron las vidas!" with the hearts filling again) and "¡Otra vez!".

✋: 1 the phase's line again and its target wiggles; 2 the ghost hand points
(▶ and the arrows; the seed's number; a drag of "avisar" to the notebook);
3 the ghost hand shows a working rule for real (plays a few arrows; makes a
seed worth 2; adds the bird with "cuando recibo ¡ñam! → decir ¡Pío!" and
"avisar ¡ñam!" on the seed's catch rule): these edits carry `ghost: true`
and never complete a phase. A fourth press or a held ✋ raises the hand.

#### `probe_phase`
A phase ended (the child turned the page).
```
{ probe: 'game_maker', phase: 'play' | 'change' | 'make', completed: boolean, time_ms: number, runs: number, edits: number, help_levels: number }
```
`runs`: games in the phase; `edits`: the child's own edits; `help_levels`:
✋ presses in the phase (0–3).

#### `rule_edit`
One edit of the rules.
```
{
  probe: 'game_maker', phase: 'change' | 'make',
  object: 'me' | 'seed' | 'stone' | 'bird' | 'game',
  hat: string | null,       // the card's hat (null: the object itself was added)
  action: string | null,    // the action concerned (null: a whole card)
  op: 'add' | 'remove' | 'change',
  from?: string, to?: string,  // a chip tapped: the block before and after
  rules: number,            // cards in the whole game after the edit
  running: boolean,         // edited while the game was playing (rules apply at once)
  ghost?: true              // done by the help's ghost hand, not the child
}
```
The bird added is `{op: 'add', object: 'bird', hat: null, action: null}`.
Removing is a drag out of the notebook, or a tap on an action; a card goes
with its hat dragged out.

#### `game_run`
One game, from ▶ to its end.
```
{
  probe: 'game_maker', phase: 'play' | 'change' | 'make',
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

#### `scratch_predict`
One item of the prediction task (fixed, the same for every child).
```
{ item: 'key' | 'star' | 'broadcast', answer: string, correct: boolean, position: number, time_ms: number }
```
| Item | Script | Question | Answers (in order; right one marked) |
|---|---|---|---|
| `key` | al presionar tecla flecha derecha / cambiar x en 40 | ¿Qué pasa cuando apretás la flecha derecha? | `up`, **`right`**, `say_hola` |
| `star` | Estrella: al hacer clic en 🏴 / por siempre / si ¿tocando <character>? entonces / sumar 1 a puntos / esconder | ¿Qué pasa cuando <character> toca la estrella? | **`star_points`**, `star_says`, `life_lost` |
| `broadcast` | Piedra: … si ¿tocando <character>? entonces enviar ¡ay!; Pájaro: al recibir ¡ay! / decir ¡Cuidado! por 2 segundos | Cuando la piedra toca a <character>, ¿quién habla? | `stone_says`, `nobody`, **`bird_says`** |

`time_ms` from the item on screen to the tap; `position` 0–2.

#### `probe_end`
The probe was left: `{ probe: 'game_maker', reason: 'done' | 'left', time_ms: number, runs?: number, edits?: number, rules?: string }`
(`left`: back to the menu, the time or the adult ended it before the end).

### The text probe, "Del bloque al texto" (5to)

A probe of free play (`src/playtest/TextProbe.tsx`; the text language
`src/game/textCode.ts`; the items `src/playtest/textProbe.ts`), about 8–10
minutes. **RQ 8** (and 3, 5): can 5to read and edit the text version of a
block program? Its card is on 5to's menu; the adult's corner menu opens it
for any grade during free play (`choice.by: 'adult'`). Its events carry
`probe: 'text'` (`probe_phase`, `probe_end`) or `item`; its `help`, `speak`
and `ghost_demo` carry `level_id: 'text_probe'` and `item` (`'tour'` in the
tour). It logs no `level_start`/`level_end`: free play counts the whole
visit in `activity_end` (one `levelEnded` at the end: win when the seven
core items were all tried). For free play's time the probe is one page.

The text (Python-like; Spanish names inside Python's English keywords, as
the children will meet them in Python): `derecha()`, `izquierda()`,
`arriba()`, `abajo()` (one step, Camino's absolute arrows: there is no
`avanzar()`, Camino has no heading), `saltar()` (a jump to the right, the
"saltar" block), `for i in range(n):` ("repetir n", any loop name, n
0–20), `while not llegue():` ("repetir hasta llegar"), `if hay_piedra():`
(looks right) and `else:` (text only: the blocks have no "si no"). One
statement per line, 4 spaces per level (a tab is 4); a loop holds calls and
ifs, an if holds calls. `if hay_piedra():` holding only `saltar()` is the
"si hay piedra [saltar]" block. Error kinds (`text_run.error_kind`), each
said to the child in one short sentence with its line ("Me parece que falta
un paréntesis en la línea 2"): `empty`, `too_long` (over 500 characters or
30 lines), `bad_char`, `unknown_name` (with the likely word: "¿Será
«derecha»?"), `uppercase`, `missing_paren`, `extra_args`, `missing_colon`,
`bad_number`, `big_number`, `same_line` (a body on the header's line),
`extra`, `bad_line`, `missing_indent`, `unexpected_indent`, `bad_indent`,
`empty_block`, `else_without_if`, `nesting` (a loop in a loop, an if in an
if).

The screens: a tour first (the same program as blocks | as text | the
board: a line and its block light together under the finger, and while it
runs, step by step), then the items, free order (the stamps in the bar),
then "¿Te gustó escribir el programa?" (three faces). The editor is a real
textarea (big monospace, syntax colours, no spellcheck/autocorrect/
autocapitalize; Tab and Enter indent like a Python editor); its keys never
reach another listener (the dev-mode keys ignore text fields anyway).

| # | Item | Kind | What the child does | Right answer / goal |
|---|---|---|---|---|
| 1 | `predict_loop` | `predict` | reads `derecha()` / `for i in range(3):` `arriba()` / `derecha()` (no blocks), picks one of three drawn boards, watches it run | `end_2_0` (2nd of `end_1_0`, `end_2_0`, `end_2_2`) |
| 2 | `predict_if` | `predict` | reads `for i in range(4):` `if hay_piedra():` `saltar()` / `derecha()` on a row with two rocks | `end_8` (1st of `end_8`, `bump_1`, `end_4`) |
| 3 | `number` | `number` | edits `range(2)` (the caret starts after the 2) so the character climbs to the seed; blocks shown and following the text | `range(4)` (any text that reaches the seed counts) |
| 4 | `typo_name` | `typo` | runs, reads the error on line 3 (`drecha()`), fixes it; no blocks | `derecha()` |
| 5 | `typo_colon` | `typo` | the same with `for i in range(2)` missing its `:` | the `:` |
| 6 | `blocks_loop` | `blocks_to_text` | blocks → , repetir 3 {↑ →}: which of three texts is it | `same` (3rd of `outside`, `count2`, `same`) |
| 7 | `blocks_until` | `blocks_to_text` | blocks repetir hasta llegar {si hay piedra [saltar], →} | `same` (2nd of `inside_if`, `same`, `for3`) |
| 8 | `write_if` | `write` | the stretch ("si querés"): writes `saltar()` on the empty line inside `if hay_piedra():` | reaches the seed |

The next-page button shows once an item is finished (picked, or run to the
seed), or anyway after 2 minutes on a number/typo item and 30 s on the
stretch item (never before a pick on a choice); it goes to the next item not
finished, and to the liking question when none is left (or after 12 minutes
in the items). ✋: 1 the instruction again (the editor or the answers
wiggle); 2 the ghost hand points at the line that matters (the number, the
slip, the empty line, the loop or the if; on a blocks item the line where
the three texts differ); 3 the fix written by the ghost hand as an edit (a
`text_edit` {item, ghost: true, line} event; the item then counts as not
the child's), on a predict item the ghost follows the first steps from the
line to the board, on a blocks item it points at the answer. A fourth press
or a held ✋ raises the hand.

#### `text_item`
An item answered (a choice item: once, the pick is final), solved, or (an
edit item) left having done something (a run, an edit, a help) without
solving it. An edit item left and solved later has both rows.
```
{
  item: string, kind: 'predict' | 'number' | 'typo' | 'blocks_to_text' | 'write',
  reason: 'answered' | 'solved' | 'left',
  correct: boolean,          // the right pick; a text that reaches the seed, written by the child (not by ✋ 3)
  answer?: string, position?: number,   // choice items: the option picked and its place (0–2)
  text?: string,             // edit items: the program as the child left it (only the subset's characters, ≤ 500)
  attempts: number,          // runs (edit items) or 1 (a pick)
  errors: string[],          // the parse error kinds of this visit's runs, in order
  time_ms: number, help_levels: number,  // ✋ presses on the item (0–3)
  ghost_fixed?: boolean,     // ✋ 3 wrote the fix
  adult_helped: boolean
}
```
`text` is code, not free text: capitals are lowered and anything outside
a–z, digits, `_`, `(`, `)`, `:`, spaces and newlines is dropped before it is
logged.

#### `text_run`
One press of ▶ on a text (the tour's too, `item: 'tour'`).
```
{ item: string, ok: boolean, result: 'win' | 'bump' | 'short' | null, error_kind: string | null, line: number | null, attempt?: number }
```
`ok: false`: the text did not parse (nothing ran; `error_kind` and its
`line`). A predict item's run after the pick is not a `text_run`.

#### `probe_phase` (text)
`{ probe: 'text', phase: 'intro', completed: boolean, time_ms, runs, links, help_levels }`
(the tour: `completed` = ran at least once; `links` = taps that lit a line
with its block) and `{ probe: 'text', phase: 'items', completed: boolean,
time_ms, runs, picks, items_tried, items_correct, help_levels }`
(`completed`: the seven core items all tried).

#### `probe_end` (text)
`{ probe: 'text', reason: 'done' | 'left', time_ms, items_tried, items_correct, runs? }`.

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
Round 2: the first `step` goes from `setup` straight to `character` (no
`code` step), and the last one reaches `goodbye` (no `adult_form` step).

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

### `adult_form`
Round 2: the adult saved "Comentario del adulto" from the corner menu (the
answers themselves go on `sessions.adult_form`). **RQ 3, 5.**
```
{ step: string, engagement: 'low' | 'mid' | 'high' | null, help_needed: 'none' | 'some' | 'a_lot' | null, comment: boolean }
```
`comment` only says whether a comment was written (its text is on the
session, never in an event).

### `resume`
The tab reloaded (a stray F5, a Chromebook discarding the tab, the adult
reloading) and the session carried on (`src/playtest/resume.ts`). The tab
keeps the session's flow, progress and a few steps' state in
`sessionStorage` (`camino.piloto.resume.v1`, this tab only); after a reload
the playtest opens on the same step, from that step's start: the ladder
carries on with the item that was on screen (its earlier items stand) and
free play keeps its clock and visit count (the child is back on the menu);
the tool check, typing game, wardrobe and survey start that step again.
Offline, the service worker (`src/playtest/serviceWorker.ts`) still opens
the app. No `step` event is logged for it. A resume needs the device's
current queued session, a step past the setup and a save younger than
2 hours; otherwise the setup opens as before. **RQ 5** (and data cleaning:
the page that was open logged a `level_start` with no `level_end`, and an
open free-play activity no `activity_end`).
```
{
  step: string,          // the flow step it carries on at
  since_save_ms: number, // since the tab last saved the session (≈ since the reload's last activity)
  step_ms: number        // since the step began (before the reload)
}
```

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
does not answer in 4 s; it never caches `/api` or `/admin`). Session changes (`current_step`, `ended_at`,
`end_reason`, `survey`, `adult_form`) travel in the same posts. Gaps in `seq`
for a session therefore mean a 400-dropped batch, never a network failure.

## SQL views

Defined in `server/migrations/001_init.sql` (and `002_activity_time.sql`, `003_typing.sql`, `004_game_maker.sql`, `005_text_probe.sql`), always available for ad hoc
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
  `liked_mid`, `liked_no` (the `typing_liked` answers). Redefined in
  `server/migrations/003_typing.sql`. Feeds RQ 7.
- **`v_probe_game_maker`** — one row per session that opened "Hacé tu
  juego": `phases_reached`, `phases_completed`, `play_done`, `change_done`,
  `make_done`, `make_seconds`; the child's own `rule_edits` (`adds`,
  `removes`, `changes`, `make_edits`; ghost edits left out), `bird_added`,
  `broadcast_edits` (avisar / cuando recibo placed or changed),
  `win_condition_edits`, `lose_condition_edits`; `games_run`,
  `games_played` (with an arrow), `wins`, `losses`, `games_with_broadcast`,
  `messages_heard`, `make_game_can_win`; `predictions`,
  `predictions_correct`, `prediction_answers` ("key:right,star:…");
  `liked`; `end_reason`, `probe_seconds`; `last_rules` (the last game's
  rules). `server/migrations/004_game_maker.sql`. Feeds RQ 8.
- **`v_probe_game_maker_by_grade`** — RQ 8 per grade: `sessions`,
  `play_done`, `change_done`, `make_done`, `median_rule_edits`,
  `used_broadcast`, `played_a_broadcast`, `set_win_condition`,
  `added_the_bird`, `predictions_correct` / `predictions`, `liked_yes`,
  `liked_mid`, `liked_no`.

- **`v_probe_text`** — one row per session that opened "Del bloque al
  texto": the tour (`tour_done`, `tour_runs`, `tour_links`); the items, one
  per item however many visits (`items_tried`, `items_correct` = the
  child's own, `items_solo` = correct with no ✋ and no adult,
  `items_ghost_fixed`), and tried/correct by kind (`predict_*`,
  `number_*`, `typo_*`, `blocks_*`, `write_*`); the runs (`runs`,
  `runs_parsed`, `runs_won`, the tour's left out), `parse_errors` and
  `error_kinds` (the tour's included); `answers` ("item:answer,…" of the
  choice items); `liked`; `end_reason`, `probe_seconds`.
  `server/migrations/005_text_probe.sql`. Feeds RQ 8.
- **`v_probe_text_by_grade`** — RQ 8 per grade: `sessions`, `tour_done`,
  `median_items_correct`, `items_tried`, `items_correct`, `items_solo`,
  correct / tried per kind summed, `parse_errors`, `liked_yes`,
  `liked_mid`, `liked_no`.

## Retention and deletion

`RETENTION_DAYS` (env var, default 180) is read at startup; the server
deletes `sessions` older than that many days (by `started_at`), cascading to
their `events`, once at boot and every 24h after.

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
- `GET /api/admin/summary` and `GET /api/admin/export` (same shapes, Bearer
  `ADMIN_TOKEN`) — used by the `/admin` page, also usable directly.
- `tools/export-playtest.mjs` — no dependencies; reads `EXPORT_TOKEN` and
  `PLAYTEST_URL` from `~/.credentials/camino-prueba.env` (never printed),
  fetches all three exports and writes them to `exports/` (gitignored) as
  `playtest-<YYYY-MM-DD-HHMM>.json` / `.sessions.csv` / `.events.csv`. Run
  it with `node tools/export-playtest.mjs`.
- `tools/check-session-data.mjs <exports/playtest-…> <SESSION_IDS>` — checks
  the scripted check sessions in an export (rows, seq without gaps, event
  types, survey and adult form, both CSVs); with `PSQL` set, the SQL views
  too. Reads only the exported files.
