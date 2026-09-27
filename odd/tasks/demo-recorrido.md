# Feature: demo-recorrido

Locator: `odd/tasks/demo-recorrido.md` (Engram mirror: project `camino`, topic `odd/demo-recorrido/tasks`)

## Objective

A playable demo of one unified kids' programming platform (sala de 4 → 3er grado) with two levels per grade, to test whether each grade's concept can be learned in this format before building the real platform.

## Problem

The school chains ScratchJr, Pilas Bloques, Code.org and Scratch. Each year changes tool, login, character and block vocabulary; concepts (repeat, if, events) arrive without a problem that makes them necessary; kids reach Scratch in 3rd grade with a "story" mental model that does not fit games.

## Scope (authorized 2026-09-27)

- New app in `~/projects/camino`. Visual language, character (Brote), drawing helpers, block shapes, drag/snap editor, board animation, speech and ghost hand are **copied** from `~/projects/habilidades` (commit `9b90d1d`, branch `feat/aprender-a-programar`). Never write to habilidades: another session works there.
- 10 levels: 2 per grade (sala 4, sala 5, 1ro, 2do, 3ro), as approved:

| Grade | Level 1 | Level 2 |
|---|---|---|
| Sala 4 | Direct control: big arrows take Brote to the seed | Same, avoiding a rock |
| Sala 5 | Plan 3 picture cards, then ▶ | 5-step plan: collect the seed and reach the goal |
| 1ro | Long path, not enough lines: ghost hand shows "repeat" | Staircase: repeat [→ ↑] |
| 2do | Fog: "repeat until goal" + "if rock, jump" | Same program must work in 3 worlds at once |
| 3ro | "When I press an arrow, Brote moves" (first game) | "Whenever Brote touches a seed, +1 point" |

- Out of scope: login, persistence, teacher view, offline/file:// delivery, level creation, Recreo/Muestra modes.

## Design rules (approved 2026-09-27)

1. One drawn universe: habilidades' paper/ink style (docs/05). No gradients, glass, generic icons, blurred shadows.
2. Full width, one row: narrow palette left, notebook program center, large board right. Sala 4 has no program: board takes almost the whole screen.
3. Exactly three persistent controls: ▶ Probar, ↺ Volver a empezar, ✋ Ayuda. No step button, zoom, menus, "see solution".
4. No reading required: instruction is spoken (🔊) and drawn; the title is for the adult.
5. Blocks grow with the kids: sala 5 picture only; 1ro picture + one word; 2do-3ro word + picture. Always stacked vertically, top to bottom.
6. Absolute arrow directions (↑↓←→). No relative turns.
7. Palette shows only the level's blocks. No categories.
8. Block limit shown without numbers: the notebook has exactly N lines/slots.
9. The running block is highlighted; failure is diegetic (Brote bumps/stops, the culprit block shakes). Never "incorrect".
10. New concepts are introduced by the ghost hand, no text. Tap-to-add equals drag. Touch targets ≥ 48 px.
11. Level progress: the tramo's pages at the top, completed with a stamp.

## Constraints

- Raspberry Pi: vitest with `--maxWorkers=2`; at most one writer at a time.
- Dev server on port 8797 (`--host 0.0.0.0 --strictPort`). 8795/8796 belong to habilidades.
- Artifacts (code, comments, docs) in English; kid-facing UI copy and spoken instructions in Rioplatense Spanish (es-AR), like habilidades.
- Advisory: ~400 authored changed lines per task is a planning heuristic, not a cap.

## Checks

- TDD: off (source: no project/session configuration; habilidades uses vitest but that does not enable TDD). Runner: vitest.
- Per task: `npm run typecheck`, `npm test`, `npm run build`, plus screenshots of every touched level reviewed by the parent (chromium headless; the 500 px clamp does not matter at desktop widths).
- RDD: off globally by the user (2026-09-23); no native review.

## Tasks

- [x] T1 — Scaffold + port the shell, style, Brote, board and editor from habilidades; level runtime and level-select page; Sala 4 (direct control) and Sala 5 (sequence) levels. Route: delegated direct (writer trigger: 2+ non-trivial files).
- [ ] T2 — 1ro (repeat, slot-limited notebook, ghost-hand intro) and 2do (fog, repeat-until, if; three worlds at once). Route: delegated direct.
- [ ] T3 — 3ro real-time rules engine: key events and "whenever touches" rules with a score. Route: delegated direct.
- [ ] T4 — Parent pass: full screenshot tour, fixes list, LAN test instructions for the user.

## Progress

- 2026-09-27: repo created (`main` empty root commit, branch `feat/demo-recorrido`). Feature document created.
- 2026-09-27: T1 done (delegated writer). Commits `bbc4e40` (scaffold + ported style), `104016c` (level runtime, engine, editor model, tests), `e29c013` (home, level screen, sala 4 and sala 5).
  - Checks: `npm run typecheck` clean; `npm test` 3 files, 45 tests passed; `npm run build` ok (JS 321 kB, 101 kB gzip). Screenshots of every level (idle, mid-run, bump, closed pot, short, win, help) at 1366×768, 1280×800 and 1920×1080 via `tools/shots.mjs`: no console errors, no horizontal or vertical page scroll.
  - Decisions: a pot that still waits for its seed is closed and Brote bumps its lid (diegetic "seed first"); direct mode (sala 4) has no Probar, only ↺ and ✋ plus the arrows; the bar shows the whole tramo (10 pages, pages of grades not built yet drawn dashed); failure marks are a small ink burst with a yellow star, never a red cross.
  - Runtime for T2/T3: add a `LevelDef` to `LEVELS` in `src/game/levels.ts`; commands `jump:<dir>`, `ifrock:<dir>` and loops (`count` number or `'goal'`) already run in the engine; palette ids `repeat` / `repeat-goal`; `worlds[]` and `fog` exist in the type but the UI draws `worlds[0]` only; `mode: 'realtime'` falls back to the program screen until T3.
  - Engram mirror pending (engram MCP resolves cwd ~/projects as ambiguous).

## Next step

Parent review of the T1 screenshots, then launch T2.
