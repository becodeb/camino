# Feature: prueba-piloto

Locator: `odd/tasks/prueba-piloto.md` (Engram mirror: project `camino`, topic `odd/prueba-piloto/tasks` — pending, see Constraints)

## Objective

A pilot playtest of Camino that children from 1ro to 5to play for 20–40 minutes, with an adult next to them or with one teacher for the whole room, so we learn what each grade already knows, understands and enjoys, and which new ideas work. Every session writes anonymous data to a database for later analysis.

## Problem

The approved design (sheets, formats, help, motivation, minigames) was never tried with children. Next year's starting points, the express sheets, the help design, the motivators and the 4to/5to direction (game maker, text) all depend on evidence we do not have.

## Why

The children who play the pilot are the ones who will use Camino next year. Measuring now, mid-year, calibrates where each grade starts and which features deserve the build effort.

## Source

`docs/prompts/prueba-piloto.md` (the full brief: flow, research questions, data, tech, verification, priorities), `docs/handoff.md`, `docs/next-iteration.md` §3 (raised hands) and §7 (motivation, minigames).

## Scope (authorized 2026-09-30)

- Branch `feat/prueba-piloto` from `feat/primer-grado` (fe6a277), worktree `~/projects/camino-wt/prueba-piloto` (the user's dev server on 8797 serves `~/projects/camino`). Push the branch to `becodeb/camino` (public).
- A new playtest mode at the root of the playtest deploy; the existing demo stays intact in the code base.
- Flow: adult setup (grade, optional division letter) → session code → character → tool check → placement ladder (fixed item bank) → free play → typing minigame → wardrobe → survey → goodbye → adult form. Hidden adult controls (long-press corner: end session, log help), raised hand after the automatic help, adult help logging.
- Data: PostgreSQL 16 (`sessions`, `events`), offline-first event queue, admin page (`ADMIN_TOKEN`), export (`EXPORT_TOKEN`), `tools/export-playtest.mjs`, data dictionary `docs/prueba-piloto-datos.md`, SQL views, `RETENTION_DAYS`.
- Deploy: a separate Coolify app (compose build pack) at `https://camino-prueba.becode.com.ar` plus its sslip.io URL. Do not touch the `camino` app.
- Secrets only in Coolify env vars and `~/.credentials/camino-prueba.env` (chmod 600). Nothing secret in git.
- Out of scope: accounts, named data of any kind, the next-iteration class tools.

## Design rules

The approved rules of `odd/tasks/demo-recorrido.md` and `odd/tasks/primer-grado.md` apply (drawn habilidades universe, three kid controls, no reading required, diegetic failure, ghost hand, tap-to-add equals drag, targets ≥ 48 px). Motivation rules of `docs/next-iteration.md` §7 (no losing, no punishing timers, no rankings). Anonymous by design: no names, photos, audio or child free text (Ley 25.326 art. 2).

## Art rule

All new art is designed by Opus with the style references (`docs/style-guide.md`, `docs/screen-layout.md`, `docs/style-refs/*.png`, `src/ink/*`), drawn in code (SVG).

## Constraints

- Raspberry Pi: one writer at a time; vitest `--maxWorkers=2`.
- Never write in `~/projects/habilidades`. Never kill the dev server on 8797; 8798, 8080 and 5432 are also taken. Stop own servers by PID. Local ports for this feature: 8810 (compose app), 8811 (vite dev), 54340 (disposable test Postgres).
- Code, comments, docs, commits in English; kid-facing copy and speech in Rioplatense Spanish; the teacher is "el docente".
- Engram mirror pending: the engram MCP resolves `~/projects` as an ambiguous project and does not offer `camino`; the repo doc is the record.
- Advisory: ~400 authored changed lines per task is a planning heuristic, not a cap.

## Checks

- TDD: off (no project/session configuration). Runner: vitest (`npm test`, `--maxWorkers=2`).
- Per task: `npm run typecheck`, `npm test`, `npm run build`; the API tests against a real Postgres (disposable container on 54340); screenshots at 1366×768 and 1280×800 reviewed by the writer and re-checked by the parent; scripted browser checks with `PW=/home/opencode/.render-tools`, chromium `/usr/bin/chromium`.
- RDD: off globally by the user.

## Delivery

Forecast well over 400 authored lines (a full feature). Strategy: `single-pr`-style feature branch with work-unit commits; the user decides any PR or merge. The brief authorizes pushing the branch and deploying.

## Tasks

Route per task: delegated direct (one writer at a time; each touches 2+ non-trivial files).

- [x] T1 (P0) API and data: Node API (Hono) serving the built front end and `/api`; idempotent migrations; `sessions`/`events`; sync endpoint idempotent on (session_id, seq); admin and export endpoints with tokens; retention; `Dockerfile.prueba`, `docker-compose.prueba.yml`; self-hosted fonts; data dictionary and SQL views; `tools/export-playtest.mjs`. Checks: API tests against Postgres, compose up locally.
- [x] T2 (P0/P1) Playtest shell and telemetry client: offline queue with batched retries; adult setup and session code; flow state machine; character choice; instrumentation hooks in the level player (level_start, run, level_end, help, ghost_demo, speak, drag, tap_add, idle, visibility, error); hidden adult controls; raised hand (`call_adult`) and `adult_help`; survey; adult form; goodbye; admin page.
- [x] T3 (P0) First deploy: push, create the Coolify app, env vars, domain, verify `running:healthy` and a sync + export against the live URL.
- [x] T4 (P1) Tool check and placement ladder: two tiny tool levels; fixed item bank by concept with grade entry points and the step-up / floor rules; `ladder_step` events.
- [x] T5 (P2) Free-play menu (existing activities by grade), wardrobe step with compressed thresholds, session garden.
- [ ] T6 (P2) Typing minigame "Teclas del bosque" (new art).
- [ ] T7 (P3) 4to probe "Hacé tu juego" (rule engine extended: objects, score, lives, win/lose, avisar; Scratch equivalents; predict a Scratch script).
- [ ] T8 (P3) 5to probe "Del bloque al texto" (blocks and Python-like text side by side; predict, change a number, fix a typo).
- [ ] T9 Verification and final deploy: screenshot tours (1ro, 3ro, 5to at both sizes), scripted full 1ro and 5to sessions with an offline stretch confirming DB rows and export, locally and live.

## Progress

- 2026-09-30: worktree and branch created from `feat/primer-grado` (fe6a277); code mapped; this document created before the first source write.
- 2026-09-30: T1 done, three work-unit commits on `feat/prueba-piloto` (not pushed):
  - `566a5ac` API, migrations, admin page, API tests.
  - `e414520` Docker deploy, self-hosted fonts.
  - `dd78cdf` data dictionary, export CLI.

  Evidence:
  - `npm run typecheck` (both `tsc -b` for `src/` and `tsc -p server/tsconfig.json` for `server/`, since Node 24 runs `server/*.ts` directly by type stripping — erasable syntax only, no compile step; confirmed `node server/index.ts` starts and fails cleanly with `DATABASE_URL is required` when unset) — clean, no errors.
  - `npm test` — 18 files, 790 tests passed (front end, no Postgres needed).
  - `npm run build` — succeeds; fonts land as `dist/assets/andika-*.woff2` / `gochihand-*.woff2` (content-hashed).
  - `npm run test:api` against a disposable `postgres:16-alpine` on `:54340` — 15/15 passed: migrations run-twice idempotency, sync upsert + idempotent retry (same batch twice → one row per seq, all seqs acked both times), null-never-overwrites-non-null, 400 on invalid body, 413 on an oversized batch, 401/503 on admin and export tokens, CSV quoting (commas/quotes in a session code round-tripped correctly).
  - `docker build -f Dockerfile.prueba .` — succeeds on this arm64 host with no BuildKit cache mounts.
  - `docker compose -f docker-compose.prueba.yml -f docker-compose.prueba.override.yml -p camino-prueba-local up -d --build` (local-only gitignored `.env` with random secrets and a gitignored port override on 8810) — `camino-prueba` reported `healthy`; verified `/api/health` → `{"ok":true}`, `/` served with `cache-control: no-cache`, a sync round trip, `/admin` loading, `/api/admin/summary` and `/api/export` (JSON and CSV, correct quoting) with the tokens, and 401 with a wrong token. Torn down with `down -v`; test image removed.
  - `tools/export-playtest.mjs` run against a local `node server/index.ts` instance with `HOME` pointed at a throwaway temp directory (never touched the real `~/.credentials/`) — wrote a JSON + two CSVs to `exports/`, contents verified, then deleted.
  - Stopped `camino-prueba-testdb` (the disposable test container) at the end; never touched the user's dev server on 8797.

  Deviations from the brief: none load-bearing. Two implementation choices worth recording: (1) `v_activity_time` cannot use `lag(...) FILTER (WHERE ...) OVER (...)` — Postgres rejects `FILTER` on a non-aggregate window function — so it instead tags each row with a running count of `level_start` events and joins a `level_end` back to the `level_start` sharing that count; documented in the view's own comment and in the data dictionary. (2) The admin page embeds one self-hosted font weight (Andika regular) as a base64 `data:` URI from `server/admin/fonts/` (a duplicate of `src/fonts/andika-400-latin.woff2`, same OFL license) since that route is served directly by the API, outside the Vite-built `dist/`, and must stay self-contained and free of any Google Fonts call.

- 2026-09-30: T2 done, four work-unit commits on `feat/prueba-piloto` (not pushed):
  - `52d1577` telemetry client (offline queue, per-session seq, batched sync with capped exponential backoff and jitter, 400-only drops, 413 halving, keepalive flush, earlier page loads' sessions synced and closed as `abandoned`), idle/visibility/error watchers, the flow state machine, dev `/api` proxy and the app version define.
  - `7b9d43f` playtest mode (`#/piloto`; a `VITE_PLAYTEST=1` build opens it at the root, `#/demo` keeps the demo's home, dev drawer hidden unless `?debug`), the progress store made lazy and swappable (the playtest's own in-memory progress, reset per session), adult setup, session code, character choice (sheet-1 `ChoicePage` with optional props), placeholder steps, the corner long-press adult menu.
  - `b791f08` level instrumentation through optional LevelNav hooks (demo unchanged when absent), `PlaytestLevel`, three-step help (instruction + glowing goal; next-step ghost hand; solution footprints), the raised hand (new drawn art) and the adult help panel, a two-level stand-in ladder.
  - `077c020` spoken survey (drawn faces, activity pictures, sí/no), goodbye, adult form, new session; `tools/check-piloto.mjs`.

  Evidence:
  - `npm run typecheck` clean; `npm test` 22 files, 816 tests passed (new: `src/playtest/telemetry.test.ts` queue/seq/ack/backoff/offline/400/413/reload/keepalive/idle/errors, `flow.test.ts`, `levels.test.ts`, `mode.test.ts`, a progress-store swap test); `npm run build` ok, also with `VITE_PLAYTEST=1` (served by `node server/index.ts`: the root opens the setup, no dev tab; `#/demo` the demo; `?debug` shows the dev tab).
  - Demo regressions: `tools/check-primer.mjs` and `tools/check-3ro.mjs` against the T2 dev server (8811): all ok, no console errors.
  - `tools/check-piloto.mjs` (vite 8811 → API 8810 → disposable Postgres 54340): a whole 1ro session through the real UI with an offline stretch (11 events queued, 5 failed posts while offline) → queue drained, 31 events in Postgres with seq 0..30 and no gaps, every instrumented type present, session `end_reason adult_ended`, survey and adult form stored, the first `level_end` has `adult_helped: true`, a run after the ghost demo has `after_ghost: true`, `camino.progress.v1` never written. All checks passed.
  - Screenshots `tools/shots-piloto.mjs` (18 `pp-` scenarios × 1366×768 and 1280×800, no console errors), all reviewed. Fixed after review: the code wrapped onto two lines ("Carpincho / 29"), the choice page's small print said "Hoja 0", the raised hand covered the board's goal in the bottom-right (moved to the bottom-left, over the palette's empty end) and its hand was too small and had a stray palm line, the survey's bar and card were misplaced (the level bar's grid area), the "difficult" face looked angry (brows now worried).

  Deviations and decisions:
  - The dictionary is the contract where it differs from the brief: end-now sets `end_reason 'adult_ended'`; `help` carries `step` (1–3). New or extended fields were added to `docs/prueba-piloto-datos.md` in the same commits: `step` event, `current_step` values `code` and `adult_form`, `device.{vw,vh,dpr,lang}`, `idle.duration_ms`, `error.{source,line,col}` (no stack), `run.{program,after_ghost,help_step,worlds,culprit,guess,final}` and its non-run results (`empty`, `incomplete`, `no_guess`, `wrong_guess`), `ghost_demo.kind` (`hint`, `footprints`, `intro`; "does the demo lead to success" is read from the next run's `after_ghost`, since events are append-only), `call_adult.{help_step,hand_up}`, `adult_help.duration_ms` only when prompted, `drag.{outcome,from}`, `garden_view.seeds`.
  - ✋: a fourth press after step 3 raises the hand (not automatically after step 3); holding ✋ 1 s raises it at once. Presses while a run plays or after the page is solved are ignored (the page ignores them too).
  - The solution hint is ghost footprints of the solution's path (cheapest faithful option); songs, guardas and the rule game fall back to the next-step hint.
  - The code screen shows the word big (no drawn animal badge). Codes avoid the last 60 given on the device.
  - `ended_at` is set on reaching the goodbye (`completed`) or at the end-now gesture (`adult_ended`); a session never ended is closed as `abandoned` when the next one starts on that device.
  - The raised hand sits bottom-left and shows "recién / N min" in small print for the adult (the order of hands in class).

  For T4 (tool check + ladder):
  - A step plugs in by replacing its entry in `STEP_VIEWS` (`src/playtest/steps.tsx`); the component reads `usePlaytest()`: `next()` when done, `skip()` to leave it undone, `did(activity)` for the survey's favourites, `log(type, payload)`, `session`, `flow`.
  - Run a level inside a step: `<PlaytestLevel key={id} level={pilotLevel(id)!} activity="ladder" extra={{ concept, rung, item }} onEnd={(r) => …} watch={(s) => …} />` (`src/playtest/PlaytestLevel.tsx`, `levels.ts`). It logs `level_start`/`run`/`level_end`/`help`/`ghost_demo`/`speak`/`drag`/`tap_add`/`call_adult` itself; `extra` is merged into `level_start` and `level_end`; `watch(stats)` runs after every run and help (`stats`: runs, wins, lastResult, helpStep, adultHelped, won) and returning `'fail'` ends the item (the floor rule: two failures or the solution hint); `onEnd` gets the `level_end` payload (outcome, time_ms, attempts, help_levels, adult_helped, …).
  - Emit `ladder_step` from `onEnd`: `log('ladder_step', { concept, rung, item, result: 'pass'|'fail'|'floor', next, time_ms, help_levels })`, pass = outcome `win` with `help_levels < 3`.
  - Remove `src/playtest/SampleLadder.tsx` and `SAMPLE_LEVELS` (the stand-in).
  - The 3ro rule game (RealtimeLevel) gets 🔊/✋/raised hand through the Shell, but logs no `run` yet: add `nav.onRunReport` calls there if the ladder needs its attempts. Direct-mode (sala 4) pages are not instrumented for runs.
  - Tool-check gestures: `tap_add` and `drag` already come from the editor hooks; `tool_check` events are the step's own.

  Open (not T2): `/api/sync` allows 120 requests per IP per minute; a class of 10+ devices behind one school NAT posting every 5 s will hit 429s (the client backs off and loses nothing, but syncing slows). Raise it before the classroom sessions (T3 or T9). Engram mirror still pending (see Constraints).

- 2026-09-30: T3 done by the parent (route: inline, state-only API calls): pushed feat/prueba-piloto (75ca705); created Coolify app `camino-prueba` uuid nsb2m6xsopyv3drjwfqloigv (compose `/docker-compose.prueba.yml`, public repo); env vars POSTGRES_PASSWORD, ADMIN_TOKEN, EXPORT_TOKEN, RETENTION_DAYS set via API from `~/.credentials/camino-prueba.env` (never printed); deploy 1 finished, domains patched (`https://camino-prueba.becode.com.ar` + sslip.io), deploy 2 finished; status `running:healthy`. Live: `/api/health` 200 on both URLs, `/` 200 with `cache-control: no-cache`, `/admin` 200, `/api/export` 401 without token and 200 with it, `/api/sync` rejects a bad uuid with 400. A full sync round trip against production is deferred to T9 to avoid test rows in the real data (T9 adds a way to delete check sessions).
- 2026-09-30: parent review of T2 screenshots: the level header shows internal ids to the child ("Prueba piloto · ladder", "1ro-h1-2 · Entre dos piedras"); T4 replaces it with kid-safe copy. Raise the `/api/sync` rate limit in T4.

- 2026-09-30: T4 done (route: delegated direct, one writer; 2+ non-trivial files), two work-unit commits on `feat/prueba-piloto` (not pushed):
  - `f809464` server: `/api/sync` allows 1500 posts per IP per minute (in memory, IP never stored; a class of ~25 devices behind one NAT posts ~300); `DELETE /api/admin/sessions/:id` (ADMIN_TOKEN, cascades events, 400/404); a confirmed "Borrar" button per row on `/admin`; tests; dictionary lines.
  - `4ab9e2c` tool check (`toolCheck.ts`, `ToolCheck.tsx`), placement ladder (`ladder.ts` pure rules, `Ladder.tsx`), the walk-on and cheer interludes (`interlude.tsx`, new drawn scene; `StageView.walkTo`), rule-game run reports (`RealtimeLevel` → `nav.onRunReport`, demo unchanged without the hook), kid-safe level bar (the page's own title), `SampleLadder`/`SAMPLE_LEVELS` removed, dictionary, `check-piloto.mjs` and `shots-piloto.mjs` extended.

  Item bank (fixed; also in the dictionary):

  | Rung | Concept | Format | Item |
  |---|---|---|---|
  | 1 | sequence | solve | `1ro-h1-2` |
  | 2 | long_sequence | solve | `1ro-h2-1` |
  | 3 | fix | fix | `1ro-h3-3` |
  | 4 | predict | predict | `1ro-h3-4` |
  | 5 | repeat | solve (ghost intro) | `1ro-h4-1` |
  | 6 | repeat_count | complete | `1ro-h5-1` |
  | 7 | repeat_pattern | solve | `1ro-h6-2` |
  | 8 | before_after_repeat | solve | `1ro-h13-2` |
  | 9 | fog_si | solve | `2do-1` |
  | 10 | three_worlds | solve | `2do-2` |
  | 11 | events_rules | rule game | `3ro-1` |
  | 12 | rules_score | rule game | `3ro-2` |

  Evidence:
  - `npm run typecheck` clean; `npm test` 24 files, 841 tests (new: `ladder.test.ts` item bank, entry by grade, step up, floor check, top/ceiling/bottom/floor stops, 10-item and 12-minute caps, item result, item verdict; `toolCheck.test.ts`; `levels.test.ts` failed-run rules, rules text); `npm run build` ok; `npm run test:api` 21/21 on a disposable Postgres (54340), incl. the rate limit (25 devices × 12/min + flushes pass, a runaway IP is stopped, 429 through the route) and the delete (cascade, 404, 400, export token refused).
  - `tools/check-piloto.mjs` (vite 8811 → API 8810 → Postgres 54340): all checks passed. 1ro: the real tool check (5 `tool_check` rows in order, all done alone, the drag also a `drag` drop success, the tap a `tap_add`), ladder 1✓ 2✓ 3✗ (the fix page offline with helps 1–3, 🔊, the raised hand and the adult's answer; one failed run then ends it), `ladder_end` reason `ceiling`, ceiling 2 = `v_session_summary.ladder_ceiling_rung` = `v_ladder_ceiling` (sequence:1, long_sequence:2), 50 events seq 0..49, survey and adult form stored. 5to: the tap never done → ghost at 20 s, moved on at 40 s (`done:false, shown_by_ghost:true`, one `ghost_demo` kind `tool`), enters at rung 9 (fog), two bumps → fail, floor rung 8 passes → `ladder_end` `floor`, ceiling 8. 3ro: the rule game's runs `no_play`(0 keys), `stopped`(2 keys, `key:right(right)`), `win`(10 keys); item pass with 3 runs.
  - `/admin` in chromium: dismissing the confirm keeps the session; accepting removes it and its 14 events; the status line confirms.
  - Demo regressions against 8811: `tools/check-primer.mjs` and `tools/check-3ro.mjs` all ok, no console errors.
  - Screenshots `tools/shots-piloto.mjs` (38 `pp-` scenarios × 1366×768 and 1280×800, 76 ok, no console errors), reviewed: each tool-check gesture prompt (`pp-tool-tap/play/drag/reset/help`), the ghost dragging (`pp-tool-ghost`), ladder items of each board kind (`pp-ladder-sequence/fix/predict/repeat/count/pattern/fog/fog-prints/worlds/worlds-prints/rules/score`), the walk (`pp-ladder-walk`) and the cheer (`pp-ladder-cheer`). Fixed after review: one-row tool boards got a tall sky with a cloud poking out of the sheet (now 2×2 and 4×2); the ↺ gesture was never detected (a stale closure in the click listener), so the ring stayed on ↺ and never moved to ✋.

  Decisions and deviations:
  - A failed run is a run that ran and did not win: not `empty`/`incomplete`/`no_guess`/`no_play`, and not the given program run unchanged on a fix page (pressing ▶ first to see the mistake is part of fixing it).
  - Item end: two failed runs, 3 minutes, or, after the solution hint or an adult's help (the result is already a fail), the next failed run: the child gets one more try with the help instead of the page vanishing under the footprints. A solved page is never cut; it turns by itself after 8 s if the child does not turn it. `watch` also runs every 5 s for the time limit.
  - Rule game: a run is one game (▶ to ■/↺/the win); `stopped` = stopped after the child pressed an arrow (failed run), `no_play` = before any arrow (not failed); the ghost's own presses do not count. A game still running when the page ends logs no run.
  - `ladder_step.result` is `pass`|`fail` plus `check: 'climb'|'floor'` (the dictionary's old `floor` result is gone: a floor check that passes must count toward the ceiling). `ladder_end` added (entry, ceiling, items, time, reason). No migration needed: `v_ladder_ceiling` and `v_session_summary` already agree with one concept per rung (only a comment in `001_init.sql` changed).
  - `tool_check` payload replaced (`{gesture, done, time_ms, attempts, shown_by_ghost, level_id, via?}` instead of `{control, success}`; nothing was logged with the old shape).
  - "One forced fail → floor → stop" cannot happen in a 1ro session (entry rung 1, nothing below); the scripted 1ro session stops at the ceiling and the 5to session covers the floor check.
  - Caps are checked between items: an item open at 12 minutes finishes (at most 3 more minutes).
  - The 3ro rule game played its first-entry ghost demo once per page load; a new session now clears that memory (`forgetRealtimeIntros`) so the next child on the same device sees it too.

  For T5 (free play, wardrobe, garden):
  - Steps plug into `STEP_VIEWS` as before; `WalkOn` and `Cheer` (`interlude.tsx`) are reusable between activities.
  - `PlaytestLevel` now also takes `listen` (every event it logs), `autoNextMs` and runs `watch` every 5 s; `LevelStats.fails` counts failed runs.
  - The level pages' spoken lines still say "Brote" when the child picked another character (demo text, pre-existing).
  - After the ladder the flow reaches free play (still the placeholder).

- 2026-09-30: T5 done (route: delegated direct, one writer; 2+ non-trivial files), three work-unit commits on `feat/prueba-piloto` (not pushed):
  - `51deca9` the chosen character's name instead of "Brote": a speech filter (`ui/speech.ts` `setSpeechFilter`, installed by PlaytestScreen) and `withName` on level titles (`src/playtest/characterName.ts`; Mina takes "la": "¿La ayudás…?"); unit test sweeps every 1ro/demo line and title for the three other characters.
  - `38de12a` free play: the drawn menu (`FreePlay.tsx`, data in `freePlay.ts`, new card art in `menuArt.tsx`), the hash hold (`hashHold.ts`: the year's screens move by the hash; the playtest keeps it and routes changes to the open activity, a reload starts a new session), `LevelWrapContext` in `levelKit`/`LevelScreen` (instruments pages hosted by another screen; `PlaytestLevel` split into `Instrumented`/`InstrumentedPage`, every solved page plants a seed), the back-to-menu button in each page's bar, `choice` {activity, visit}/{door}, `activity_end`, migration `002_activity_time.sql` (`v_activity_time` counts free-play visits whole), the 12-minute budget, the free rule game page `pp-reglas`, the probe registry (`probes.ts`), the survey's pictures from the menu art; dictionary, API test, check and shots extended.
  - `4d216e4` wardrobe step (`WardrobeStep.tsx`: WardrobePage with new optional props `onPick`/`onTap`/`next`/`quit`/`title`; `rewards.ts` `setUnlocks`/`unlockOf`, the playtest's thresholds), the goodbye garden (`SessionGarden.tsx`, `GardenMe` exported), `garden_view` with arrivals and outfit; dictionary, tests, check and shots.

  Free-play sets (menu order; `freePlay.ts` MENU):

  | Grade | Cards |
  |---|---|
  | 1ro | sheet 6 "La escalera" (doors + boss) · recess (sheet 9) · guardas (sheet 14) · editor (sheet 7 workshop + corkboard) |
  | 2do | sheet 8 "Zigzag" · recess · guardas · editor (sheet 7) |
  | 3ro | rule game (`3ro-1`, `3ro-2`, then `pp-reglas`) · sheet 13 "Antes y después" · recess · editor (sheet 7) |
  | 4to | rule game · editor (sheet 15, few lines) · recess · `game_maker` (T7, when registered) |
  | 5to | rule game · editor (sheet 15) · recess · `text_probe` (T8, when registered) |

  Evidence:
  - `npm run typecheck` clean; `npm test` 27 files, 858 tests (new: `characterName.test.ts`, `freePlay.test.ts` menus/probe filter/sheets built/budget verdict/`?libre`, `wardrobe.test.ts` thresholds, unlock override on/off, garden frame); `npm run build` ok; `npm run test:api` 22/22 on a disposable Postgres (54340), incl. `v_activity_time` with visits whole plus ladder pages.
  - `tools/check-piloto.mjs` (vite 8811 → API 8810 → Postgres 54340): all checks passed. 1ro: menu `sheet,recess,guardas,editor`; sheet 6 pages 1–3 solved, the easy door from the bar, its first extra solved, back to the menu; recess page 1 solved, back; budget set to 0 on the menu → the cheer → the typing placeholder → wardrobe (scarf on, hat on/off, crown locked, "listo") → survey → goodbye garden with the session's 8 seeds (8 plants, the character in it). DB: choices `sheet#1 door:easy recess#2`; `activity_end` sheet {levels 6, wins 4, extras 1, reason menu} and recess; the extra's `level_end` has `page: extra, door: easy, sheet: 6`; `v_activity_time` sheet 50 s (= its visit), recess, ladder, tool_check; wardrobe events `open,on,on,off,locked,close` (locked says `needs: 16`, close keeps `{neck: bufanda}`); `garden_view` {seeds 8, outfit}. 5to now ends from the adult's corner (`adult_ended`); 1ro ends `completed`.
  - Demo regressions against 8811: `tools/check-primer.mjs` (37 ok) and `tools/check-3ro.mjs` (8 ok), no console errors.
  - Screenshots (`tools/shots-piloto.mjs`, 55 scenarios × 2 sizes = 110 ok, no console errors; new `pp-fp-*`, `pp-wardrobe-*`, `pp-bye-garden`) at 1366×768 and 1280×800, reviewed: menus of 1ro, 3ro, 5to; each activity as opened (sheet, doors, recess, guardas, editor, 3ro rules and sheet, 5to editor); the time-over cheer; Mina's title ("…cuando aprieto una flecha, Mina se mueve"); the wardrobe with locks; the goodbye garden; the survey's favourites. Fixed after review: the menu was one short row in a mostly empty page (now 2×2 for four cards, sized by the screen height); the back-to-menu button first sat bottom-right over the doors page's next-page button, then bottom-left over the rule game's last palette block (now in each page's bar, before ✋, via a portal; bottom-left only on a page without a bar); the year's "Hoja 7 · taller" small print on non-level pages (hidden in free play); the goodbye garden showed a few plants lost in the meadow (now huddled round the first bed with the character beside it and framed close); the wardrobe thresholds were out of the hooks' order (now 0, 0, 4, 7, 10, 13, 16 in the year's order); a setState during render in the free-play mount.

  Decisions and deviations:
  - `corkboard` is not a separate activity: the corkboard lives inside the workshop card (`editor`); its pages log `page: 'card'`, the author's test page `page: 'test'`.
  - The 1ro sheet is 6 (doors + boss, the staircase, a critter boss: the fox). 2do gets sheet 8, 3ro sheet 13, 4to/5to the limited workshop (sheet 15). The rule game ends with a new free page `pp-reglas` (every key and move, eight seeds).
  - Voluntary extras = extra and boss pages solved (`activity_end.extras`); every page played is a level_start/level_end with `page`/`door`, so opened-but-not-solved extras are countable too.
  - A door choice is logged when the child opens a page behind another door than the page before (doors page or bar).
  - Budget: 12 min, `?libre=<min>` (1–30) in the URL; never cuts a level; a non-level page gets 2 minutes' grace. The adult's skip still works (`activity_end.reason: left`).
  - Seeds: every page solved plants a seed once per page id (the year's `solve`); a page replayed (a ladder item met again in a sheet) plants none; gold challenges plant none (as in the year). The workshop's test page plants one in the playtest.
  - Thresholds for the wardrobe: everyone gets the scarf and the mushroom hat (0 seeds); the locks are the year's silhouettes with the seed count tag (no separate padlock drawing).
  - The character in the wardrobe can still be changed; it logs `wardrobe` {character} and a `choice` with `where: 'wardrobe'`.
  - The menu cards' board thumbnails always draw Brote (the year's `PageThumb`).

  For T6 (typing, "Teclas del bosque"):
  - Plug a component into `STEP_VIEWS.typing` (`steps.tsx`); read `usePlaytest()`.
  - Seeds: plant one per round or word caught with `progress.update((p) => solve(p, 'typing-<n>'))` (unique ids; `solve` gives one seed per new id); they show in the pouch, the wardrobe unlocks and the goodbye garden. Log `level_start`/`level_end` with `activity: 'typing'` if rounds are levels (then `v_activity_time` counts them by pages), otherwise log an `activity_end`-like summary and extend the view (only free-play ids use `activity_end` now).
  - Watch out: dev mode toggles on typing "d-e-v" or the backtick (`ui/devMode.ts`): in the playtest that would open doors and more; guard it in the typing step (or globally in the playtest).
  - Spoken lines go through the speech filter (the character's name is put in for "Brote").

  For T7/T8 (the probes):
  - Register the component in `src/playtest/probes.ts` (`PROBES.game_maker = GameMaker`, `PROBES.text_probe = TextProbe`); the card then shows on the 4to/5to menu (`freePlay.ts` MENU; art in `menuArt.tsx` `GameMakerCard`/`TextProbeCard`, change freely).
  - The component gets `ProbeProps`: `activity`, `levelEnded(end)` (pass PlaytestLevel's `onEnd` result: free play counts it and its time budget ends only between pages), `done()` (back to the menu). Play pages with `<PlaytestLevel activity={activity} …/>`; any other events via `usePlaytest().log`. Free play logs the pick, the back button (in the page's bar), `activity_end`, and the seeds of pages solved.

  Open: the free rule page `pp-reglas` and the 4to/5to editor were only seen in screenshots, not played through by the check; T9's tours should play one of each. Engram mirror still pending.

## Next step

T6 (typing minigame "Teclas del bosque").
