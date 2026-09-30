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
- [ ] T5 (P2) Free-play menu (existing activities by grade), wardrobe step with compressed thresholds, session garden.
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

## Next step

T5 (free-play menu, wardrobe, session garden).
