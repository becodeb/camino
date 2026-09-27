# Feature: primer-grado

Locator: `odd/tasks/primer-grado.md` (Engram mirror: project `camino`, topic `odd/primer-grado/tasks` — pending, see Constraints)

## Objective

A presentable demo of the whole 1st-grade year of Camino (17 sheets, "Repetir", forest and river zones) that the teacher can show at the school, plus a dev mode to jump anywhere and test it.

## Problem

The current demo has 2 levels per grade. To show the school how a real year works, 1st grade needs its full plan: every sheet with its core, generated extras and boss, the new practice formats, the workshops, the recess and showcase sheets, and the motivation layer (garden, critters, wardrobe).

## Source plan

The approved activities plan (Claude Docs "Plan de actividades de Camino", section "1er grado · Repetir" and "Cómo funciona cada clase" / "Juego y motivación"). The 17 sheets:

| # | Sheet | What kids do |
|---|---|---|
| 1 | Llegada al bosque | Review sala 5 plans; choose character |
| 2 | Caminos largos | 8–12 step plans collecting things in order |
| 3 | Brote se confundió | Fix and predict, still without repeat |
| 4 | Otra vez | Not enough lines → repeat with one block |
| 5 | ¿Cuántas veces? | Complete the count; count passes with the dots |
| 6 | La escalera | Repeat a two-block pattern |
| 7 | Taller: mi primer nivel | Create a level classmates play |
| 8 | Zigzag | Three-block patterns |
| 9 | Recreo: música | Build a song; the chorus is a repeat |
| 10 | Vuelta: el río | Review repeat in the new zone |
| 11 | Ahorrá | Find the pattern in their own solution; gold stamp |
| 12 | El repetir roto | Fix a wrong count or an extra block inside |
| 13 | Antes y después | Steps, a repeat, then steps again |
| 14 | Guardas | Repeat to draw notebook borders |
| 15 | Taller: un nivel con límite | A block-limited level for a classmate |
| 16 | Comodín | Recess or catch-up |
| 17 | Muestra | Teach their family a level; tour their garden |

## Scope (authorized 2026-09-27)

- Work in `~/projects/camino` on branch `feat/primer-grado` (branched from `feat/demo-recorrido` at 174fda4). Keep the existing 10-level demo reachable.
- Per sheet: core (3–4 short levels, 1–2 marked essential), generated extras of the same topic behind three doors (easy / medium / hard), a handmade optional boss. Five practice formats: solve, complete, fix, predict, save blocks (gold stamp).
- Progress stored locally in the browser for one player (accounts come next iteration). Wrap storage in try/catch; the app must work without it.
- Dev mode (always available in this demo): jump to any sheet/level/extra/boss, mark solved, skip, reset progress, set the "sheet opened by the teacher", grant seeds and items, open the wardrobe anytime. Clearly marked as dev.
- Motivation layer for 1ro: garden (each solved level plants a seed, stamps grow rare flowers, bosses send critters: carpincho, lechuza, pájaro carpintero, rana, coatí, zorro), wardrobe (Brote, Mina, Pliegue, Ovillo + zone items: gorro de hongo, capa de hoja, botas de lluvia, mochila de explorador), end-of-sheet preview card.
- Out of scope (next iteration): accounts, teacher dashboard, automatic reports, help detection, adaptations (slower pace, starting sheets back, new students), class tree.

## Design rules

The approved rules of `odd/tasks/demo-recorrido.md` still apply (drawn habilidades universe, full width, three controls, no reading required, blocks with picture + one word in 1ro, absolute arrows, palette = level blocks, diegetic failure, ghost hand for new concepts, ≥ 48 px targets).

## Art rule

All new art is designed by Opus with the style references: `docs/style-guide.md` (habilidades docs/05), `docs/screen-layout.md` (habilidades docs/17), `docs/style-refs/*.png` (habilidades screen + current camino screens), and the existing drawing code (`src/ink/*`, `BoardView`). Art is drawn in code (SVG), like the rest of the app.

## Constraints

- Raspberry Pi: one writer at a time; vitest `--maxWorkers=2`.
- The parent keeps a dev server on port 8797 for the user: writers use port 8798 for their own checks and never kill the 8797 process.
- Code, comments, docs, commits in English; kid-facing copy and speech in Rioplatense Spanish.
- Engram mirror pending: the engram MCP resolves `~/projects` as an ambiguous project and does not offer `camino`.
- Advisory: ~400 authored changed lines per task is a planning heuristic, not a cap.

## Checks

- TDD: off (no project/session configuration). Runner: vitest.
- Per task: `npm run typecheck`, `npm test`, `npm run build`, screenshots reviewed by the writer and re-checked by the parent.
- RDD: off globally by the user.

## Tasks

- [ ] T1 — Curriculum model (sheet/core/extras/boss), local progress store, dev mode, 1ro forest map with 17 sheets, sheet screen with three doors, extras generator (solve + repeat families), sheets 1, 2, 4, 6, 8 fully built (existing 1ro-1/1ro-2 folded in). Route: delegated direct.
- [ ] T2 — Formats complete / fix / predict / save (gold stamp), extras for those families; sheets 3, 5, 10, 11, 12, 13; river zone. Route: delegated direct.
- [ ] T3 — New mechanics: guardas painting (14), music (9), level editor + classmates' gallery (7, 15), comodín (16). Route: delegated direct.
- [ ] T4 — Motivation: garden, critters, wardrobe, end-of-sheet preview, showcase sheet (17). Route: delegated direct.
- [ ] T5 — Parent pass: full screenshot tour, presentation script for the school, LAN instructions.

## Progress

- 2026-09-27: branch `feat/primer-grado` created; style references copied into `docs/`.

## Next step

Launch T1.
