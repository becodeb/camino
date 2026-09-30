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

- [ ] T1 (P0) API and data: Node API (Hono) serving the built front end and `/api`; idempotent migrations; `sessions`/`events`; sync endpoint idempotent on (session_id, seq); admin and export endpoints with tokens; retention; `Dockerfile.prueba`, `docker-compose.prueba.yml`; self-hosted fonts; data dictionary and SQL views; `tools/export-playtest.mjs`. Checks: API tests against Postgres, compose up locally.
- [ ] T2 (P0/P1) Playtest shell and telemetry client: offline queue with batched retries; adult setup and session code; flow state machine; character choice; instrumentation hooks in the level player (level_start, run, level_end, help, ghost_demo, speak, drag, tap_add, idle, visibility, error); hidden adult controls; raised hand (`call_adult`) and `adult_help`; survey; adult form; goodbye; admin page.
- [ ] T3 (P0) First deploy: push, create the Coolify app, env vars, domain, verify `running:healthy` and a sync + export against the live URL.
- [ ] T4 (P1) Tool check and placement ladder: two tiny tool levels; fixed item bank by concept with grade entry points and the step-up / floor rules; `ladder_step` events.
- [ ] T5 (P2) Free-play menu (existing activities by grade), wardrobe step with compressed thresholds, session garden.
- [ ] T6 (P2) Typing minigame "Teclas del bosque" (new art).
- [ ] T7 (P3) 4to probe "Hacé tu juego" (rule engine extended: objects, score, lives, win/lose, avisar; Scratch equivalents; predict a Scratch script).
- [ ] T8 (P3) 5to probe "Del bloque al texto" (blocks and Python-like text side by side; predict, change a number, fix a typo).
- [ ] T9 Verification and final deploy: screenshot tours (1ro, 3ro, 5to at both sizes), scripted full 1ro and 5to sessions with an offline stretch confirming DB rows and export, locally and live.

## Progress

- 2026-09-30: worktree and branch created from `feat/primer-grado` (fe6a277); code mapped; this document created before the first source write.

## Next step

T1.
