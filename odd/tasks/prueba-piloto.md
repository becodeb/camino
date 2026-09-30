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
- [x] T6 (P2) Typing minigame "Teclas del bosque" (new art); dev mode guarded in playtest builds; no sheet stake in the goodbye garden.
- [x] T7 (P3) 4to probe "Hacé tu juego" (rule engine extended: objects, score, lives, win/lose, avisar; Scratch equivalents; predict a Scratch script).
- [x] T8 (P3) 5to probe "Del bloque al texto" (blocks and Python-like text side by side; predict, change a number, fix a typo).
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

- 2026-09-30: T6 done (route: delegated direct, one writer; 2+ non-trivial files), three work-unit commits on `feat/prueba-piloto` (not pushed), plus this record:
  - `2fada65` dev mode stays off in a `VITE_PLAYTEST=1` build without `?debug` (the keys, `?dev` and a stored state); the drawer's key listener moved to `ui/devMode.ts` (`devKeyListener`, `devAllowed`) and unit-tested (`devMode.test.ts`, including the store in a stubbed playtest build).
  - `d599433` the goodbye garden leaves out the year's markers: no sheet-number stake by a finished sheet's tree (`SheetPlant stake={false}`), no dotted "next seeds" spots in the beds.
  - `ca59978` "Teclas del bosque": `typing.ts` (pure rules), `typingArt.tsx` (new art), `TypingStep.tsx` (the step), `003_typing.sql` (`v_typing_by_grade` extended, `v_activity_time` counts `typing_end`), dictionary, API test, `check-piloto.mjs` and `shots-piloto.mjs` extended; the placeholder step removed.

  Letter and word sets (`src/playtest/typing.ts`; also in the dictionary):

  | Grade | Mode | Items |
  |---|---|---|
  | 1ro | letters (`vowels`, `letters`) | a e i o u first (shuffled), then those and m s l p t n mixed; never twice in a row. One seed at a time, two from speed 3. |
  | 2do | words (`words`) | sol mar pan oso while slow (speed ≤ 2), then sapo pato casa luna mesa nube rana taza lupa mapa |
  | 3ro–5to | words (`commands`) | si ir mover girar parar sumar tocar (speed 1), + saltar pintar (2), + repetir avanzar esperar (3+) |

  Speed (1–6, top 4 for 1ro, 5 for 2do): starts at 1; three quick right keys in a row → faster (a first letter within 2 s of the item's appearance, a next letter within 1.2 s of the key before); two wrong keys, a slow right key (5 s / 3.5 s) or an item reaching the ground → slower. A letter falls in 11 s (speed 1) to 4.4 s (6); a word in 3.5 s + 3 s to 1.2 s per letter. A seed for the garden every 5 letters or 2 words (at most 8 per game). About 4 minutes (`?teclas=<min>`, 0.25–10), "listo" after 1 minute; never cut mid-word.

  Evidence:
  - `npm run typecheck` clean; `npm test` 29 files, 883 tests (new: `typing.test.ts` 19 — sets by grade, every item typeable on the drawn keyboard and named aloud, 1ro's vowels first and no repeats, word length by speed and no recent repeats, seeded replay, `keyOf` (case, accents, ñ, non-characters), word scoring in order with wrong keys losing nothing, the adaptive speed (streak up, middling key, two misses / slow key / landed down, floor 1, grade caps, fall times, items at once), seeds and `?teclas`; `devMode.test.ts` 6); `npm run build` ok (also `VITE_PLAYTEST=1`); `npm run test:api` 23/23 on a disposable Postgres (54340, own `apitest` database), incl. `v_typing_by_grade` (accuracy, medians, sessions, touch keys, liked yes/mid/no, the survey's own `liked` not counted) and `v_activity_time` typing from `typing_end`.
  - The dev guard in a real `VITE_PLAYTEST=1` build (served statically): `?dev#/demo` + d-e-v + ` → no stored dev state, no drawer; `?debug#/demo` → the drawer opens and folds.
  - `tools/check-piloto.mjs` (vite 8811 → API 8810 → Postgres 54340): all checks passed. 1ro (`?teclas=0.5`): the intro's ghost hand gives way to the game, five letters caught with the real keyboard (the first five are the vowels), a wrong key, d-e-v and ` pressed in the game (dev mode stays off, the d is a wrong `typing` key), ✋ (the key glows harder; a `help` step 1), 🔊 (`speak`), the time ends it (`typing_end` reason `time`, caught 5, seeds 1), "¿Te gustó?" yes, the survey offers the typing picture, the goodbye garden grows the typing seed (9). 5to (`?tactil&teclas=1`): 27 drawn keys are buttons of 57×59 px, a command word ("mover") typed with its first letter tapped, a wrong key, the rest on the keyboard (`input` touch and physical, `typing_end.input` mixed), "listo" ends it (`done`), "¿Te gustó?" more or less. DB: `typing` rows = the game's key count with the full shape, `typing_end`, `typing_liked` answers, `v_typing_by_grade` equal to the rows counted directly for 1ro and 5to, `v_activity_time` typing = `typing_end.time_ms`.
  - Demo regressions against 8811: `tools/check-primer.mjs` and `tools/check-3ro.mjs` all ok, no console errors.
  - Screenshots (`tools/shots-piloto.mjs`, new `pp-tk-*`) at 1366×768 and 1280×800, reviewed: 1ro intro (the ghost hand on the drawn A), falling, a catch (the seed flying into the basket), a wrong key (pink P wobbling, E still circled), ✋ (the key bigger with a thick ring), two seeds at speed 3, a seed flying off with the character cheering and the basket filling, 2do/3ro/5to words half typed (typed letters in blue pen, underlined; the next one on a yellow mark), a word landed, the touch keyboard, "listo", "¿Te gustó?", the cheer, the survey's favourites with the typing picture (`pp-tk-survey`); `pp-bye-garden` without the "6" stake. The whole tour (`pp-`, 69 scenarios × 2 sizes = 138; `pp-tk-survey` added and shot after it) ran with no console errors. Fixed after review: the seeds were small and the uppercase letter floated beside them in blue (now 1.3× and a little drawn key tied to the seed with a string, printed like the keyboard's), word letters spaced like separate letters (44 → 34 units), the character and basket small in the scene, the canopy low (less fall to see), the right lane's seed on the trunk, keys a bit big for the scene's height, the survey's typing picture (a generic keyboard; now the game's seed with its letter falling to a key).

  Decisions and deviations:
  - 1ro's seeds show the lowercase letter big and, beside it, the letter as the keyboard prints it (uppercase) on a little drawn key; words show lowercase only (the keyboard highlights the key, printed uppercase). 2do+ never get letters alone.
  - Liking: `survey_answer` {question: `typing_liked`, answer yes/mid/no}, asked right after the game with the survey's three faces; not mirrored onto `sessions.survey` (the survey step owns that field). `v_typing_by_grade` gains `liked_yes/mid/no` plus `sessions`, `median_correct_latency_ms`, `touch_attempts` (original columns first, unchanged).
  - No `level_start`/`level_end` for the game (an outcome win/fail would pollute `levels_won`): one `typing_end` summary instead, and `v_activity_time` counts its `time_ms` (migration 003). Its `help`/`speak`/`ghost_demo` carry `level_id: 'typing'`; the adult's help during it marks `typing_end.adult_helped`.
  - `typing` payload extended: `speed_level`, `input`, `item`, `set`, `pos`. Only printable keys are logged (not Shift/arrows/space/a dead key alone, not a held key's repeats, not a key while nothing falls). On 1ro's two seeds a key matching either catches it.
  - Keys: while the game is on screen (intro and play) a capture listener takes printable keys, the space and the backtick (preventDefault + stopPropagation), so no find-as-you-type, no dev shortcut, no other screen's keys; Ctrl/Alt/Meta shortcuts are left alone. The liking question has no key handling.
  - Touch: on a touch screen (`maxTouchPoints > 0` or a coarse pointer; `?tactil` forces it) the drawn keys are buttons (pointerdown) and the spoken intro says "Tocala en el teclado del dibujo"; without touch they are drawings (the real keyboard types).
  - ✋: 1 = the letter is said and the key glows harder; 2–3 = the ghost hand also points at the key (`ghost_demo` hint); a fourth press or a held ✋ raises the hand. 🔊 says the intro and the current item.
  - Sound: the xylophone of sheet 9 (`ringNote`), a note per right letter, "sol" for a word caught; wrong keys make no sound.

  Open: never tried with real children, real speech voices, a real touch Chromebook or a Spanish physical keyboard (Playwright sends `ñ` directly; a real Ñ key and a dead-key á are handled by `keyOf` but were not pressed on hardware). Engram mirror still pending.

- 2026-09-30: T7 done (route: delegated direct, one writer; 2+ non-trivial files), four work-unit commits on `feat/prueba-piloto` (not pushed), plus this record:
  - `37790a1` the engine `src/game/gameMaker.ts` (+ 37 unit tests): several objects with their own rule cards on one board, new hats and actions, chip edits, `compact()`, `broadcasts()`, `endings()` and the Scratch script of every rule (`scratchOf`). A sibling of `rules.ts`, which is untouched (3ro's pages keep their engine byte for byte; a test also replays both 3ro pages to their win).
  - `2ff10f3` the probe: `GameMaker.tsx` (phases, workshop, board, predictions, liking), `gameMakerProbe.ts` (+ tests: phase rules, the fixed items), `gameMakerArt.tsx` and `gameMakerBlocks.tsx` (new art), `gameMaker.css`; registered in `probes.ts`; the adult's corner menu opens it for any grade during free play (`openProbe`, `choice.by: 'adult'`); 16 `pp-gm-*` screenshot scenarios. The board grew to 7 × 6 in this commit (more room to catch, and it fills the stage).
  - `47a52d5` data: `004_game_maker.sql` (`v_probe_game_maker`, `v_probe_game_maker_by_grade`), the dictionary's probe section and events, an API test, `tools/check-juego.mjs`; the help's ghost edits marked `ghost: true` and left out of the view and of phase completion.
  - `b70791f` a drawing fix found in review (the "nobody speaks" answer).

  What the child sees (4to reads, so short words on blocks; speech says everything): palette | rule cards per object (tabs: the character, semilla, piedra, juego, "+ pájaro") with "La Traductora" beside each card (the same rule as a Scratch script: hats, stacks, C-blocks, round/boolean/dropdown inputs, the green flag, in Scratch's colours with the notebook's ink edge; Spanish Scratch 3 wording) | the board (7 × 6, a grass ground, the HUD: the trophy that stands for the whole game, the jar with the points, the hearts), ▶/■ and ↺ above, the drawn arrow keys below. Blocks are `kind:param` strings; the param is a chip (Scratch's dropdown) that a tap cycles. Phases: 1 play the ready game (catch seeds, a stone takes a life; 5 points win, 0 lives lose; rules shown, not editable), 2 change one rule (the ghost hand points at the seed's number; "que valga 2") and play again, 3 your own game (add rules, the bird, avisar/cuando recibo, the win condition), then three fixed Scratch predictions and "¿Te gustó hacer tu juego?". A game ends with a drawn card ("¡Ganaste!" with stars, or "¡Se acabaron las vidas!" with the hearts filling again) and "¡Otra vez!". ✋: 1 the line again and the target wiggles, 2 the ghost points (▶ and keys / the number / a drag of avisar), 3 the ghost builds a working rule for real (plays arrows / makes the seed worth 2 / adds the bird with "cuando recibo ¡ñam! → decir ¡Pío!" and "avisar ¡ñam!" on the seed's catch), a fourth press or a held ✋ raises the hand.

  Evidence:
  - `npm run typecheck` clean; `npm test` 31 files, 927 tests (new: `gameMaker.test.ts` 37 — the ready game falls, moves, shrugs, wins at 5, loses at 0 lives, is deterministic; start, say, ahead/turn/edge, hide/show, touch fires once, ranges, a seed worth 2; broadcast heard next tick by every listener, unheard messages, no loop within a tick; win/lose and game hats; edits add/remove/chip/dup/full/not-here/add bird; compact; La Traductora wording; 3ro's two pages still win; `gameMakerProbe.test.ts` 7); `npm run build` ok; `npm run test:api` 24/24 on a disposable Postgres (54340, database `apitest`), incl. both new views (a whole probe and a left one, ghost edits excluded, by-grade median and counts).
  - `tools/check-juego.mjs` (vite 8811 → API 8810 → Postgres 54340, `camino-prueba-t7db`): all checks passed. 4to: menu `rule_game,editor,recess,game_maker`; phase 1 not editable, three cards each with its Scratch script; the ready game played with the arrows until it ended (won), "¡Otra vez!" on the end card, the page turned; phase 2 opens on the seed, its number tapped to 2, the Scratch script follows ("sumar 2 a puntos"), a game, ■, next; phase 3: the bird added from its tab, "cuando recibo ¡ñam!" dragged into the notebook (a real mouse drag), "decir" tapped in and its chip tapped twice to ¡Pío!, the seed's catch card activated and "avisar ¡ñam!" tapped into it (La Traductora: "enviar ¡ñam!"), the win condition 5 → 10, a game until a seed was caught and the bird heard the message; predictions right / wrong / right; liked yes; the cheer; back to the menu. 5to: no card on the menu; the adult's corner menu opened it; phase 3; ✋ ×3 built the bird's rule. DB: 28 events seq 0..27; `probe_phase` play/change/make all completed; the eight `rule_edit` rows in order with the right object/hat/action/op and no ghost; `game_run` of phase 1 won with 14 keys; phase 3's run `broadcasts: [yum]`, `messages_heard` 1, `win_points` 10, the compact rules with the bird and avisar; `scratch_predict` key✓ star✗ broadcast✓ with time and position; `game_maker_liked` yes; `probe_end` done; `activity_end` game_maker done (levels 1, wins 1); `v_probe_game_maker` agrees (3 phases, 8 edits: 4 adds 4 changes, bird, 2 broadcast edits, 1 win-condition edit, 3 games, 2/3 predictions, liked yes); 5to: `choice.by: 'adult'`, 6 ghost edits all `ghost: true`, help steps 1,2,3 and a `ghost_demo` kind `rule`, the view shows 0 own edits and `left`.
  - Regressions against 8811: `tools/check-primer.mjs`, `tools/check-3ro.mjs` and the whole `tools/check-piloto.mjs` (PSQL → the T7 container) all passed, no console errors.
  - Screenshots (`tools/shots-piloto.mjs`, new `pp-gm-*`: 16 scenarios × 1366×768 and 1280×800 = 32 ok, no console errors), all reviewed: the 4to menu, the ready game playing, the stone's rules, phase 2 (and the number changed), the game's own rules (win/lose → "si puntos = 5 entonces decir ¡Ganaste! / detener todos"), a broadcast between Mina and the bird (the envelope on its arc, the cards ringed as they fire, ¡Pío!), the win and lose ends, ✋ 3 in phase 3, the three predictions, the liking faces. Fixed after review: the character was tiny on the board (now 92 units in a 64 cell); the board 7 × 5 left the stage half empty (now 7 × 6, the keys under it); the palette's last block cut off (blocks 46/38 high); the firing card flashed a square box-shadow (now a blue pen ring and the hat's ear twitch, as in 3ro); the ground chip was an unreadable glyph (now glyph + "suelo"/"borde"); the prediction questions said "Brote" on screen (the speech filter only changes speech: now the character's name in the text); the prediction page was centred and its bar narrow (`.pp-page` specificity); the end card stretched across the HUD (the stage's `.sheet { width: 100% }`); the bar's "Hacé tu juego" was hidden by free play's rule on `.adult-title b` (now in the small print); the help's third step did nothing (its own ghost taps were blocked by the "ghost is working" guard); the "nobody speaks" answer too small.

  Decisions and deviations:
  - A sibling engine (`gameMaker.ts`) instead of editing `rules.ts`: "extend 3ro's engine" keeps 3ro byte-identical this way; it borrows `nextRandom` and `TICK_MS`. Moves are instant cell steps (the view eases them), touches fire once when they begin, messages are heard on the next tick (never a loop), a rule chain within one moment is capped at depth 3.
  - Objects: the child's character, a seed, a stone (the ready game) and a bird the child may add; the "juego" object (a trophy on the HUD) holds the win/lose rules, like Scratch's stage. Win/lose conditions are rules ("si los puntos llegan a [5] → ganás", "si las vidas llegan a 0 → perdés"), so setting one is an ordinary edit. Lives start at 3; "add a life" is "sumar [1] vida".
  - "Cada tanto" is "siempre": each sprite at its own pace (seed 0.5 s, stone 0.6 s, bird 0.4 s); La Traductora renders it as "por siempre … esperar 0.5 segundos".
  - Scratch wording follows the brief ("sumar 1 a puntos", "enviar ¡ñam!", "al recibir…"; real Scratch 3 in Spanish may say "cambiar [puntos] por 1"). "Volver arriba" is "ir a x: (al azar) y: 160" (the green reporter shortened). Touching the ground is "¿tocando suelo?" as if the ground were a sprite.
  - ↺ resets the board, not the rules (the child's rules are the probe's product; losing them to ↺ would be harsh). ▶ is Scratch's green flag.
  - Phase completion: 1 = a game with at least one arrow; 2 and 3 = an own edit and a game started after it. The next page shows then (phase 1: after a game ends or 45 s of play), or after 90 s / 3 min / 4 min anyway. The ghost's edits never complete a phase.
  - Predictions are never marked right or wrong to the child (the answer is said, then the next item); `correct` is only in the data. Items and answer positions are fixed (right answer at 2nd, 1st, 3rd).
  - `probe_end` added (done/left, time) so a probe left midway is visible; `survey_answer` {question: 'game_maker_liked'} as T6 did, not on `sessions.survey`.
  - 5to: no card on 5to's menu (it would be a fifth card and the menu is designed for four); the adult's corner menu opens it for any grade during free play (cheap, also the testing route).
  - Free play's budget treats the whole probe as one page (never cut; free play moves on when it ends).
  - Drag: palette → notebook (a hat makes a card, an action goes into the card under the finger), notebook → outside removes; taps equal drags (a tap adds to the active card, a tap on a card's action removes it, a tap on a hat makes its card active). Moving an action between cards is not supported (drag out and add again).

  Open: never tried with real children, voices or a touch Chromebook (touch drag is the same pointer code as the mouse drag the check used); the probe's length (~10 min) is a guess; the prediction item 3 draws the stone touching the character in every answer (only who speaks differs) — the adult may watch whether children read "enviar/al recibir" or just guess "the one with the bubble". The board's layout leaves some empty paper under the keys at 1366×768. Engram mirror still pending.

  For T8 ("Del bloque al texto", 5to):
  - Register `PROBES.text_probe` in `probes.ts` like `game_maker`; `openProbe('text_probe')` from the adult menu works the same way if you add a button (only game_maker has one now).
  - Reusable: `ScratchScript` (`gameMakerBlocks.tsx`) draws any `SBlock[]` (hats, stacks, C-blocks, inputs) if a Scratch-like block view helps; `PhaseSteps`, `Outcome`/`MiniBoard`-style drawn answers and the `Predict` page pattern (fixed items, `position`, `time_ms`, never marked); the `Liked` pattern with its own question id (`text_probe_liked`); `probe_phase`/`probe_end` with `probe: 'text_probe'` so one view pattern (004) can be copied.
  - `.pp-page` centres its content: use `.pp-page.<yours>` to lay a page out from the top. The stage's `.sheet { width: 100% }` rule in `.mode-gm` stretches any `.sheet` inside it.
  - A probe's own help steps must not be blocked by the "ghost is working" guard when the ghost itself applies them.

- 2026-09-30: T8 done (route: delegated direct, one writer; 2+ non-trivial files), three work-unit commits on `feat/prueba-piloto` (not pushed), plus this record:
  - `3234a4b` the text language `src/game/textCode.ts` (+ 66 unit tests): a strict parser for the subset, `runText` (the engine's own `applyCommand`, the line of every step), `toProgram`/`fromProgram`, `lineKeys`/`keyLines` (line ↔ block ref), `storedText`, `colorLine`, 19 error kinds each with its line and one Rioplatense sentence (`show` on screen, `say` spoken without code punctuation), the likely word for a slip (edit distance with swaps, accents and case forgiven).
  - `d6669b1` the probe: `TextProbe.tsx` (tour, predict/choice/edit pages, the code editor, blocks zone, liking), `textProbe.ts` (the fixed items + 14 tests), `textProbeArt.tsx` (stamps, bar doodle, drawn answer boards, note arrow), `textProbe.css`; registered in `probes.ts` (5to's fourth card) and an "Abrir «Del bloque al texto»" button in the adult menu; 19 `pp-tx-*` screenshot scenarios.
  - `0a49865` data: `005_text_probe.sql` (`v_probe_text`, `v_probe_text_by_grade`), the dictionary's section (language, error kinds, item table, events), an API test, `tools/check-texto.mjs`.

  The text (documented in `textCode.ts` and the dictionary): `derecha()` `izquierda()` `arriba()` `abajo()` (Camino's absolute arrows), `saltar()` (a jump right), `for i in range(n):` (any loop name, 0–20), `while not llegue():`, `if hay_piedra():` (looks right) and `else:` (text only). `if hay_piedra():` + only `saltar()` is the "si hay piedra [saltar]" block; any other if runs but has no blocks (the blocks side stays dimmed on the last program that had them).

  Items (fixed, in stamp order; also in the dictionary):

  | # | Item | Kind | Task | Right |
  |---|---|---|---|---|
  | 1 | `predict_loop` | predict | `derecha()` / `for i in range(3): arriba()` / `derecha()`, 5×4 board | `end_2_0` (2nd) |
  | 2 | `predict_if` | predict | `for i in range(4): if hay_piedra(): saltar()` / `derecha()`, row with 2 rocks | `end_8` (1st; `bump_1`, `end_4`) |
  | 3 | `number` | number | `range(2)` → reach the seed (caret after the 2; blocks follow the text) | `range(4)` |
  | 4 | `typo_name` | typo | `drecha()` on line 3 (no blocks) | `derecha()` |
  | 5 | `typo_colon` | typo | `for i in range(2)` without `:` (no blocks) | `:` |
  | 6 | `blocks_loop` | blocks_to_text | → , repetir 3 {↑ →} | `same` (3rd; `outside` = indentation, `count2`) |
  | 7 | `blocks_until` | blocks_to_text | repetir hasta llegar {si hay piedra [saltar], →} | `same` (2nd; `inside_if` = indentation, `for3`) |
  | 8 | `write_if` | write (stretch, "si querés") | write `saltar()` on the empty line inside the if | reaches the seed |

  Evidence:
  - `npm run typecheck` clean; `npm test` 33 files, 1007 tests (new: `textCode.test.ts` 66 — every valid form, each of the 19 error kinds with its line (38 cases), the child's sentences, suggestions, `runText` lines and refs, the if's look/jump lines, else, a bump, the endless while, 7 programs whose trace equals `simulate` exactly on two boards, round trips text ↔ Program, no text for blocks outside the subset and no blocks for text-only forms, line ↔ block keys, `storedText`, `colorLine`; `textProbe.test.ts` 14 — the tour wins and round-trips, each predict's right drawing is where the program really ends and no other is, fixed answer positions, each edit item's given text does not win and its fix does with one line changed (the focus line, the caret on it), the typos' errors on their lines, each choice's answer is exactly the blocks' program, round trips, `nextOpen`); `npm run build` ok; `npm run test:api` 25/25 on a disposable Postgres (`camino-prueba-t8db`, 54340, database `apitest`), incl. the new views (an item left then solved counts once; a ghost fix is not correct; solo; runs without the tour; error kinds; by grade median).
  - `tools/check-texto.mjs` (vite 8811 → API 8810 → Postgres 54340): all checks passed. 5to: menu `rule_game,editor,recess,text_probe`; tour: a tap on line 3 rings the arrow inside the repeat, ▶ lit lines 1, 3, 4; predict right then wrong; number: Backspace + 4 with the real keyboard at the starting caret, the repeat block shows 4, a backtick typed in the editor lands in the text and dev mode stays off, then erased; the editor has spellcheck/autocorrect/autocapitalize off; runs to the seed; typo_name: ▶ shows "En la línea 3 dice «drecha» y esa palabra no la conozco. ¿Será «derecha»?", line 3 ringed, the missing e typed, the note goes, the seed; typo_colon: the error, End + `:`, the seed; blocks right then wrong; write_if: the `empty_block` error, `saltar()` typed, the seed; liked yes; cheer; menu. 3ro: the adult's corner menu opened it; the typo_colon stamp; ✋ ×3 wrote the fix (ghost edit); ▶ the seed; back to the menu. DB: 29 events seq 0..28; 8 `text_item` rows in order with answers/positions/texts/errors/attempts; `text_run` errors `typo_name:unknown_name:3, typo_colon:missing_colon:1, write_if:empty_block:2`; probe_phase intro/items completed; `text_probe_liked` yes; `probe_end` done; `activity_end` text_probe done; `v_probe_text` tried 8, correct 6, solo 6, correct by kind, runs 7, won 4, parse errors 3; 3ro: `choice.by: adult`, `ghost_fixed: true, correct: false, help_levels: 3`, help 1,2,3 + `ghost_demo` fix, `probe_end` left, view correct 0.
  - Regressions against 8811: `tools/check-primer.mjs` (37 ok), `tools/check-3ro.mjs` (8 ok), `tools/check-piloto.mjs` (122 ok, PSQL → the T8 container), no console errors.
  - Screenshots (`tools/shots-piloto.mjs`, 19 `pp-tx-*` scenarios × 1366×768 and 1280×800, no console errors), all reviewed: 5to menu, the tour (still, a line linked with its block, running with line 3 lit and the block ringed), predict (the 5×4 and the row), each after the pick and during the run, number (start, edited: the repeat shows 4, running with the pass dots filling), the friendly errors (typo name, colon, the stretch's empty line), ✋ 3's ghost fix, blocks → text (both, one picked), the stretch item, the liking faces. Fixed after review: the syntax colours' `tk-*` classes collided with the typing game's (a space span was a block: the code broke into rows; now `txk-*`/`txa-*`); the predict boards took the whole stage and hid the answers (a CSS variable resolved at the root: the board size now lives on the stage); the error note covered the next code line (now under the program); a stray blue "focus corner" on the editor; the row board smaller than its answers; the choices' text clipped at 1280 (fluid font); the ghost's fix mark faded before the child looked (now stays until the next edit or run); the repeat's pass dots did not fill during a text run; a visible question over the choices and the predict answers.

  Decisions and deviations:
  - No `avanzar()`: Camino's moves are absolute (design rule 6), so the four arrows are `derecha()`/`izquierda()`/`arriba()`/`abajo()`; `saltar()` and `hay_piedra()` take no direction (every Camino jump and "si" goes right). The brief's `avansar()` typo became `drecha()` (a slip of a real name, so "¿Será «derecha»?" can be said).
  - `else:` exists only in the text (the blocks have no "si no"); no item uses it. A loop cannot hold a loop, an if cannot hold an if (the editor's one level of nesting).
  - Events: `probe: 'text'` as the T8 brief says (T7's note suggested `'text_probe'`; the activity id stays `text_probe`). `text_item` per answer/solve/leave (an edit item left and solved later has both rows; the view counts each item once). `correct` on a solved edit item is false when ✋ 3 wrote the fix (`ghost_fixed: true`). Added `text_edit` {ghost: true} for the ghost's edit, `reason`, `adult_helped`, `attempt` on runs, `links` in the tour's phase. A predict item's automatic run is not a `text_run`.
  - Choices are final after the pick (like T7's predictions, never marked right or wrong to the child); revisiting shows the pick. The typo items hide the blocks (they would give the fix away); number and write show them, live.
  - Next page: once the item is finished, or after 2 min (number/typo) / 30 s (the stretch); it goes to the next unfinished item, then the liking question; after 12 minutes in the items, next goes to the liking question.
  - The editor: Tab inserts 4 spaces, Enter keeps the indentation (+4 after `:`), Backspace in the indentation removes 4, like a Python editor; its keydown events stop at the editor (the dev keys already ignore textareas; the typing game's capture listener is only mounted in its own step). Text is stored lowercased, only `a-z0-9_():`, spaces and newlines, ≤ 500 characters.
  - The code font is the system monospace (`ui-monospace`, DejaVu Sans Mono, Cousine, Noto Sans Mono…), not a self-hosted font: nothing is fetched from outside.

  Open: never tried with real children, voices, a touch Chromebook or its on-screen keyboard (the textarea opens it; `autocorrect`/`autocapitalize` are off, but Gboard-style composition only went through the `isComposing` guard in reasoning, not on hardware); whether an auto-focused editor opens the on-screen keyboard at once on a Chromebook is untested. The row boards keep the sky frame, so the strip is small on the predict page. The blocks item's pen ring is wide over the card. The probe's length (~8–10 min) is a guess. The local dev DB of the checks holds many 5to sessions from the screenshot tour (disposable container, now stopped). Engram mirror still pending.

  For T9 (verification and deploy):
  - The 5to scripted session can open the text probe card and do a short path (one predict, the number item, `__tx.go('liked')`); `tools/check-texto.mjs` covers the full probe. `window.__tx` (stage, go, item, finished) and `window.__txe` (text, setText, run, help) exist with `?debug`.
  - Screenshots: `pp-tx-` prefix in `tools/shots-piloto.mjs`; the 5to menu now has four cards.
  - Migration 005 runs at start (idempotent); the live DB gets it on the next deploy.

- 2026-10-01: T9 local part done (route: delegated direct, one writer; 2+ non-trivial files); T9 stays open for the live part. Work-unit commits on `feat/prueba-piloto` (not pushed):
  - `27344fc` service worker (playtest build only): `src/playtest/serviceWorker.ts` generates `dist/sw.js` at build (vite plugin in `vite.config.ts`): precaches the shell and every hashed `assets/*` file (JS, CSS, fonts) in a cache named after the build, network-first navigations with the cached shell when the network fails or takes > 4 s, cache-first assets, never `/api` or `/admin`, old caches deleted on activate; registered only when `VITE_PLAYTEST=1` (also on `?debug`, it does not interfere); the API serves `/sw.js` with `no-cache`. 8 unit tests run the generated worker against fake caches and fetch.
  - `f2911cc` resume after a reload (`src/playtest/resume.ts`, 7 tests): without it a reload (offline or not) sent the adult back to the setup and the same child became a second session. The tab keeps the flow, the playtest's progress and the ladder's/free play's state in `sessionStorage`; a reload opens on the same step (the ladder carries on with the item on screen, free play keeps its clock and visit count) and logs `resume` {step, since_save_ms, step_ms}. Dictionary updated (`resume`, `abandoned`, the offline reload).
  - `bd44277` the free-play menu's board thumbnails (and the survey's pictures of them) draw the child's character instead of Brote (`ThumbCharacterContext` in `src/ui/thumbs.tsx`).
  - `1df236c` the free rule page `pp-reglas` (10 blocks) lost its last moves and "sumar 1 punto" below the palette at 1366×768, so it could not be won by scoring: a rule palette of > 8 blocks lays its actions two by two.
  - `ab1e2cb` the survey's "¿Qué te gustó más?" with 9–10 activities ran off the right edge: rows of five.
  - `fd3ea2a` `tools/check-session.mjs`, `tools/check-session-data.mjs`, `tools/delete-sessions.mjs`, dictionary lines.

  New tools (no secret needed except the delete helper, which reads the credentials file itself):
  - `tools/check-session.mjs [base] [1ro 5to 3ro]`: full scripted sessions through the real UI with the `?debug` hooks; prints `SESSION_IDS=…` last. First it opens the root without `?debug` (setup, no dev tab). 1ro (Pliegue): tool check (tap, ▶, drag, ↺, ✋), ladder 1✓ 2✓, rung 3 OFFLINE (helps 1–3, 🔊, raised hand, adult's "hint"), reload while offline (the SW opens the app, the session carries on at rung 3), two failed runs (ceiling 2), online; free play sheet 6 (2 pages), recess, guardas, workshop; typing (30 s); wardrobe; survey; goodbye; adult form. 5to (Mina): tool check, ladder 9✓ 10✓ 11✗ (ceiling 10); workshop 15 (5 lines refused, 2 lines, test page `repetir 5 [→]`, pinned); OFFLINE: text probe (tour, 2 predictions, number item), reload on the menu (free play resumes), game maker from the adult's corner (a game, a chip edit, 3 predictions, liking); online; typing (15 s, words); closing. 3ro (Ovillo): ladder 5✓ 6✓ 7✗ (ceiling 6); the rule game's three pages 3ro-1, 3ro-2 and `pp-reglas` won (closes the T5/T6 gap: the free page played through), sheet 13; typing; closing. `SHOTS=<dir>` and `VIEWPORT=WxH` make it the screenshot tour.
  - `tools/check-session-data.mjs <exports/playtest-…> <SESSION_IDS>`: the sessions in an export (JSON + both CSVs): completed, survey (4 answers), adult form, seq 0..n-1, expected event types per grade, ladder ceiling, resume, adult help, workshop 15, probes, rule game pages; with `PSQL`, every view.
  - `tools/delete-sessions.mjs <SESSION_IDS>`: `DELETE /api/admin/sessions/:id` per id, `ADMIN_TOKEN`/`PLAYTEST_URL` from `~/.credentials/camino-prueba.env`.

  Evidence:
  - `npm run typecheck` clean; `npm test` 35 files, 1022 tests; `npm run build` ok (also `VITE_PLAYTEST=1`: `dist/sw.js`); `npm run test:api` 25/25 (disposable `camino-prueba-t9db` on 54340, database `apitest`).
  - Regressions against vite dev 8811 (API → the compose app on 8810, `PSQL` → its db), after the last fix: `check-primer` 37 ok, `check-3ro` 8 ok, `check-piloto` 122 ok, `check-juego` 48 ok, `check-texto` 46 ok, all exit 0, no console errors.
  - Offline reload with the server really down: `docker stop camino-prueba`, reload → the app opened from the SW cache on the same step, 5 events queued; `docker start` → queue drained, `resume` row in Postgres.
  - Production-like run: `docker compose -f docker-compose.prueba.yml -f docker-compose.prueba.override.yml -p camino-prueba-local up -d --build` (gitignored `.env` with fresh random secrets, gitignored override publishing `app` on 8810). `check-session.mjs http://127.0.0.1:8810/ 1ro 5to 3ro` passed at 1366×768 and at 1280×800 (6 sessions, all checks ok, ~3–3.5 min each; offline stretches: 1ro 17 events waiting / 3 failed posts, 5to 24 / 5–6; no page errors). Postgres: 1ro 91 events, 5to 90 and 87, 3ro 69, seq without gaps; every session `completed` with survey and adult form. Event types: 1ro `activity_end adult_help call_adult choice drag garden_view ghost_demo help ladder_end ladder_step level_end level_start resume run speak step survey_answer tap_add tool_check typing typing_end visibility wardrobe`; 5to also `game_run probe_end probe_phase rule_edit scratch_predict text_item text_run resume`. Views: `v_session_summary` (ceilings 2/10/6, levels won 6/4/6, 1ro calls_to_adult 1 adult_helps 1), `v_ladder_ceiling` agrees, `v_activity_time` (1ro sheet 25 s, recess 10–11, guardas 2, editor 3–4, ladder 34–35, typing 35; 5to editor 28–29, text_probe 25, game_maker 21; 3ro rule_game 89), `v_typing_by_grade` (1: 73.5 %, 3: 75 %, 5: 89.6 %), `v_probe_game_maker` (1 edit, 3/3 predictions, liked mid), `v_probe_text` (3 tried, 3 correct, number 1, liked yes), both `_by_grade` views.
  - Export: `HOME=<temp dir with a fake .credentials/camino-prueba.env: PLAYTEST_URL=http://127.0.0.1:8810 and the local EXPORT_TOKEN/ADMIN_TOKEN> node tools/export-playtest.mjs` → JSON + two CSVs; `check-session-data.mjs` on it for the 6 sessions: 103 checks ok (JSON rows = CSV rows per session).
  - `/admin` (chromium, the local token): 23 rows, each with its step (`adult_form`, one abandoned test at `free_play` shows `inactiva`) and event count; "Borrar" on «Ciervo 37» (confirm accepted): status "Sesión «Ciervo 37» borrada.", its 69 events → 0, session row gone, row gone from the page.
  - Screenshot tour from the production build on 8810: `SHOTS=… VIEWPORT=1366x768|1280x800 node tools/check-session.mjs http://127.0.0.1:8810/ 1ro 5to 3ro` — 106 screenshots per size (212), every step of the flow for 1ro (34), 5to (42), 3ro (29) plus the no-debug setup. Final set: `/tmp/claude-1001/-home-opencode-projects/e58e1d0b-fcd5-568a-b528-b6d42729b830/scratchpad/tour-t9/` (`<grade>-<nn>-<step>-<width>.png`; session-scoped scratch, regenerate with the command above). Reviewed with the Read tool; no dev badge (none without `?debug`; with `?debug` the tour hides the tab), no English or ids shown to the child. Fixed from it: the menu thumbnails' Brote, the free rule page's palette, the survey's overflowing favourites (commits above).

  Open (judgment calls, not changed):
  - T7's third Scratch prediction: the three answers draw the same scene (the stone touching the character, the bird) and differ only in who speaks (bubble "¡ay!", "…", "¡Cuidado!"). That is the question ("¿quién habla?"), so it is not a bug; the adult may still watch whether children read `enviar`/`al recibir` or pick a bubble.
  - A reload restarts the step it happened on (the tool check, the typing game, the wardrobe, the survey, an open free-play activity; the page that was open has a `level_start` without `level_end`); a raised hand is not raised again after a reload.
  - The character screen's bar shows the session code in small print ("Prueba piloto · personaje / Abeja 86 · 1ro"): adult-facing, pre-existing, left.
  - Playwright's `setOffline` may not stop the service worker's own fetches; the true-offline proof is the local `docker stop` run above. Never tried on a real Chromebook with the network cut.
  - Engram mirror still pending.

  Live part for the parent (after pushing and deploying this branch):
  1. `PW=/home/opencode/.render-tools node tools/check-session.mjs https://camino-prueba.becode.com.ar/ 1ro 5to 3ro` (≈ 11 min; note the `SESSION_IDS=` line).
  2. `node tools/export-playtest.mjs` then `node tools/check-session-data.mjs exports/playtest-<stamp> <SESSION_IDS>` (no `PSQL`: the views are checked locally only).
  3. `node tools/delete-sessions.mjs <SESSION_IDS>`; export again and confirm they are gone.
  4. Coolify status `running:healthy`; `curl -sI https://camino-prueba.becode.com.ar/sw.js` shows `cache-control: no-cache` (Cloudflare must not cache it long).

## Next step

T9 live part (the parent): push, deploy, the live commands above, then check T9 off.
